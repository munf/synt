//! The REAL wallet behind every trade and token creation: `tx.from` (always
//! an EOA).
//!
//! The "account" and "creator" fields of Flap events are the contract that
//! called the Portal (an aggregator router, a bot, a vault), not the person.
//! Most Flap trades go through a router, so without `tx.from` any count of
//! unique buyers counts ROUTERS, not wallets.
//!
//! The queue is worked from the OLDEST transaction: nodes with limited
//! history drop old transactions first, so the old backlog is the part most
//! at risk of being lost.

use crate::rpc::Rpc;
use anyhow::Result;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

const BATCH: usize = 50;

pub async fn run(rpc: Arc<Rpc>, pool: PgPool) -> Result<()> {
    let mut filled = 0u64;
    let mut missing = 0u64;
    let mut report = tokio::time::Instant::now();
    loop {
        let txs: Vec<(String,)> = match sqlx::query_as(
            "SELECT tx_hash FROM (
                SELECT tx_hash, block_number FROM trades WHERE sender IS NULL
                UNION ALL
                SELECT tx_hash, block_number FROM tokens WHERE sender IS NULL
             ) x GROUP BY tx_hash ORDER BY min(block_number) LIMIT 500",
        )
        .fetch_all(&pool)
        .await
        {
            Ok(t) => t,
            Err(e) => {
                warn!("sender: query: {e:#}");
                tokio::time::sleep(Duration::from_secs(10)).await;
                continue;
            }
        };
        if txs.is_empty() {
            tokio::time::sleep(Duration::from_secs(5)).await;
            continue;
        }
        for chunk in txs.chunks(BATCH) {
            let params: Vec<Value> = chunk.iter().map(|(h,)| json!([h])).collect();
            let replies = match rpc.batch("eth_getTransactionByHash", &params).await {
                Ok(h) => h,
                Err(e) => {
                    warn!("sender: batch failed: {e:#}");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
            };
            let (mut hashes, mut from) = (Vec::new(), Vec::new());
            for ((h,), r) in chunk.iter().zip(replies) {
                match r.as_ref().and_then(|v| v.get("from")).and_then(Value::as_str) {
                    Some(f) => {
                        hashes.push(h.clone());
                        from.push(f.to_lowercase());
                    }
                    // Null = the node does not have this transaction (yet, or
                    // any more). Retried on the next round, NEVER filled with
                    // a guess.
                    None => missing += 1,
                }
            }
            if hashes.is_empty() {
                continue;
            }
            for table in ["trades", "tokens"] {
                if let Err(e) = sqlx::query(&format!(
                    "UPDATE {table} t SET sender = u.sender
                     FROM unnest($1::text[], $2::text[]) AS u(h, sender)
                     WHERE t.tx_hash = u.h AND t.sender IS NULL"
                ))
                .bind(&hashes)
                .bind(&from)
                .execute(&pool)
                .await
                {
                    warn!("sender: store {table}: {e:#}");
                }
            }
            filled += hashes.len() as u64;
        }
        if report.elapsed() > Duration::from_secs(300) {
            info!("sender 5 min: {filled} tx filled, {missing} null (retried)");
            (filled, missing) = (0, 0);
            report = tokio::time::Instant::now();
        }
        // All null = lagging node or transaction not visible yet: back off.
        if missing > 0 && filled == 0 {
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    }
}
