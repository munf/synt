//! Price AFTER graduation, for young tokens. Once a token graduates the
//! bonding curve stops and the price moves to its PancakeSwap pair. Without
//! this, a graduated token reads as frozen at its graduation price.
//!
//! Polled rather than subscribed: graduations are rare (a few percent of
//! launches) and this window is short. After [`POLL_WINDOW_SECS`] the pair is
//! handed over to `pool_sweep.rs`.

use crate::abi;
use crate::decimals;
use crate::rpc::Rpc;
use anyhow::{anyhow, Result};
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tracing::warn;

pub const EVERY: Duration = Duration::from_secs(30);
/// Poll window, in seconds since the token was created. Afterwards the price
/// of a graduated token is carried on by `pool_sweep.rs`.
pub const POLL_WINDOW_SECS: f64 = 6000.0;

/// Some Flap pools have code but REVERT `token0()` / `getReserves()` (and V3
/// `slot0()`): they are not V2 pairs. Without a limit such a token is retried
/// every 30 s for the whole window, about 200 identical warnings. After this
/// many CONSECUTIVE reverts the token is skipped until it leaves the window
/// (one explanatory warning). Other errors (network, rate limit) are not
/// counted: they are temporary, not a property of the pair.
pub const REVERT_MAX: u32 = 5;

/// Consecutive revert count per token plus the set of skipped tokens.
#[derive(Default)]
pub(crate) struct RevertTracker {
    reverts: HashMap<String, u32>,
    skipped: HashSet<String>,
}

impl RevertTracker {
    pub(crate) fn is_skipped(&self, token: &str) -> bool {
        self.skipped.contains(token)
    }

    /// Success resets the count (only CONSECUTIVE reverts count).
    pub(crate) fn success(&mut self, token: &str) {
        self.reverts.remove(token);
    }

    /// Record a revert; `true` exactly once, when the token has just been
    /// marked as skipped.
    pub(crate) fn reverted(&mut self, token: &str) -> bool {
        let n = self.reverts.entry(token.to_owned()).or_insert(0);
        *n += 1;
        *n >= REVERT_MAX && self.skipped.insert(token.to_owned())
    }

    /// Drop tokens that left the window so the maps do not grow.
    pub(crate) fn prune(&mut self, active: &HashSet<&str>) {
        self.reverts.retain(|t, _| active.contains(t.as_str()));
        self.skipped.retain(|t| active.contains(t.as_str()));
    }
}

pub(crate) fn is_revert(e: &anyhow::Error) -> bool {
    format!("{e:#}").contains("execution reverted")
}

pub async fn run(rpc: Arc<Rpc>, pool: PgPool, decimals: decimals::Shared) -> Result<()> {
    let mut token0: HashMap<String, String> = HashMap::new();
    let mut tracker = RevertTracker::default();
    let mut no_decimals: HashSet<String> = HashSet::new();
    let mut tick = tokio::time::interval(EVERY);
    loop {
        tick.tick().await;
        let pairs: Vec<(String, String, Option<String>)> = match sqlx::query_as(
            "SELECT g.token, g.pair, t.quote FROM graduations g JOIN tokens t USING (token)
             WHERE g.pair IS NOT NULL AND t.created_at > now() - make_interval(secs => $1)",
        )
        .bind(POLL_WINDOW_SECS)
        .fetch_all(&pool)
        .await
        {
            Ok(p) => p,
            Err(e) => {
                warn!("pool poll: query failed: {e:#}");
                continue;
            }
        };
        let active: HashSet<&str> = pairs.iter().map(|(t, _, _)| t.as_str()).collect();
        tracker.prune(&active);
        no_decimals.retain(|t| active.contains(t.as_str()));
        for (token, p, quote) in &pairs {
            let (token, p) = (token.as_str(), p.as_str());
            if tracker.is_skipped(token) {
                continue;
            }
            // The quote's decimals must be known: pair reserves are RAW (decimals.rs).
            let f = match quote {
                Some(q) => match decimals.lock().await.factor(&pool, &rpc, q).await {
                    Ok(f) => f,
                    Err(e) => {
                        warn!("pool poll {token}: reading quote decimals failed: {e:#}");
                        continue;
                    }
                },
                None => None,
            };
            let Some(f) = f else {
                if no_decimals.insert(token.to_owned()) {
                    warn!(
                        "pool poll {token}: decimals of quote {} not known yet (table and chain); the pool \
                         price is NOT recorded until they are read (18 is not assumed)",
                        quote.as_deref().unwrap_or("NULL")
                    );
                }
                continue;
            };
            match one(&rpc, &pool, &mut token0, token, p, f).await {
                Ok(()) => tracker.success(token),
                Err(e) if is_revert(&e) => {
                    if tracker.reverted(token) {
                        warn!(
                            "pool poll {token}: pair {p} reverted {REVERT_MAX} times in a row (not a V2 pair?); \
                             skipped until it leaves the window"
                        );
                    } else {
                        warn!("pool poll {token}: {e:#}");
                    }
                }
                Err(e) => warn!("pool poll {token}: {e:#}"),
            }
        }
    }
}

async fn one(
    rpc: &Rpc, pool: &PgPool, token0: &mut HashMap<String, String>, token: &str, pair: &str, quote_factor: f64,
) -> Result<()> {
    if !token0.contains_key(pair) {
        let h = rpc.call(pair, abi::SEL_TOKEN0).await?;
        let t0 = abi::address_reply(&h).ok_or_else(|| anyhow!("token0: invalid reply {h:.80}"))?;
        token0.insert(pair.to_owned(), t0);
    }
    let h = rpc.call(pair, abi::SEL_RESERVES).await?;
    let h = h.trim_start_matches("0x");
    if h.len() < 128 {
        return Err(anyhow!("getReserves reply too short"));
    }
    let r0 = abi::word_u128(&h[0..64]).ok_or_else(|| anyhow!("r0"))? as f64;
    let r1 = abi::word_u128(&h[64..128]).ok_or_else(|| anyhow!("r1"))? as f64;
    // Token has 18 decimals; the quote is normalised to 18 with `quote_factor`.
    let (r_token, r_quote) = if token0[pair] == token { (r0, r1) } else { (r1, r0) };
    let (price, reserve) =
        decimals::pool_price(r_token, r_quote, quote_factor).ok_or_else(|| anyhow!("token reserve is zero"))?;
    sqlx::query(
        "INSERT INTO pool_prices (token, ts, price, quote_reserve)
         VALUES ($1, now(), $2::numeric, $3::numeric) ON CONFLICT DO NOTHING",
    )
    .bind(token)
    .bind(format!("{price:e}"))
    .bind(format!("{reserve:e}"))
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skipped_after_consecutive_reverts_exactly_once() {
        let mut l = RevertTracker::default();
        for _ in 1..REVERT_MAX {
            assert!(!l.reverted("a"));
        }
        assert!(!l.is_skipped("a"));
        assert!(l.reverted("a"));
        assert!(l.is_skipped("a"));
        assert!(!l.reverted("a"), "the explanatory warning fires once");
        assert!(!l.is_skipped("b"), "other tokens are unaffected");
    }

    #[test]
    fn success_resets_the_count() {
        let mut l = RevertTracker::default();
        for _ in 1..REVERT_MAX {
            l.reverted("a");
        }
        l.success("a");
        assert!(!l.reverted("a"));
        assert!(!l.is_skipped("a"));
    }

    #[test]
    fn prune_drops_tokens_outside_the_window() {
        let mut l = RevertTracker::default();
        for _ in 0..REVERT_MAX {
            l.reverted("a");
        }
        l.reverted("b");
        l.prune(&["b"].into_iter().collect());
        assert!(!l.is_skipped("a"));
        assert!(l.reverts.contains_key("b") && !l.reverts.contains_key("a"));
    }

    #[test]
    fn recognises_revert() {
        assert!(is_revert(&anyhow::anyhow!(r#"eth_call: {{"code":3,"message":"execution reverted: 0x"}}"#)));
        assert!(!is_revert(&anyhow::anyhow!("eth_call: timeout")));
    }
}
