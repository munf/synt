//! Quote asset decimals for DEX pair reserves.
//!
//! Flap events normalise quote amounts to 18 decimals, but V2 pair reserves
//! (`getReserves`, `Sync` logs) are RAW, in the quote asset's own decimals.
//! Reading them as 18 decimals puts the pool price of a 6-decimal quote off
//! by 1e-12 and an 8-decimal quote off by 1e-10.
//!
//! Decimals come from the `quote_assets` table. A quote that is not there yet
//! has `decimals()` read on chain ONCE (through `Rpc`, so it is throttled and
//! counted) and stored, together with `symbol()` when readable. A failure or
//! an odd reply yields `None`: never assume 18. It is retried with backoff.
//! four.meme and Flap tokens themselves always have 18 decimals.

use crate::abi;
use crate::rpc::Rpc;
use anyhow::{anyhow, Result};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{info, warn};

/// Backoff for failed chain reads: 1 min x 2^(n-1), capped at 6 hours.
const BACKOFF_START: Duration = Duration::from_secs(60);
const BACKOFF_MAX: Duration = Duration::from_secs(6 * 3600);

/// Multiplier from a raw quote reserve to 18-decimal units: 10^(18 - d).
/// `None` for decimals outside 0..=36 (not a sane ERC-20).
pub fn factor(decimals: i16) -> Option<f64> {
    (0..=36).contains(&decimals).then(|| 10f64.powi(18 - decimals as i32))
}

/// Price and quote reserve (whole units) from RAW pair reserves.
/// `r_token` = token reserve (18 decimals), `r_quote` = raw quote reserve,
/// `factor` = [`factor`] of the quote's decimals. `None` when the token
/// reserve is zero.
pub fn pool_price(r_token: f64, r_quote: f64, factor: f64) -> Option<(f64, f64)> {
    if r_token <= 0.0 || !r_token.is_finite() || !r_quote.is_finite() {
        return None;
    }
    let q18 = r_quote * factor;
    Some((q18 / r_token, q18 / 1e18))
}

/// Delay before attempt n+1 after `n` consecutive failures.
pub fn backoff(n: u32) -> Duration {
    BACKOFF_START.saturating_mul(1u32 << n.saturating_sub(1).min(16)).min(BACKOFF_MAX)
}

/// Decimals cache per quote (lowercase address). SHARED between the pool
/// poller and the pool sweeper ([`Shared`]) so a new quote is read once.
#[derive(Default)]
pub struct Decimals {
    known: HashMap<String, i16>,
    /// quote -> (may retry at, consecutive failures)
    failed: HashMap<String, (Instant, u32)>,
}

pub type Shared = Arc<tokio::sync::Mutex<Decimals>>;

impl Decimals {
    /// Factor of a quote; `Ok(None)` = decimals not known yet (skip or defer,
    /// do not guess). `Err` only for database errors.
    pub async fn factor(&mut self, pool: &PgPool, rpc: &Rpc, quote: &str) -> Result<Option<f64>> {
        if let Some(&d) = self.known.get(quote) {
            return Ok(factor(d));
        }
        if quote == abi::BNB {
            // Native BNB: the pair holds WBNB (18).
            self.known.insert(quote.to_owned(), 18);
            return Ok(factor(18));
        }
        if self.failed.get(quote).is_some_and(|(t, _)| Instant::now() < *t) {
            return Ok(None);
        }
        let d: Option<Option<i16>> = sqlx::query_scalar("SELECT decimals FROM quote_assets WHERE quote = $1")
            .bind(quote)
            .fetch_optional(pool)
            .await?;
        if let Some(Some(d)) = d {
            if factor(d).is_some() {
                self.known.insert(quote.to_owned(), d);
                self.failed.remove(quote);
                return Ok(factor(d));
            }
        }
        match read_chain(rpc, quote).await {
            Ok((d, symbol)) => {
                sqlx::query(
                    "INSERT INTO quote_assets (quote, symbol, decimals) VALUES ($1, $2, $3)
                     ON CONFLICT (quote) DO UPDATE
                        SET decimals = EXCLUDED.decimals, symbol = coalesce(quote_assets.symbol, EXCLUDED.symbol)
                      WHERE quote_assets.decimals IS NULL",
                )
                .bind(quote).bind(&symbol).bind(d)
                .execute(pool)
                .await?;
                info!("quote {quote}: decimals = {d} ({}) read on chain and stored",
                      symbol.as_deref().unwrap_or("symbol unknown"));
                self.known.insert(quote.to_owned(), d);
                self.failed.remove(quote);
                Ok(factor(d))
            }
            Err(e) => {
                let n = self.failed.get(quote).map(|g| g.1).unwrap_or(0) + 1;
                let wait = backoff(n);
                self.failed.insert(quote.to_owned(), (Instant::now() + wait, n));
                warn!("quote {quote} decimals: {e:#}; attempt {n} failed, retry in {} s (18 is not assumed)",
                      wait.as_secs());
                Ok(None)
            }
        }
    }
}

/// `decimals()` MUST be valid (uint8, 0..=36); `symbol()` is optional.
async fn read_chain(rpc: &Rpc, quote: &str) -> Result<(i16, Option<String>)> {
    let h = rpc.call(quote, abi::SEL_DECIMALS).await?;
    let d = abi::decimals_reply(&h).ok_or_else(|| anyhow!("invalid decimals() reply: {:.80}", h))?;
    if factor(d).is_none() {
        return Err(anyhow!("decimals() = {d} is outside 0..=36"));
    }
    let symbol = rpc.call(quote, abi::SEL_SYMBOL).await.ok().and_then(|h| abi::symbol_reply(&h));
    Ok((d, symbol))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f64, b: f64) -> bool {
        ((a - b) / b).abs() < 1e-12
    }

    #[test]
    fn factor_per_decimals() {
        assert_eq!(factor(18), Some(1.0));
        assert_eq!(factor(6), Some(1e12));
        assert_eq!(factor(8), Some(1e10));
        assert_eq!(factor(9), Some(1e9));
        assert!(close(factor(24).unwrap(), 1e-6));
        assert_eq!(factor(-1), None);
        assert_eq!(factor(77), None);
    }

    /// A Flap pool seeded with 16 quote + 200M tokens must price the SAME
    /// whatever the quote's decimals are.
    #[test]
    fn price_equal_across_decimals() {
        let r_token = 200e6 * 1e18;
        let (p18, c18) = pool_price(r_token, 16e18, factor(18).unwrap()).unwrap();
        let (p6, c6) = pool_price(r_token, 16e6, factor(6).unwrap()).unwrap();
        let (p8, c8) = pool_price(r_token, 16e8, factor(8).unwrap()).unwrap();
        assert!(close(p18, 8e-8) && close(c18, 16.0));
        assert!(close(p6, p18) && close(c6, 16.0));
        assert!(close(p8, p18) && close(c8, 16.0));
    }

    #[test]
    fn backoff_grows_and_is_capped() {
        assert_eq!(backoff(1), Duration::from_secs(60));
        assert_eq!(backoff(2), Duration::from_secs(120));
        assert_eq!(backoff(5), Duration::from_secs(960));
        assert_eq!(backoff(40), BACKOFF_MAX);
    }

    #[test]
    fn zero_token_reserve_rejected() {
        assert_eq!(pool_price(0.0, 1e18, 1.0), None);
        assert_eq!(pool_price(1e18, f64::NAN, 1.0), None);
    }
}
