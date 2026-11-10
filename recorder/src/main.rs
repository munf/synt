//! bsc-launchpad-recorder: records every token launch, bonding curve trade,
//! graduation and post-graduation pool price of four.meme and Flap on BNB
//! Chain into PostgreSQL. See README.md.

mod abi;
mod decimals;
mod pool_poll;
mod pool_sweep;
mod recorder;
mod rpc;
mod sender;

use anyhow::{bail, Context, Result};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

/// Fail fast at boot on a missing setting.
fn required(k: &str) -> Result<String> {
    match std::env::var(k) {
        Ok(v) if !v.trim().is_empty() => Ok(v.trim().to_owned()),
        _ => bail!("{k} is empty; set it in .env or the environment"),
    }
}

fn optional<T: std::str::FromStr>(k: &str, default: T) -> T {
    std::env::var(k).ok().and_then(|v| v.trim().parse().ok()).unwrap_or(default)
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            // sqlx at warn: schema.sql is re-applied on every start and Postgres
            // answers each "IF NOT EXISTS" with a notice.
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();
    // Exactly one rustls crypto provider in the process.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let db = required("DATABASE_URL")?;
    let wss = required("BSC_WSS_URL")?;
    let http_url = required("BSC_HTTP_URL")?;
    let rps: u32 = optional("BSC_RPS", 10);
    let chunk: u64 = optional("BACKFILL_CHUNK_BLOCKS", 500).max(1);
    let rps_sender: u32 = optional("BSC_RPS_SENDER", 25);

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        // Guard: no query of the recorder may hang a connection. Set per
        // connection, so no ALTER ROLE is needed.
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("SET statement_timeout = '60s'").execute(conn).await?;
                Ok(())
            })
        })
        .connect(&db)
        .await
        .context("database connection")?;
    // Idempotent (CREATE ... IF NOT EXISTS): safe on every start.
    sqlx::raw_sql(include_str!("../schema.sql")).execute(&pool).await.context("apply schema.sql")?;

    let rpc = Arc::new(rpc::Rpc::new(http_url.clone(), rps));
    let counters = Arc::new(recorder::Counters::default());
    info!(
        "starting: four.meme {} + Flap {}, {rps} req/s, backfill chunk {chunk} blocks",
        abi::FOURMEME_TOKEN_MANAGER2,
        abi::FLAP_PORTAL
    );

    let rec = recorder::Recorder::new(rpc.clone(), pool.clone(), wss, chunk, counters.clone());
    let h_info = tokio::spawn(rec.clone().repair_info());
    // four.meme pairs that are not in the graduation receipt (getPair, periodic).
    let h_catchup = tokio::spawn(rec.clone().pair_catchup());
    let h_recorder = tokio::spawn(rec.run());
    // One quote decimals cache for both price writers.
    let decimals: decimals::Shared = Default::default();
    let h_poll = tokio::spawn(pool_poll::run(rpc.clone(), pool.clone(), decimals.clone()));
    let h_sweep = tokio::spawn(pool_sweep::run(rpc.clone(), pool.clone(), decimals.clone()));
    // Separate throttle: the tx.from backlog must not eat the recorder's budget.
    let rpc_sender = Arc::new(rpc::Rpc::new(http_url, rps_sender));
    let h_sender = tokio::spawn(sender::run(rpc_sender.clone(), pool.clone()));

    // Periodic report: without it a silent recorder looks like a quiet market.
    let report = {
        let (rpc, rpc_sender, counters) = (rpc.clone(), rpc_sender, counters.clone());
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(300));
            tick.tick().await;
            loop {
                tick.tick().await;
                let g = |a: &std::sync::atomic::AtomicU64| a.swap(0, Ordering::Relaxed);
                info!(
                    "5 min: created {}, trades {}, graduated {}, malformed {}, backfill logs {}, \
                     RPC requests {} (+{} sender), block {}",
                    g(&counters.created),
                    g(&counters.trades),
                    g(&counters.graduated),
                    g(&counters.malformed),
                    g(&counters.backfill_logs),
                    g(&rpc.requests),
                    g(&rpc_sender.requests),
                    counters.last_block.load(Ordering::Relaxed),
                );
            }
        })
    };

    // Any task that stops = the process exits and the supervisor restarts it.
    tokio::select! {
        r = h_recorder => bail!("recorder stopped: {r:?}"),
        r = h_poll => bail!("pool_poll stopped: {r:?}"),
        r = h_sweep => bail!("pool_sweep stopped: {r:?}"),
        r = h_info => bail!("repair_info stopped: {r:?}"),
        r = h_catchup => bail!("pair_catchup stopped: {r:?}"),
        r = h_sender => bail!("sender stopped: {r:?}"),
        r = report => bail!("report stopped: {r:?}"),
    }
}
