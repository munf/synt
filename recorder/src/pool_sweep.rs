//! Pool price of GRADUATED tokens after the poll window.
//!
//! `pool_poll.rs` polls a pair only until the token is 100 minutes old. Past
//! that point the stored pool price would freeze. This module keeps it fresh
//! for a week after graduation.
//!
//! How: ONE `eth_getLogs` for the `Sync` topic with an address filter holding
//! EVERY watched pair, every 60 s, from a block cursor to the head. The cost
//! is about 3 requests per minute whatever the number of pairs (331 addresses
//! in one request was accepted when measured), and every reserve change is
//! seen. Polling `getReserves` per pair costs a request per pair and misses
//! the extremes; a WebSocket subscription is billed per notification by most
//! providers (hundreds of thousands of `Sync` logs per day).
//!
//! - Stored per minute: the open / high / low / close `Sync` (at most 4 rows),
//!   so a one-minute candle built from these rows equals the candle built from
//!   every `Sync`, without one row per `Sync`.
//! - Quiet pairs: a "heartbeat" row (the confirmed state, no RPC) is moved
//!   forward every 5 minutes so the latest row stays recent. The heartbeat
//!   time is the timestamp of the block that was ACTUALLY swept (read on
//!   chain), so no unswept `Sync` can have an earlier time. A `Sync` in the
//!   same second overwrites or deletes the heartbeat row. A heartbeat is only
//!   written while the pair's state is CONFIRMED in this process (a `Sync` was
//!   seen, or `getReserves` was read AT the swept block) and the cursor has
//!   had no gap since; otherwise the pair is seeded again (round robin, the
//!   one waiting longest first).
//! - A failing `eth_getLogs` is split automatically (block range first, then
//!   the address list), for example when the response is too large.
//! - A pair stops being watched when: it graduated more than 7 days ago, its
//!   quote reserve is below 1% of the first recorded reserve (liquidity
//!   pulled), it reverts (not V2), or it is outside the 1,000 most recent
//!   graduations.
//!
//! The sweeper ONLY writes rows with `ts > created_at + POLL_WINDOW_SECS`
//! ([`may_write`]), so the two price writers never overlap.

use crate::abi;
use crate::decimals;
use crate::pool_poll::{self, RevertTracker};
use crate::rpc::{hex_u64, Rpc};
use anyhow::{anyhow, Result};
use serde_json::Value;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{info, warn};

pub const EVERY: Duration = Duration::from_secs(60);
/// Watch window since graduation.
pub const WATCH_WINDOW_SECS: f64 = 7.0 * 86400.0;
/// Cap on watched pairs (most recent graduations).
pub const MAX_PAIRS: i64 = 1000;
const ADDRESSES_PER_REQ: usize = 500;
/// Block range per `eth_getLogs`.
const BLOCKS_PER_REQ: u64 = 1000;
/// Further behind than this (about 30 min): the cursor jumps to the head and
/// every pair is seeded again (do not sweep hours of logs at once).
const MAX_BEHIND: u64 = 4000;
/// Stay this many blocks behind the head (shallow BSC reorgs).
const CONFIRMATIONS: u64 = 3;
/// A pair without a new row for this long gets a heartbeat row.
pub const HEARTBEAT_SECS: i64 = 300;
/// `getReserves` seeds per tick. A cold start with ~330 pairs takes ~17 min.
const SEEDS_PER_TICK: usize = 20;
/// Split depth for a failing `eth_getLogs` (2^6 = 64 pieces per range).
const SPLIT_MAX: u32 = 6;
/// Latest quote reserve below this fraction of the first one = liquidity gone.
pub const LIQUIDITY_GONE: f64 = 0.01;
/// The sweeper starts exactly where `pool_poll.rs` stops.
pub const START_AFTER_CREATED: f64 = pool_poll::POLL_WINDOW_SECS;
/// Average BSC block time, used only when a log carries no `blockTimestamp`.
const BLOCK_SECS: f64 = 0.45;

/// The sweeper may only write rows AFTER the poll window.
pub fn may_write(created: f64, ts: i64) -> bool {
    ts as f64 > created + START_AFTER_CREATED
}

/// (unix seconds, price, quote reserve): one `Sync`, ordered by (block, log index).
pub type Point = (i64, f64, f64);

/// The points kept per minute: open, high, low, close. A one-minute candle
/// built from these rows equals the candle built from ALL `Sync` logs. The
/// primary key `(token, ts)` has one-second resolution, so there is one row
/// per second, with priority close > high > low > open (the close is the
/// current price and must be right).
pub fn pick_ohlc(points: &[Point]) -> Vec<Point> {
    let mut out: Vec<Point> = Vec::new();
    for group in points.chunk_by(|a, b| a.0.div_euclid(60) == b.0.div_euclid(60)) {
        let high = group.iter().enumerate().max_by(|a, b| a.1 .1.total_cmp(&b.1 .1)).map(|x| x.0);
        let low = group.iter().enumerate().min_by(|a, b| a.1 .1.total_cmp(&b.1 .1)).map(|x| x.0);
        let mut picked: Vec<Point> = Vec::new();
        for i in [Some(group.len() - 1), high, low, Some(0)].into_iter().flatten() {
            let t = group[i];
            if !picked.iter().any(|p| p.0 == t.0) {
                picked.push(t);
            }
        }
        picked.sort_by_key(|p| p.0);
        out.extend(picked);
    }
    out
}

/// SQL for the list of watched pairs. `NOT (a > 0 AND z < ...)` is NULL for a
/// pair with NO `pool_prices` row (LEFT JOIN gives NULL) and would filter the
/// pair out: exactly the tokens that graduated after the poll window and so
/// never had a pool price. `coalesce` turns "unknown" into "not gone".
pub const LIST_SQL: &str = "SELECT g.token, lower(g.pair), extract(epoch FROM t.created_at)::float8, t.quote,
        extract(epoch FROM z.ts)::float8
   FROM graduations g
   JOIN tokens t USING (token)
   LEFT JOIN LATERAL (SELECT p.quote_reserve FROM pool_prices p WHERE p.token = g.token
                       ORDER BY p.ts LIMIT 1) a ON true
   LEFT JOIN LATERAL (SELECT p.quote_reserve, p.ts FROM pool_prices p WHERE p.token = g.token
                       ORDER BY p.ts DESC LIMIT 1) z ON true
  WHERE g.pair IS NOT NULL
    AND g.block_time > now() - make_interval(secs => $1)
    AND t.created_at <= now() - make_interval(secs => $2)
    AND NOT coalesce(a.quote_reserve > 0 AND z.quote_reserve < $3 * a.quote_reserve, false)
  ORDER BY g.block_time DESC LIMIT $4";

/// One sweep piece: (from block, to block, address index [start, end), split depth).
type Piece = (u64, u64, usize, usize, u32);

/// Split a failed piece: block range first, then the address list.
/// `None` = cannot (or may not) be split further.
pub fn split(p: Piece) -> Option<(Piece, Piece)> {
    let (a, b, i, j, d) = p;
    if d >= SPLIT_MAX {
        return None;
    }
    if b > a {
        let m = a + (b - a) / 2;
        return Some(((a, m, i, j, d + 1), (m + 1, b, i, j, d + 1)));
    }
    if j - i > 1 {
        let m = i + (j - i) / 2;
        return Some(((a, b, i, m, d + 1), (a, b, m, j, d + 1)));
    }
    None
}

struct Watched {
    token: String,
    created: f64,
    factor: f64,
    token_is_0: Option<bool>,
    /// Latest (price, reserve) CONFIRMED in this process.
    state: Option<(f64, f64)>,
    /// Second of this token's newest row (Sync, seed, heartbeat, or read from
    /// the database when the pair was added).
    last_write: i64,
    /// The sweeper's own heartbeat row that may still be moved.
    heartbeat: Option<i64>,
    /// Last seed attempt (round robin: never tried or oldest first).
    seed_tried: Option<Instant>,
}

#[derive(Default)]
struct Stats {
    logs: u64,
    rows: u64,
    heartbeats: u64,
    seeds: u64,
    splits: u64,
    errors: u64,
}

#[derive(Default)]
struct Sweeper {
    /// Key = pair address (lowercase).
    pairs: HashMap<String, Watched>,
    cursor: Option<u64>,
    tracker: RevertTracker,
    no_decimals: HashSet<String>,
    n: Stats,
}

/// Start delay: let the recorder finish its restart backfill first (the RPC
/// throttle is shared).
const START_DELAY: Duration = Duration::from_secs(90);

pub async fn run(rpc: Arc<Rpc>, pool: PgPool, decimals: decimals::Shared) -> Result<()> {
    tokio::time::sleep(START_DELAY).await;
    let mut p = Sweeper::default();
    let mut tick = tokio::time::interval(EVERY);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut report = Instant::now();
    loop {
        tick.tick().await;
        if let Err(e) = p.tick(&rpc, &pool, &decimals).await {
            p.n.errors += 1;
            warn!("pool sweep: {e:#}");
        }
        if report.elapsed() >= Duration::from_secs(300) {
            report = Instant::now();
            let n = std::mem::take(&mut p.n);
            info!(
                "pool sweep 5 min: pairs {}, confirmed {}, Sync {}, rows {}, heartbeats {}, seeds {}, splits {}, errors {}",
                p.pairs.len(),
                p.pairs.values().filter(|x| x.state.is_some()).count(),
                n.logs,
                n.rows,
                n.heartbeats,
                n.seeds,
                n.splits,
                n.errors
            );
        }
    }
}

impl Sweeper {
    async fn tick(&mut self, rpc: &Rpc, pool: &PgPool, decimals: &decimals::Shared) -> Result<()> {
        self.refresh(pool, rpc, decimals).await?;
        let head = rpc.block_number().await?.saturating_sub(CONFIRMATIONS);
        // The time of block `head` is read on chain (1 request per minute):
        // heartbeats and seeds are written EXACTLY at the time of the swept
        // block, not at wall clock time.
        let t_head = rpc.block_time(head).await? as i64;
        let mut swept = false;
        match self.cursor {
            None => self.cursor = Some(head),
            // Lagging node or no new block: do not seed (the state at `head`
            // is older than what was already swept) and do not heartbeat.
            Some(k) if head <= k => return Ok(()),
            Some(k) if head - k > MAX_BEHIND => {
                warn!("pool sweep: {} blocks behind; cursor jumps to the head, every pair is seeded again", head - k);
                for x in self.pairs.values_mut() {
                    x.state = None;
                    x.heartbeat = None;
                }
                self.cursor = Some(head);
            }
            Some(k) => {
                let logs = self.sweep(rpc, k + 1, head).await?;
                self.process(rpc, pool, logs, head, t_head).await?;
                self.cursor = Some(head);
                swept = true;
            }
        }
        // Here cursor = head: the state at block `head` matches what was swept.
        self.seed(rpc, pool, head, t_head).await;
        if swept {
            self.heartbeat(pool, t_head).await?;
        }
        Ok(())
    }

    /// Pair list from the database: graduated within 7 days, created outside
    /// the poll window, liquidity not gone, 1,000 most recent.
    async fn refresh(&mut self, pool: &PgPool, rpc: &Rpc, decimals: &decimals::Shared) -> Result<()> {
        let rows: Vec<(String, String, f64, Option<String>, Option<f64>)> = sqlx::query_as(LIST_SQL)
            .bind(WATCH_WINDOW_SECS)
            .bind(START_AFTER_CREATED)
            .bind(LIQUIDITY_GONE)
            .bind(MAX_PAIRS)
            .fetch_all(pool)
            .await?;
        let active: HashSet<&str> = rows.iter().map(|r| r.1.as_str()).collect();
        self.pairs.retain(|p, _| active.contains(p.as_str()));
        let active_tokens: HashSet<&str> = rows.iter().map(|r| r.0.as_str()).collect();
        self.tracker.prune(&active_tokens);
        self.no_decimals.retain(|t| active_tokens.contains(t.as_str()));
        for (token, pair, created, quote, z) in &rows {
            if self.pairs.contains_key(pair) {
                continue;
            }
            let f = match quote {
                Some(q) => decimals.lock().await.factor(pool, rpc, q).await?,
                None => None,
            };
            let Some(factor) = f else {
                // Retried every tick (the backoff lives in decimals.rs).
                if self.no_decimals.insert(token.clone()) {
                    warn!(
                        "pool sweep {token}: decimals of quote {} not known yet; the price is not watched",
                        quote.as_deref().unwrap_or("NULL")
                    );
                }
                continue;
            };
            self.no_decimals.remove(token);
            self.pairs.insert(
                pair.clone(),
                Watched {
                    token: token.clone(),
                    created: *created,
                    factor,
                    token_is_0: None,
                    state: None,
                    last_write: z.map(|w| w.floor() as i64).unwrap_or(0),
                    heartbeat: None,
                    seed_tried: None,
                },
            );
        }
        Ok(())
    }

    /// Every `Sync` log of the watched pairs in `from..=to`. A failing piece
    /// is split (blocks, then addresses) up to `SPLIT_MAX`; if it still fails
    /// the whole sweep fails (the cursor does not move, retried next tick).
    async fn sweep(&mut self, rpc: &Rpc, from: u64, to: u64) -> Result<Vec<Value>> {
        let addresses: Vec<String> = self
            .pairs
            .iter()
            .filter(|(_, x)| !self.tracker.is_skipped(&x.token))
            .map(|(p, _)| p.clone())
            .collect();
        let mut all = Vec::new();
        if addresses.is_empty() {
            return Ok(all);
        }
        let mut queue: Vec<Piece> = Vec::new();
        let mut a = from;
        while a <= to {
            let b = (a + BLOCKS_PER_REQ - 1).min(to);
            for i in (0..addresses.len()).step_by(ADDRESSES_PER_REQ) {
                queue.push((a, b, i, (i + ADDRESSES_PER_REQ).min(addresses.len()), 0));
            }
            a = b + 1;
        }
        queue.reverse();
        while let Some(p) = queue.pop() {
            let list: Vec<&str> = addresses[p.2..p.3].iter().map(String::as_str).collect();
            match rpc.logs(p.0, p.1, &list, &[abi::V2_SYNC]).await {
                Ok(l) => all.extend(l),
                Err(e) => match split(p) {
                    Some((x, y)) => {
                        self.n.splits += 1;
                        warn!("pool sweep: getLogs {}..{} ({} addresses) failed, splitting: {e:#}", p.0, p.1, p.3 - p.2);
                        queue.push(y);
                        queue.push(x);
                    }
                    None => return Err(e.context(format!("getLogs {}..{} ({} addresses)", p.0, p.1, p.3 - p.2))),
                },
            }
        }
        Ok(all)
    }

    async fn token0(&mut self, rpc: &Rpc, pair: &str) -> Result<bool> {
        let x = self.pairs.get(pair).ok_or_else(|| anyhow!("pair {pair} is not watched"))?;
        if let Some(b) = x.token_is_0 {
            return Ok(b);
        }
        let token = x.token.clone();
        let reply = rpc.call(pair, abi::SEL_TOKEN0).await.and_then(|h| {
            abi::address_reply(&h).ok_or_else(|| anyhow!("token0: invalid reply {h:.80}"))
        });
        match reply {
            Ok(t0) => {
                let b = t0 == token;
                if let Some(x) = self.pairs.get_mut(pair) {
                    x.token_is_0 = Some(b);
                }
                self.tracker.success(&token);
                Ok(b)
            }
            Err(e) => {
                if pool_poll::is_revert(&e) && self.tracker.reverted(&token) {
                    warn!("pool sweep {token}: pair {pair} reverts token0 (not V2?); not watched");
                }
                Err(e)
            }
        }
    }

    async fn process(&mut self, rpc: &Rpc, pool: &PgPool, logs: Vec<Value>, head: u64, t_head: i64) -> Result<()> {
        // (block, log index, pair, second, r0, r1)
        let mut sync: Vec<(u64, u64, String, i64, f64, f64)> = Vec::new();
        for l in &logs {
            let Some(pair) = l.get("address").and_then(Value::as_str).map(str::to_lowercase) else { continue };
            let block = l.get("blockNumber").map(hex_u64).transpose()?.unwrap_or(head);
            let idx = l.get("logIndex").map(hex_u64).transpose()?.unwrap_or(0);
            let ts = match l.get("blockTimestamp").map(hex_u64) {
                Some(Ok(t)) => t as i64,
                _ => t_head - ((head.saturating_sub(block)) as f64 * BLOCK_SECS) as i64,
            };
            let d = l.get("data").and_then(Value::as_str).unwrap_or("").trim_start_matches("0x");
            let (Some(w0), Some(w1)) = (d.get(..64), d.get(64..128)) else { continue };
            let (Some(r0), Some(r1)) = (abi::word_u128(w0), abi::word_u128(w1)) else { continue };
            sync.push((block, idx, pair, ts, r0 as f64, r1 as f64));
        }
        self.n.logs += sync.len() as u64;
        sync.sort_by_key(|s| (s.0, s.1));
        let mut per_pair: HashMap<String, Vec<(i64, f64, f64)>> = HashMap::new();
        for (_, _, pair, ts, r0, r1) in sync {
            per_pair.entry(pair).or_default().push((ts, r0, r1));
        }
        let (mut t, mut w, mut p, mut c) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        // A heartbeat row "overtaken" by a Sync with timestamp <= heartbeat is
        // deleted first.
        let (mut del_t, mut del_w) = (Vec::new(), Vec::new());
        for (pair, raw) in per_pair {
            if !self.pairs.contains_key(&pair) {
                continue;
            }
            let is0 = match self.token0(rpc, &pair).await {
                Ok(b) => b,
                Err(e) => {
                    // Sync logs were skipped, so the state is no longer
                    // guaranteed; it is seeded again later.
                    warn!("pool sweep {pair}: token0 failed, {} Sync skipped: {e:#}", raw.len());
                    if let Some(x) = self.pairs.get_mut(&pair) {
                        x.state = None;
                        x.heartbeat = None;
                    }
                    continue;
                }
            };
            let x = self.pairs.get_mut(&pair).expect("checked above");
            let points: Vec<Point> = raw
                .iter()
                .filter_map(|&(ts, r0, r1)| {
                    let (rt, rq) = if is0 { (r0, r1) } else { (r1, r0) };
                    decimals::pool_price(rt, rq, x.factor).map(|(h, cq)| (ts, h, cq))
                })
                .collect();
            let Some(&(ts_first, _, _)) = points.first() else { continue };
            let &(ts_last, h, cq) = points.last().expect("not empty");
            if let Some(d) = x.heartbeat {
                if ts_first <= d {
                    del_t.push(x.token.clone());
                    del_w.push(d as f64);
                }
            }
            x.state = Some((h, cq));
            x.last_write = x.last_write.max(ts_last);
            x.heartbeat = None;
            for (ts, h, cq) in pick_ohlc(&points) {
                if may_write(x.created, ts) {
                    t.push(x.token.clone());
                    w.push(ts as f64);
                    p.push(format!("{h:e}"));
                    c.push(format!("{cq:e}"));
                }
            }
        }
        if !del_t.is_empty() {
            sqlx::query(
                "DELETE FROM pool_prices p USING unnest($1::text[], $2::float8[]) AS u(t, w)
                  WHERE p.token = u.t AND p.ts = to_timestamp(u.w)",
            )
            .bind(&del_t).bind(&del_w)
            .execute(pool)
            .await?;
        }
        if !t.is_empty() {
            // DO UPDATE: a second that is split across two sweeps keeps the
            // value of the later sweep (more recent).
            let n = sqlx::query(
                "INSERT INTO pool_prices (token, ts, price, quote_reserve)
                 SELECT u.t, to_timestamp(u.w), u.p::numeric, u.c::numeric
                 FROM unnest($1::text[], $2::float8[], $3::text[], $4::text[]) AS u(t, w, p, c)
                 ON CONFLICT (token, ts) DO UPDATE SET price = EXCLUDED.price, quote_reserve = EXCLUDED.quote_reserve",
            )
            .bind(&t).bind(&w).bind(&p).bind(&c)
            .execute(pool)
            .await?
            .rows_affected();
            self.n.rows += n;
        }
        Ok(())
    }

    /// `getReserves` AT block `head` for pairs whose state is not confirmed,
    /// round robin: never tried or oldest attempt first.
    async fn seed(&mut self, rpc: &Rpc, pool: &PgPool, head: u64, t_head: i64) {
        let mut candidates: Vec<(Option<Instant>, String)> = self
            .pairs
            .iter()
            .filter(|(_, x)| x.state.is_none() && !self.tracker.is_skipped(&x.token))
            .map(|(p, x)| (x.seed_tried, p.clone()))
            .collect();
        candidates.sort();
        for (_, pair) in candidates.into_iter().take(SEEDS_PER_TICK) {
            if let Some(x) = self.pairs.get_mut(&pair) {
                x.seed_tried = Some(Instant::now());
            }
            if let Err(e) = self.seed_one(rpc, pool, &pair, head, t_head).await {
                self.n.errors += 1;
                let token = self.pairs.get(&pair).map(|x| x.token.clone()).unwrap_or_default();
                if pool_poll::is_revert(&e) {
                    if self.tracker.reverted(&token) {
                        warn!("pool sweep {token}: pair {pair} reverts getReserves (not V2?); not watched");
                    }
                } else {
                    warn!("pool sweep {token}: seed failed: {e:#}");
                }
            }
        }
    }

    async fn seed_one(&mut self, rpc: &Rpc, pool: &PgPool, pair: &str, head: u64, t_head: i64) -> Result<()> {
        let is0 = self.token0(rpc, pair).await?;
        let h = rpc.call_at(pair, abi::SEL_RESERVES, head).await?;
        let h = h.trim_start_matches("0x");
        let (Some(w0), Some(w1)) = (h.get(0..64), h.get(64..128)) else {
            return Err(anyhow!("getReserves reply too short"));
        };
        let r0 = abi::word_u128(w0).ok_or_else(|| anyhow!("r0"))? as f64;
        let r1 = abi::word_u128(w1).ok_or_else(|| anyhow!("r1"))? as f64;
        let x = self.pairs.get_mut(pair).ok_or_else(|| anyhow!("pair disappeared"))?;
        let (rt, rq) = if is0 { (r0, r1) } else { (r1, r0) };
        let (price, cq) = decimals::pool_price(rt, rq, x.factor).ok_or_else(|| anyhow!("token reserve is zero"))?;
        if may_write(x.created, t_head) {
            // State of block `head`, written at the time of block `head`.
            sqlx::query(
                "INSERT INTO pool_prices (token, ts, price, quote_reserve)
                 VALUES ($1, to_timestamp($2), $3::numeric, $4::numeric) ON CONFLICT DO NOTHING",
            )
            .bind(&x.token).bind(t_head as f64).bind(format!("{price:e}")).bind(format!("{cq:e}"))
            .execute(pool)
            .await?;
            x.last_write = x.last_write.max(t_head);
        }
        x.state = Some((price, cq));
        x.heartbeat = None;
        self.tracker.success(&x.token);
        self.n.seeds += 1;
        Ok(())
    }

    /// Confirmed pairs without a row for 5 minutes or more: one heartbeat row
    /// (latest state, no RPC) at the time of the swept block, MOVED forward.
    async fn heartbeat(&mut self, pool: &PgPool, t: i64) -> Result<()> {
        for x in self.pairs.values_mut() {
            let Some((price, cq)) = x.state else { continue };
            if t - x.last_write < HEARTBEAT_SECS || !may_write(x.created, t) {
                continue;
            }
            let (h, c) = (format!("{price:e}"), format!("{cq:e}"));
            let moved = match x.heartbeat {
                Some(old) => sqlx::query(
                    "UPDATE pool_prices SET ts = to_timestamp($3), price = $4::numeric, quote_reserve = $5::numeric
                      WHERE token = $1 AND ts = to_timestamp($2)
                        AND NOT EXISTS (SELECT 1 FROM pool_prices q WHERE q.token = $1 AND q.ts = to_timestamp($3))",
                )
                .bind(&x.token).bind(old as f64).bind(t as f64).bind(&h).bind(&c)
                .execute(pool)
                .await?
                .rows_affected(),
                None => 0,
            };
            let written = moved > 0
                || sqlx::query(
                    "INSERT INTO pool_prices (token, ts, price, quote_reserve)
                     VALUES ($1, to_timestamp($2), $3::numeric, $4::numeric) ON CONFLICT DO NOTHING",
                )
                .bind(&x.token).bind(t as f64).bind(&h).bind(&c)
                .execute(pool)
                .await?
                .rows_affected()
                    > 0;
            // A row at that second already exists (not ours): not our heartbeat.
            x.heartbeat = written.then_some(t);
            x.last_write = t;
            if written {
                self.n.heartbeats += 1;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sweeper_rows_never_enter_the_poll_window() {
        let created = 1_000_000.0;
        assert!(!may_write(created, created as i64));
        assert!(!may_write(created, (created + pool_poll::POLL_WINDOW_SECS) as i64));
        assert!(may_write(created, (created + pool_poll::POLL_WINDOW_SECS) as i64 + 1));
        assert_eq!(START_AFTER_CREATED, pool_poll::POLL_WINDOW_SECS);
    }

    #[test]
    fn ohlc_per_minute_keeps_the_candle() {
        // Minute 0: open 5, up to 9, down to 1, close 4. Minute 1: one Sync.
        let s = [(0, 5.0, 1.0), (10, 9.0, 1.0), (20, 1.0, 1.0), (30, 3.0, 1.0), (59, 4.0, 1.0), (61, 7.0, 1.0)];
        let p = pick_ohlc(&s);
        let w: Vec<i64> = p.iter().map(|x| x.0).collect();
        assert_eq!(w, vec![0, 10, 20, 59, 61]);
        let m0: Vec<f64> = p.iter().filter(|x| x.0 < 60).map(|x| x.1).collect();
        assert_eq!(m0.first(), Some(&5.0));
        assert_eq!(m0.last(), Some(&4.0));
        assert_eq!(m0.iter().copied().fold(f64::MIN, f64::max), 9.0);
        assert_eq!(m0.iter().copied().fold(f64::MAX, f64::min), 1.0);
    }

    #[test]
    fn split_blocks_first_then_addresses_then_stop() {
        let (x, y) = split((100, 199, 0, 400, 0)).unwrap();
        assert_eq!((x, y), ((100, 149, 0, 400, 1), (150, 199, 0, 400, 1)));
        let (x, y) = split((7, 7, 0, 400, 2)).unwrap();
        assert_eq!((x, y), ((7, 7, 0, 200, 3), (7, 7, 200, 400, 3)));
        assert!(split((7, 7, 5, 6, 0)).is_none(), "one block, one address");
        assert!(split((0, 999, 0, 400, SPLIT_MAX)).is_none(), "depth is capped");
    }

    #[test]
    fn list_sql_keeps_pairs_without_rows() {
        // The NULL comparison must be wrapped in coalesce(..., false).
        assert!(LIST_SQL.contains("NOT coalesce(a.quote_reserve > 0 AND z.quote_reserve < $3 * a.quote_reserve, false)"));
        assert!(LIST_SQL.contains("LEFT JOIN LATERAL"));
    }

    #[test]
    fn ohlc_same_second_prefers_the_close() {
        // High and close in the same second: the current price (close) is kept.
        let s = [(0, 2.0, 1.0), (5, 9.0, 1.0), (5, 3.0, 1.0)];
        let p = pick_ohlc(&s);
        assert_eq!(p, vec![(0, 2.0, 1.0), (5, 3.0, 1.0)]);
        assert!(pick_ohlc(&[]).is_empty());
    }
}
