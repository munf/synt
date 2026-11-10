//! BSC JSON-RPC over HTTP.
//!
//! Every request is counted in ONE place (`requests`) and throttled in the
//! same place. Providers bill per JSON-RPC request, including each entry of a
//! batch, so counting HTTP calls instead understates the real usage.

use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

pub struct Rpc {
    http: reqwest::Client,
    url: String,
    gap: Duration,
    last: Mutex<Instant>,
    pub requests: AtomicU64,
}

impl Rpc {
    pub fn new(url: String, requests_per_second: u32) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                // Some public endpoints reject requests without a User-Agent.
                .user_agent(concat!("bsc-launchpad-recorder/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("http client"),
            url,
            gap: Duration::from_millis(1000 / requests_per_second.max(1) as u64),
            last: Mutex::new(Instant::now()),
            requests: AtomicU64::new(0),
        }
    }

    async fn throttle(&self) {
        let mut t = self.last.lock().await;
        let ready = *t + self.gap;
        if ready > Instant::now() {
            tokio::time::sleep_until(ready).await;
        }
        *t = Instant::now();
        self.requests.fetch_add(1, Ordering::Relaxed);
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value> {
        self.throttle().await;
        let r: Value = self
            .http
            .post(&self.url)
            .json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
            .send()
            .await
            .with_context(|| format!("{method}: send"))?
            .error_for_status()
            .with_context(|| format!("{method}: status"))?
            .json()
            .await
            .with_context(|| format!("{method}: json"))?;
        if let Some(e) = r.get("error") {
            bail!("{method}: {e}");
        }
        r.get("result").cloned().ok_or_else(|| anyhow!("{method}: no result"))
    }

    /// JSON-RPC batch: one HTTP call, `n` requests. Throttled and counted per
    /// request, not per HTTP call. Results line up with the input order;
    /// `None` = that request failed or returned null (the caller decides).
    pub async fn batch(&self, method: &str, params: &[Value]) -> Result<Vec<Option<Value>>> {
        for _ in params {
            self.throttle().await;
        }
        let body: Vec<Value> = params
            .iter()
            .enumerate()
            .map(|(i, p)| json!({"jsonrpc":"2.0","id":i,"method":method,"params":p}))
            .collect();
        let r: Value = self
            .http
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .with_context(|| format!("{method} batch: send"))?
            .error_for_status()
            .with_context(|| format!("{method} batch: status"))?
            .json()
            .await
            .with_context(|| format!("{method} batch: json"))?;
        let mut out = vec![None; params.len()];
        for x in r.as_array().ok_or_else(|| anyhow!("{method} batch: not an array: {r}"))? {
            let Some(i) = x.get("id").and_then(Value::as_u64) else { continue };
            if let (Some(v), Some(slot)) = (x.get("result"), out.get_mut(i as usize)) {
                if !v.is_null() {
                    *slot = Some(v.clone());
                }
            }
        }
        Ok(out)
    }

    pub async fn block_number(&self) -> Result<u64> {
        let v = self.request("eth_blockNumber", json!([])).await?;
        hex_u64(&v)
    }

    pub async fn logs(&self, from: u64, to: u64, addresses: &[&str], topics: &[&str]) -> Result<Vec<Value>> {
        let mut f = json!({"address": addresses,
            "fromBlock": format!("0x{from:x}"), "toBlock": format!("0x{to:x}")});
        if !topics.is_empty() {
            f["topics"] = json!([topics]);
        }
        let v = self.request("eth_getLogs", json!([f])).await?;
        Ok(v.as_array().cloned().unwrap_or_default())
    }

    pub async fn call(&self, to: &str, data: &str) -> Result<String> {
        let v = self.request("eth_call", json!([{"to": to, "data": data}, "latest"])).await?;
        v.as_str().map(str::to_owned).ok_or_else(|| anyhow!("eth_call: not a string"))
    }

    /// `eth_call` at a specific block (that block's state, not `latest`).
    pub async fn call_at(&self, to: &str, data: &str, block: u64) -> Result<String> {
        let v = self.request("eth_call", json!([{"to": to, "data": data}, format!("0x{block:x}")])).await?;
        v.as_str().map(str::to_owned).ok_or_else(|| anyhow!("eth_call: not a string"))
    }

    pub async fn receipt(&self, tx: &str) -> Result<Value> {
        self.request("eth_getTransactionReceipt", json!([tx])).await
    }

    pub async fn block_time(&self, block: u64) -> Result<u64> {
        let v = self.request("eth_getBlockByNumber", json!([format!("0x{block:x}"), false])).await?;
        hex_u64(v.get("timestamp").ok_or_else(|| anyhow!("block without timestamp"))?)
    }
}

pub fn hex_u64(v: &Value) -> Result<u64> {
    let s = v.as_str().ok_or_else(|| anyhow!("not hex: {v}"))?;
    Ok(u64::from_str_radix(s.trim_start_matches("0x"), 16)?)
}
