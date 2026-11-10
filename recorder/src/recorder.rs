//! The recorder: ONE WebSocket log subscription on the four.meme TokenManager2
//! and the Flap Portal captures EVERY launch on both launchpads.
//!
//! A dropped connection must not become a silent hole in the data.
//! `sync_cursor.block_number` holds the last block that is CERTAINLY complete;
//! after a reconnect the missed range is filled with `eth_getLogs` (backfill).
//! Every insert is idempotent (`ON CONFLICT DO NOTHING`), so overlap between
//! the subscription and the backfill is harmless.

use crate::abi::{self, Event};
use crate::rpc::{hex_u64, Rpc};
use anyhow::{anyhow, bail, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, warn};

const TOPICS: [&str; 13] = abi::ALL_TOPICS;
/// Subscribed contracts: one subscription, several addresses in the filter.
const CONTRACTS: [&str; 2] = [abi::FOURMEME_TOKEN_MANAGER2, abi::FLAP_PORTAL];
/// Silence for this long = the connection is treated as dead. Both launchpads
/// are busy (tens of logs per minute), so 90 seconds without a single log is
/// not "a quiet market".
const SILENCE_MAX: Duration = Duration::from_secs(90);
/// `getPair` retries (seconds after a graduation receipt without `Sync`). The
/// four.meme pair shows up about 10 s after graduation; 60 s and 5 min cover
/// a lagging node or late liquidity. Strictly increasing (used as deltas).
pub const GET_PAIR_SCHEDULE: [u64; 3] = [15, 60, 300];
/// `pair_catchup`: every hour, graduations within 14 days, 100 tokens a round.
const CATCHUP_EVERY: Duration = Duration::from_secs(3600);
const CATCHUP_DAYS: i32 = 14;
const CATCHUP_MAX: i64 = 100;

#[derive(Default)]
pub struct Counters {
    pub created: AtomicU64,
    pub trades: AtomicU64,
    pub graduated: AtomicU64,
    pub malformed: AtomicU64,
    pub backfill_logs: AtomicU64,
    pub last_block: AtomicU64,
}

pub struct Recorder {
    pub rpc: Arc<Rpc>,
    pub pool: PgPool,
    pub wss: String,
    pub chunk: u64,
    pub counters: Arc<Counters>,
    block_times: Mutex<HashMap<u64, u64>>,
}

impl Recorder {
    pub fn new(rpc: Arc<Rpc>, pool: PgPool, wss: String, chunk: u64, counters: Arc<Counters>) -> Arc<Self> {
        Arc::new(Self { rpc, pool, wss, chunk, counters, block_times: Mutex::new(HashMap::new()) })
    }

    pub async fn run(self: Arc<Self>) -> Result<()> {
        loop {
            if let Err(e) = self.clone().session().await {
                warn!("WebSocket dropped: {e:#}; reconnecting in 3 s");
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    }

    async fn session(self: Arc<Self>) -> Result<()> {
        let (mut ws, _) = tokio_tungstenite::connect_async(&self.wss).await?;
        ws.send(Message::Text(
            json!({"jsonrpc":"2.0","id":1,"method":"eth_subscribe",
                   "params":["logs", {"address": CONTRACTS, "topics": [TOPICS]}]})
            .to_string(),
        ))
        .await?;

        // Subscribe FIRST, then backfill: a log emitted in between is caught
        // by one of the two (idempotent inserts), so there is no gap.
        let head = self.rpc.block_number().await?;
        let stored: Option<i64> = sqlx::query_scalar("SELECT block_number FROM sync_cursor WHERE id = 1")
            .fetch_optional(&self.pool)
            .await?;
        let backfill = match stored {
            None => {
                // First start: begin at the current block. Nothing is
                // "missed"; tokens created earlier are simply not recorded.
                self.save_cursor(head).await?;
                info!("first start: recording from block {head}");
                None
            }
            Some(b) if (b as u64) < head => {
                let s = self.clone();
                let from = b as u64 + 1;
                info!("backfill blocks {from}..={head} ({} blocks)", head - from + 1);
                Some(tokio::spawn(async move { s.backfill(from, head).await }))
            }
            Some(_) => None,
        };
        let mut backfill = backfill;
        let mut max_block = head;

        loop {
            let msg = match tokio::time::timeout(SILENCE_MAX, ws.next()).await {
                Err(_) => bail!("silent for {}s", SILENCE_MAX.as_secs()),
                Ok(None) => bail!("closed by server"),
                Ok(Some(p)) => p?,
            };
            let text = match msg {
                Message::Text(t) => t,
                Message::Ping(p) => {
                    ws.send(Message::Pong(p)).await?;
                    continue;
                }
                Message::Close(_) => bail!("close frame"),
                _ => continue,
            };
            let v: Value = serde_json::from_str(&text)?;
            if let Some(e) = v.get("error") {
                bail!("eth_subscribe rejected: {e}");
            }
            let Some(log) = v.pointer("/params/result") else { continue };
            self.process(log).await;
            if let Some(b) = log.get("blockNumber").and_then(|b| hex_u64(b).ok()) {
                max_block = max_block.max(b);
                self.counters.last_block.store(b, Ordering::Relaxed);
            }

            // The cursor only moves once the backfill is done. Otherwise a
            // crash in the middle of a backfill would skip the unfilled range.
            if let Some(h) = &backfill {
                if h.is_finished() {
                    let h = backfill.take().unwrap();
                    match h.await {
                        Ok(Ok(())) => info!("backfill done"),
                        Ok(Err(e)) => bail!("backfill failed: {e:#}"),
                        Err(e) => bail!("backfill panicked: {e}"),
                    }
                }
            }
            if backfill.is_none() {
                // Blocks before the block of the newest log are complete
                // (logs arrive in order).
                self.save_cursor(max_block.saturating_sub(1)).await?;
            }
        }
    }

    async fn save_cursor(&self, block: u64) -> Result<()> {
        sqlx::query(
            "INSERT INTO sync_cursor (id, block_number) VALUES (1, $1)
             ON CONFLICT (id) DO UPDATE SET block_number = GREATEST(sync_cursor.block_number, EXCLUDED.block_number),
                                            updated_at = now()",
        )
        .bind(block as i64)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn backfill(self: Arc<Self>, from: u64, to: u64) -> Result<()> {
        let mut a = from;
        while a <= to {
            let b = (a + self.chunk - 1).min(to);
            let mut attempt = 0;
            let logs = loop {
                // Address filter ONLY; topics are sorted out in `process`.
                // Some public RPC endpoints reject eth_getLogs with a topic
                // filter.
                match self.rpc.logs(a, b, &CONTRACTS, &[]).await {
                    Ok(l) => break l,
                    Err(e) if attempt < 5 => {
                        attempt += 1;
                        warn!("backfill {a}..{b} failed ({attempt}/5): {e:#}");
                        tokio::time::sleep(Duration::from_secs(2 * attempt)).await;
                    }
                    Err(e) => return Err(e),
                }
            };
            self.counters.backfill_logs.fetch_add(logs.len() as u64, Ordering::Relaxed);
            for l in &logs {
                self.process(l).await;
            }
            a = b + 1;
        }
        Ok(())
    }

    async fn block_time(&self, log: &Value, block: u64) -> Result<u64> {
        if let Some(t) = log.get("blockTimestamp").and_then(|t| hex_u64(t).ok()) {
            return Ok(t);
        }
        if let Some(t) = self.block_times.lock().await.get(&block) {
            return Ok(*t);
        }
        let t = self.rpc.block_time(block).await?;
        let mut c = self.block_times.lock().await;
        if c.len() > 5_000 {
            c.clear();
        }
        c.insert(block, t);
        Ok(t)
    }

    /// A log that fails to process does NOT stop the recorder, but it is
    /// always audible: a warning plus the `malformed` counter.
    async fn process(self: &Arc<Self>, log: &Value) {
        if let Err(e) = self.process_inner(log).await {
            self.counters.malformed.fetch_add(1, Ordering::Relaxed);
            warn!("log failed to process: {e:#}; tx {}", log.get("transactionHash").unwrap_or(&serde_json::Value::Null));
        }
    }

    async fn process_inner(self: &Arc<Self>, log: &Value) -> Result<()> {
        let s = |k: &str| log.get(k).and_then(Value::as_str).ok_or_else(|| anyhow!("log without {k}"));
        let topic0 = log.pointer("/topics/0").and_then(Value::as_str).ok_or_else(|| anyhow!("no topic"))?;
        let tx = s("transactionHash")?.to_lowercase();
        let idx = hex_u64(log.get("logIndex").ok_or_else(|| anyhow!("no logIndex"))?)? as i32;
        let block = hex_u64(log.get("blockNumber").ok_or_else(|| anyhow!("no blockNumber"))?)?;

        // Reorg: BSC finalises fast, but a removed log must still be deleted.
        if log.get("removed").and_then(Value::as_bool) == Some(true) {
            sqlx::query("DELETE FROM trades WHERE tx_hash = $1 AND log_index = $2")
                .bind(&tx)
                .bind(idx)
                .execute(&self.pool)
                .await?;
            return Ok(());
        }

        let Some(ev) = abi::decode(topic0, s("data")?) else {
            if abi::is_known(topic0) {
                bail!("malformed data for known topic {topic0}");
            }
            return Ok(());
        };
        let ts = self.block_time(log, block).await? as f64;

        match ev {
            Event::Created { creator, token, request_id, name, symbol, total_supply, launch_time, launch_fee } => {
                let new = sqlx::query(
                    "INSERT INTO tokens (token, creator, name, symbol, request_id, total_supply,
                        launch_time, launch_fee, block_number, tx_hash, created_at, launchpad)
                     VALUES ($1,$2,$3,$4,$5::numeric,$6::numeric,to_timestamp($7),$8::numeric,$9,$10,to_timestamp($11),'fourmeme')
                     ON CONFLICT (token) DO NOTHING",
                )
                .bind(&token).bind(&creator).bind(&name).bind(&symbol).bind(&request_id)
                .bind(&total_supply).bind(launch_time as f64).bind(&launch_fee)
                .bind(block as i64).bind(&tx).bind(ts)
                .execute(&self.pool)
                .await?
                .rows_affected()
                    > 0;
                if new {
                    self.counters.created.fetch_add(1, Ordering::Relaxed);
                    let s = self.clone();
                    tokio::spawn(async move { s.fill_info(token).await });
                }
            }
            Event::Trade { buy, token, account, price, amount, cost, fee, offers, funds } => {
                sqlx::query(
                    "INSERT INTO trades (tx_hash, log_index, token, side, account, price, amount, cost,
                        fee, offers, funds, block_number, block_time, launchpad)
                     VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,$9::numeric,$10::numeric,
                        $11::numeric,$12,to_timestamp($13),'fourmeme')
                     ON CONFLICT DO NOTHING",
                )
                .bind(&tx).bind(idx).bind(&token).bind(if buy { "B" } else { "S" }).bind(&account)
                .bind(&price).bind(&amount).bind(&cost).bind(&fee).bind(&offers).bind(&funds)
                .bind(block as i64).bind(ts)
                .execute(&self.pool)
                .await?;
                self.counters.trades.fetch_add(1, Ordering::Relaxed);
            }
            Event::TradeStop { token } => {
                self.record_graduation(&token, block, ts, &tx, "fourmeme", None).await?;
            }
            Event::LiquidityAdded { token, quote, funds } => {
                self.record_graduation(&token, block, ts, &tx, "fourmeme", None).await?;
                sqlx::query("UPDATE graduations SET quote = $2, funds = $3::numeric WHERE token = $1")
                    .bind(&token).bind(&quote).bind(&funds)
                    .execute(&self.pool)
                    .await?;
                let s = self.clone();
                tokio::spawn(async move { s.find_pair(token, quote, tx).await });
            }
            Event::FlapCreated { creator, token, name, symbol, meta } => {
                // Default quote = BNB (Flap docs: no TokenQuoteSet = the gas
                // token). A TokenQuoteSet in the same transaction overrides it.
                let new = sqlx::query(
                    "INSERT INTO tokens (token, creator, name, symbol, meta, block_number, tx_hash,
                        created_at, launchpad, quote, info_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8),'flap',$9,now())
                     ON CONFLICT (token) DO NOTHING",
                )
                .bind(&token).bind(&creator).bind(&name).bind(&symbol).bind(&meta)
                .bind(block as i64).bind(&tx).bind(ts).bind(abi::BNB)
                .execute(&self.pool)
                .await?
                .rows_affected()
                    > 0;
                if new {
                    self.counters.created.fetch_add(1, Ordering::Relaxed);
                }
            }
            Event::FlapQuoteSet { token, quote } => {
                self.update_token("quote = $2", &token, &quote).await?;
            }
            Event::FlapCurveSet { token, r, h, k } => {
                sqlx::query(
                    "UPDATE tokens SET curve_r = $2::numeric, curve_h = $3::numeric,
                        curve_k = $4::numeric WHERE token = $1",
                )
                .bind(&token).bind(&r).bind(&h).bind(&k)
                .execute(&self.pool)
                .await?;
            }
            Event::FlapTaxSet { token, bps } => {
                sqlx::query("UPDATE tokens SET tax_bps = $2 WHERE token = $1")
                    .bind(&token).bind(bps).execute(&self.pool).await?;
            }
            Event::FlapThresholdSet { token, threshold } => {
                self.update_token("dex_threshold = $2::numeric", &token, &threshold).await?;
            }
            Event::FlapTrade { buy, token, account, amount, eth, fee, price } => {
                // Reserves from the marginal price of the curve (x+r)(y+h)=k:
                //   P = k/(y+h)^2  =>  x = sqrt(k*P) - r ,  y = sqrt(k/P) - h.
                // A token without curve parameters (created before recording
                // started, or an old curve) gets NULL, not zero.
                sqlx::query(
                    "INSERT INTO trades (tx_hash, log_index, token, side, account, price, amount, cost,
                        fee, offers, funds, block_number, block_time, launchpad)
                     SELECT $1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,$9::numeric,
                        CASE WHEN $6::numeric > 0 THEN sqrt(t.curve_k / $6::numeric) - t.curve_h END,
                        CASE WHEN $6::numeric > 0 THEN sqrt(t.curve_k * $6::numeric) - t.curve_r END,
                        $10, to_timestamp($11), 'flap'
                     FROM (SELECT 1) _ LEFT JOIN tokens t ON t.token = $3
                     ON CONFLICT DO NOTHING",
                )
                .bind(&tx).bind(idx).bind(&token).bind(if buy { "B" } else { "S" }).bind(&account)
                .bind(&price).bind(&amount).bind(&eth).bind(&fee)
                .bind(block as i64).bind(ts)
                .execute(&self.pool)
                .await?;
                self.counters.trades.fetch_add(1, Ordering::Relaxed);
            }
            Event::FlapGraduated { token, pool } => {
                self.record_graduation(&token, block, ts, &tx, "flap", Some(&pool)).await?;
            }
        }
        Ok(())
    }

    async fn record_graduation(
        &self, token: &str, block: u64, ts: f64, tx: &str, launchpad: &str, pool: Option<&str>,
    ) -> Result<()> {
        let n = sqlx::query(
            // Flap: `pool` is a PancakeSwap V2 pair in nearly every case, so
            // it is stored in `pair` too and the same price path is used.
            "INSERT INTO graduations (token, block_number, block_time, tx_hash, launchpad, pool, pair)
             VALUES ($1,$2,to_timestamp($3),$4,$5,$6,$6)
             ON CONFLICT (token) DO NOTHING",
        )
        .bind(token).bind(block as i64).bind(ts).bind(tx).bind(launchpad).bind(pool)
        .execute(&self.pool)
        .await?
        .rows_affected();
        if n > 0 {
            self.counters.graduated.fetch_add(1, Ordering::Relaxed);
            info!("graduation {launchpad} {token} at block {block}");
        }
        Ok(())
    }

    async fn update_token(&self, set: &str, token: &str, value: &str) -> Result<()> {
        sqlx::query(&format!("UPDATE tokens SET {set} WHERE token = $1"))
            .bind(token)
            .bind(value)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// The DEX pair address = the contract that emits `Sync` in the graduation
    /// transaction; when there is none, `getPair(token, quote)` on the
    /// PancakeSwap V2 factory with delayed retries ([`GET_PAIR_SCHEDULE`]).
    ///
    /// four.meme adds liquidity in a SEPARATE transaction about 10 s after
    /// graduation, so the graduation receipt often has no `Sync`. Stopping
    /// there leaves most four.meme graduations without a pair and their price
    /// frozen at the last curve trade.
    async fn find_pair(self: Arc<Self>, token: String, quote: String, tx: String) {
        let mut receipt_ok = false;
        for attempt in 1..=5u64 {
            match self.rpc.receipt(&tx).await {
                Ok(r) => {
                    receipt_ok = true;
                    let pair = r.get("logs").and_then(Value::as_array).and_then(|ls| {
                        ls.iter().find_map(|l| {
                            (l.pointer("/topics/0").and_then(Value::as_str) == Some(abi::V2_SYNC))
                                .then(|| l.get("address").and_then(Value::as_str).map(str::to_lowercase))
                                .flatten()
                        })
                    });
                    if let Some(p) = pair {
                        self.save_pair(&token, &p, "receipt").await;
                        return;
                    }
                    break;
                }
                Err(e) => {
                    warn!("receipt {tx} ({attempt}/5): {e:#}");
                    tokio::time::sleep(Duration::from_secs(3 * attempt)).await;
                }
            }
        }
        let mut prev = 0;
        for (i, &t) in GET_PAIR_SCHEDULE.iter().enumerate() {
            tokio::time::sleep(Duration::from_secs(t - prev)).await;
            prev = t;
            match self.factory_pair(&token, &quote).await {
                Ok(Some(p)) => {
                    self.save_pair(&token, &p, &format!("getPair +{t} s")).await;
                    return;
                }
                Ok(None) => {}
                Err(e) => warn!("getPair {token} ({}/{}): {e:#}", i + 1, GET_PAIR_SCHEDULE.len()),
            }
        }
        // Still nothing: `pair_catchup` picks it up later.
        warn!(
            "pair of {token} not found (receipt {tx}{}, getPair V2 {} times up to +{} s); left to pair_catchup",
            if receipt_ok { " without Sync" } else { " failed" },
            GET_PAIR_SCHEDULE.len(),
            GET_PAIR_SCHEDULE[GET_PAIR_SCHEDULE.len() - 1],
        );
    }

    /// `Some(pair)` only when the V2 factory knows the pair AND the pair
    /// already holds liquidity (an empty 0/0 pair = not yet, retry later).
    async fn factory_pair(&self, token: &str, quote: &str) -> Result<Option<String>> {
        let h = self.rpc.call(abi::PANCAKE_V2_FACTORY, &abi::get_pair_calldata(token, quote)).await?;
        let Some(pair) = abi::pair_reply(&h) else { return Ok(None) };
        let r = self.rpc.call(&pair, abi::SEL_RESERVES).await?;
        match abi::reserves_filled(&r) {
            Some(true) => Ok(Some(pair)),
            Some(false) => Ok(None),
            None => bail!("getReserves {pair}: invalid reply {r:.80}"),
        }
    }

    /// Only fills a NULL pair; an existing pair is never overwritten.
    async fn save_pair(&self, token: &str, pair: &str, source: &str) {
        match sqlx::query("UPDATE graduations SET pair = $2 WHERE token = $1 AND pair IS NULL")
            .bind(token).bind(pair).execute(&self.pool).await
        {
            Ok(r) if r.rows_affected() > 0 => info!("pair {token} -> {pair} ({source})"),
            Ok(_) => {}
            Err(e) => warn!("save pair {token}: {e:#}"),
        }
    }

    /// Periodic catch-up: four.meme graduations without a pair within the
    /// last [`CATCHUP_DAYS`] days are looked up with `getPair`. This covers
    /// `find_pair` retries lost to a restart. Load: at most 2 `eth_call` per
    /// pairless token per round, at most [`CATCHUP_MAX`] tokens, 1 s apart.
    pub async fn pair_catchup(self: Arc<Self>) -> Result<()> {
        // Let the restart backfill run first (the RPC throttle is shared).
        tokio::time::sleep(Duration::from_secs(120)).await;
        let mut tick = tokio::time::interval(CATCHUP_EVERY);
        loop {
            tick.tick().await;
            let candidates: Vec<(String, Option<String>)> = match sqlx::query_as(
                "SELECT g.token, coalesce(g.quote, t.quote) FROM graduations g JOIN tokens t USING (token)
                  WHERE g.pair IS NULL AND g.launchpad = 'fourmeme'
                    AND g.block_time > now() - make_interval(days => $1)
                    -- those still inside the find_pair retry schedule are left alone
                    AND g.block_time < now() - interval '10 minutes'
                  ORDER BY g.block_time DESC LIMIT $2",
            )
            .bind(CATCHUP_DAYS)
            .bind(CATCHUP_MAX)
            .fetch_all(&self.pool)
            .await
            {
                Ok(c) => c,
                Err(e) => {
                    warn!("pair_catchup: {e:#}");
                    continue;
                }
            };
            if candidates.is_empty() {
                continue;
            }
            let (mut found, mut pending, mut errors) = (0, 0, 0);
            for (token, quote) in &candidates {
                // Unknown quote: do not guess BNB.
                let Some(q) = quote else {
                    pending += 1;
                    continue;
                };
                match self.factory_pair(token, q).await {
                    Ok(Some(p)) => {
                        self.save_pair(token, &p, "pair_catchup").await;
                        found += 1;
                    }
                    Ok(None) => pending += 1,
                    Err(e) => {
                        errors += 1;
                        warn!("pair_catchup {token}: {e:#}");
                    }
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            info!("pair_catchup: {found} pairs found, {pending} pending, {errors} errors out of {}", candidates.len());
        }
    }

    /// An RPC node that lags slightly answers `getTokenInfo` for a token it
    /// has NOT seen yet with an all-ZERO struct, not with an error. Storing
    /// that zero as is makes `quote = 0x0` read as BNB: about half of all
    /// tokens were hit when this was measured, and tokens quoted in a
    /// stablecoin were priced as if quoted in BNB.
    /// Version 0 therefore means NOT READY: retry; if it stays 0 the columns
    /// stay NULL and `repair_info` retries periodically. Never guess.
    async fn fill_info(self: Arc<Self>, token: String) {
        for attempt in 1..=6u64 {
            match self.read_info(&token).await {
                Ok(true) => return,
                Ok(false) => {}
                Err(e) => warn!("getTokenInfo {token} ({attempt}/6): {e:#}"),
            }
            tokio::time::sleep(Duration::from_secs(2 * attempt)).await;
        }
        warn!("getTokenInfo {token}: still empty after 6 attempts; left to repair_info");
    }

    /// `Ok(false)` = the node has not seen the token (zero struct); nothing
    /// was stored.
    pub async fn read_info(&self, token: &str) -> Result<bool> {
        let data = format!("{}{}", abi::SEL_TOKEN_INFO, abi::address_arg(token));
        let h = self.rpc.call(abi::FOURMEME_HELPER3, &data).await?;
        let h = h.trim_start_matches("0x");
        let w: Vec<&str> = (0..h.len() / 64).map(|i| &h[i * 64..i * 64 + 64]).collect();
        if w.len() < 12 {
            bail!("{} words", w.len());
        }
        let version = abi::word_u128(w[0]).unwrap_or(0) as i32;
        let manager = abi::address(w[1]);
        if version == 0 || manager == abi::BNB {
            return Ok(false);
        }
        let quote = abi::address(w[2]);
        let max_funds = abi::word_u128(w[10]).map(abi::fixed18);
        sqlx::query(
            "UPDATE tokens SET quote = $2, max_funds = $3::numeric, version = $4,
                info_at = now() WHERE token = $1",
        )
        .bind(token).bind(&quote).bind(max_funds).bind(version)
        .execute(&self.pool)
        .await?;
        Ok(true)
    }

    /// Periodic retry for tokens whose info has not been read yet.
    pub async fn repair_info(self: Arc<Self>) -> Result<()> {
        let mut tick = tokio::time::interval(Duration::from_secs(300));
        loop {
            tick.tick().await;
            let candidates: Vec<(String,)> = match sqlx::query_as(
                "SELECT token FROM tokens WHERE version IS NULL AND launchpad = 'fourmeme'
                   AND created_at < now() - interval '2 minutes'
                 ORDER BY created_at DESC LIMIT 300",
            )
            .fetch_all(&self.pool)
            .await
            {
                Ok(c) => c,
                Err(e) => {
                    warn!("repair_info: {e:#}");
                    continue;
                }
            };
            let (mut filled, mut empty) = (0, 0);
            for (t,) in &candidates {
                match self.read_info(t).await {
                    Ok(true) => filled += 1,
                    Ok(false) => empty += 1,
                    Err(e) => warn!("repair_info {t}: {e:#}"),
                }
            }
            if !candidates.is_empty() {
                info!("repair_info: {filled} filled, {empty} still empty out of {}", candidates.len());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_pair_schedule_strictly_increases_and_starts_after_liquidity() {
        // Deltas are used as sleep durations, so it must strictly increase
        // (no underflow).
        assert!(GET_PAIR_SCHEDULE.windows(2).all(|w| w[0] < w[1]));
        // four.meme liquidity lands about 10 s after graduation.
        assert!(GET_PAIR_SCHEDULE[0] > 10);
        assert!(*GET_PAIR_SCHEDULE.last().unwrap() >= 300);
    }
}
