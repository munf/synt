//! Riwayat swap wallet (wallet tracker, 22 Nov — keputusan pemilik "implementasi penuh"): `GET /dompet?addr=`.
//!
//! Wallet tracker read-only lama (synt-dash `/api/wallet`) hanya tahu apa yang dilihat mesin synt (token yang
//! diluncurkan, posisi top-20 saat audit) — mesin tak mengindeks transaksi per wallet. Di sini riwayatnya dibaca
//! LANGSUNG dari rantai saat alamat dicari, tanpa indeks & tanpa login:
//!
//! 1. `getSignaturesForAddress` (maks `BATAS_TX` transaksi terbaru) → `getTransaction` (satu panggilan batch).
//! 2. Per transaksi: perubahan SOL wallet (+ WSOL miliknya; fee jaringan dikembalikan bila ia pembayar) dan perubahan
//!    saldo token miliknya. Tepat SATU token berubah & SOL bergerak berlawanan arah → beli / jual. Selain itu
//!    (transfer, token↔token, airdrop) dilewati — tak ditebak.
//! 3. Per token: jumlah beli/jual, SOL keluar/masuk, nama (Jupiter) & skor synt bila mesin pernah menilainya.
//!
//! ⚠️ Kejujuran: hanya jendela transaksi terbaru (bukan seluruh riwayat), SOL termasuk sewa akun token, dan selisih
//! SOL bukan PnL (posisi yang masih dipegang tak dinilai). Ketiganya ditulis di UI.
//! Biaya: ±1 kredit RPC per transaksi (≈ 30 per pencarian), di-cache 2 menit, rem per IP + global 10/menit.

use crate::api::{ip_klien, AppState, Galat, Hasil};
use crate::dagang::{info_token, Dagang, SOL};
use axum::{
    extract::{ConnectInfo, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tracing::warn;

const BATAS_TX: usize = 30;
/// gerak SOL (sesudah sewa akun dikoreksi) di bawah ini = bukan trade
const SOL_MIN: i64 = 1_000_000; // 0,001 SOL
/// sewa akun token 165 byte. Akun dibuat di transaksi (tak ada di pre) → sewa dikembalikan ke hitungan; ditutup (tak ada
/// di post) → dikurangkan. Token-2022 sedikit lebih besar: selisih ±0,00005 SOL dibiarkan.
const SEWA_ATA: i64 = 2_039_280;
const SKOR_MAKS_TOKEN: usize = 15;
const SIMPAN: Duration = Duration::from_secs(120);

fn cache() -> &'static Mutex<HashMap<String, (Instant, Value)>> {
    static C: OnceLock<Mutex<HashMap<String, (Instant, Value)>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Deserialize)]
pub struct Tanya {
    addr: String,
}

struct Trade {
    tanda: String,
    waktu: i64,
    beli: bool,
    mint: String,
    token: u128,
    desimal: u8,
    /// lamport keluar (beli) / masuk (jual), selalu positif
    sol: u64,
}

pub async fn dompet(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Query(q): Query<Tanya>,
) -> Hasil<Response> {
    let addr = q.addr.trim().to_string();
    if crate::soltx::kunci(&addr).is_err() {
        return Err(Galat(StatusCode::BAD_REQUEST, "This is not a valid Solana wallet address."));
    }
    if let Some(v) = {
        let c = cache().lock().unwrap_or_else(|e| e.into_inner());
        c.get(&addr).filter(|(t, _)| t.elapsed() < SIMPAN).map(|(_, v)| v.clone())
    } {
        return Ok(jawab(v));
    }
    if !s.rem_dompet.izinkan(ip_klien(&h, peer, s.cloudflare)) || !s.rem_dompet_global.izinkan_global() {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many wallet lookups. Wait a minute."));
    }
    let d = s.dagang.as_ref().ok_or(Galat(StatusCode::SERVICE_UNAVAILABLE, "Wallet history is not available right now."))?;
    let v = hitung(d, &s.dash, &addr).await.map_err(|e| {
        warn!("riwayat wallet: {e:#}");
        Galat(StatusCode::BAD_GATEWAY, "The Solana network is not responding. Try again.")
    })?;
    {
        let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
        c.retain(|_, (t, _)| t.elapsed() < SIMPAN);
        if c.len() < 1_000 {
            c.insert(addr, (Instant::now(), v.clone()));
        }
    }
    Ok(jawab(v))
}

fn jawab(v: Value) -> Response {
    let mut r = Json(v).into_response();
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=60"));
    r
}

async fn hitung(d: &Dagang, dash: &str, addr: &str) -> anyhow::Result<Value> {
    let tanda = d.rpc("getSignaturesForAddress", json!([addr, { "limit": BATAS_TX, "commitment": "confirmed" }])).await?;
    let tanda: Vec<(String, i64)> = tanda
        .as_array()
        .into_iter()
        .flatten()
        .filter(|x| x["err"].is_null())
        .filter_map(|x| Some((x["signature"].as_str()?.to_string(), x["blockTime"].as_i64().unwrap_or(0))))
        .collect();
    let dipindai = tanda.len();
    // ⚠️ 22 Nov: transaksi format versi 1 sudah beredar → `maxSupportedTransactionVersion: 1` (0 = galat -32015).
    // ⚠️ Paket Helius saat ini ±10 permintaan/dtk (batch 10 = 10 permintaan) dan DIPAKAI BERSAMA trading: dipecah per 5,
    // jeda 1 dtk → maks ±5/dtk, ±6 dtk per pencarian. Batch 50 sekaligus = 429.
    let mut tx: Vec<Value> = Vec::with_capacity(tanda.len());
    for (i, potong) in tanda.chunks(5).enumerate() {
        if i > 0 {
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        let isi = potong.iter().map(|(t, _)| json!([t, { "encoding": "json", "maxSupportedTransactionVersion": 1, "commitment": "confirmed" }])).collect();
        tx.extend(d.rpc_batch("getTransaction", isi).await?);
    }
    let mut trades: Vec<Trade> = tanda.iter().zip(tx.iter()).filter_map(|((t, w), v)| baca_trade(v, addr, t, *w)).collect();
    trades.sort_by(|a, b| b.waktu.cmp(&a.waktu));

    // ringkasan per token, urut transaksi terbaru
    let mut urutan: Vec<String> = Vec::new();
    let mut per: HashMap<String, Value> = HashMap::new();
    for t in &trades {
        let e = per.entry(t.mint.clone()).or_insert_with(|| {
            urutan.push(t.mint.clone());
            json!({ "mint": t.mint, "decimals": t.desimal, "buys": 0, "sells": 0, "solSpent": 0u64, "solReceived": 0u64,
                    "tokenBought": "0", "tokenSold": "0", "first": t.waktu, "last": t.waktu })
        });
        let tambah = |e: &mut Value, k: &str, n: u128| {
            let lama: u128 = e[k].as_str().and_then(|x| x.parse().ok()).unwrap_or(0);
            e[k] = json!((lama + n).to_string());
        };
        if t.beli {
            e["buys"] = json!(e["buys"].as_u64().unwrap_or(0) + 1);
            e["solSpent"] = json!(e["solSpent"].as_u64().unwrap_or(0) + t.sol);
            tambah(e, "tokenBought", t.token);
        } else {
            e["sells"] = json!(e["sells"].as_u64().unwrap_or(0) + 1);
            e["solReceived"] = json!(e["solReceived"].as_u64().unwrap_or(0) + t.sol);
            tambah(e, "tokenSold", t.token);
        }
        e["first"] = json!(e["first"].as_i64().unwrap_or(t.waktu).min(t.waktu));
    }

    // nama & ikon (Jupiter, satu panggilan) + skor synt (synt-dash publik, paralel, maks SKOR_MAKS_TOKEN token)
    let info = info_token(d, &urutan).await;
    let mut skor = tokio::task::JoinSet::new();
    for m in urutan.iter().take(SKOR_MAKS_TOKEN).cloned() {
        let (http, url) = (d.http().clone(), format!("{dash}/api/token?mint={m}"));
        skor.spawn(async move {
            let v: Option<Value> = async { http.get(url).timeout(Duration::from_secs(5)).send().await.ok()?.error_for_status().ok()?.json().await.ok() }.await;
            (m, v)
        });
    }
    let mut skor_per: HashMap<String, Value> = HashMap::new();
    while let Some(Ok((m, Some(v)))) = skor.join_next().await {
        if v["score"].is_number() {
            skor_per.insert(m, json!({ "score": v["score"], "scoreMax": v["score_max"], "collapseRatePct": v["collapse_rate_pct"] }));
        }
    }
    let token: Vec<Value> = urutan
        .iter()
        .map(|m| {
            let mut e = per.remove(m).unwrap_or_default();
            if let Some(i) = info.get(m) {
                e["symbol"] = i["symbol"].clone();
                e["name"] = i["name"].clone();
                e["icon"] = i["icon"].clone();
            }
            e["synt"] = skor_per.remove(m).unwrap_or(Value::Null);
            e
        })
        .collect();

    Ok(json!({
        "addr": addr,
        "scannedTx": dipindai,
        "limit": BATAS_TX,
        "oldest": tanda.last().map(|x| x.1),
        "newest": tanda.first().map(|x| x.1),
        "trades": trades.iter().map(|t| json!({
            "signature": t.tanda, "time": t.waktu, "side": if t.beli { "buy" } else { "sell" }, "mint": t.mint,
            "token": t.token.to_string(), "decimals": t.desimal, "solLamports": t.sol,
        })).collect::<Vec<_>>(),
        "tokens": token,
    }))
}

/// Satu transaksi → beli/jual wallet `w`, atau None bila bukan swap SOL↔satu token.
fn baca_trade(v: &Value, w: &str, tanda: &str, waktu: i64) -> Option<Trade> {
    let meta = v.get("meta")?;
    if !meta["err"].is_null() {
        return None;
    }
    let pesan = &v["transaction"]["message"];
    let mut kunci: Vec<&str> = pesan["accountKeys"].as_array()?.iter().filter_map(Value::as_str).collect();
    for bag in ["writable", "readonly"] {
        kunci.extend(meta["loadedAddresses"][bag].as_array().into_iter().flatten().filter_map(Value::as_str));
    }
    let i = kunci.iter().position(|k| *k == w)?;
    let pre = meta["preBalances"].as_array()?.get(i)?.as_i64()?;
    let post = meta["postBalances"].as_array()?.get(i)?.as_i64()?;
    let mut sol = post - pre;
    if i == 0 {
        sol += meta["fee"].as_i64().unwrap_or(0); // fee jaringan bukan bagian trade
    }
    // perubahan saldo token milik w per mint (mentah)
    let mut delta: HashMap<&str, (i128, u8)> = HashMap::new();
    let mut ada: HashMap<&str, (bool, bool)> = HashMap::new();
    for (kolom, tanda_kali) in [("preTokenBalances", -1i128), ("postTokenBalances", 1)] {
        for b in meta[kolom].as_array().into_iter().flatten() {
            if b["owner"].as_str() != Some(w) {
                continue;
            }
            let (Some(m), Some(j)) = (b["mint"].as_str(), b["uiTokenAmount"]["amount"].as_str().and_then(|x| x.parse::<i128>().ok())) else {
                continue;
            };
            let e = delta.entry(m).or_insert((0, b["uiTokenAmount"]["decimals"].as_u64().unwrap_or(0) as u8));
            e.0 += tanda_kali * j;
            let a = ada.entry(m).or_insert((false, false));
            if tanda_kali < 0 { a.0 = true } else { a.1 = true }
        }
    }
    for (_, (pre_ada, post_ada)) in ada.iter().filter(|(m, _)| **m != SOL) {
        match (pre_ada, post_ada) {
            (false, true) => sol += SEWA_ATA,
            (true, false) => sol -= SEWA_ATA,
            _ => {}
        }
    }
    // WSOL milik wallet = SOL (akun WSOL sementara dibuat & ditutup di transaksi yang sama → netral)
    if let Some((wsol, _)) = delta.remove(SOL) {
        sol += wsol as i64;
    }
    let mut berubah = delta.into_iter().filter(|(_, (d, _))| *d != 0);
    let (mint, (dt, desimal)) = berubah.next()?;
    if berubah.next().is_some() || sol.abs() < SOL_MIN {
        return None;
    }
    let beli = match (dt > 0, sol < 0) {
        (true, true) => true,
        (false, false) => false,
        _ => return None,
    };
    Some(Trade { tanda: tanda.to_string(), waktu, beli, mint: mint.to_string(), token: dt.unsigned_abs(), desimal, sol: sol.unsigned_abs() })
}

#[cfg(test)]
mod uji {
    use super::*;

    fn tx(pre: i64, post: i64, fee: i64, pre_tok: Option<&str>, post_tok: &str) -> Value {
        let mut pre_tb = vec![];
        if let Some(a) = pre_tok {
            pre_tb.push(json!({ "owner": "W", "mint": "M", "uiTokenAmount": { "amount": a, "decimals": 6 } }));
        }
        json!({
            "meta": { "err": null, "fee": fee, "preBalances": [pre, 0], "postBalances": [post, 0],
                      "preTokenBalances": pre_tb,
                      "postTokenBalances": [{ "owner": "W", "mint": "M", "uiTokenAmount": { "amount": post_tok, "decimals": 6 } },
                                            { "owner": "LAIN", "mint": "M", "uiTokenAmount": { "amount": "999", "decimals": 6 } }],
                      "loadedAddresses": { "writable": [], "readonly": [] } },
            "transaction": { "message": { "accountKeys": ["W", "P"] } }
        })
    }

    #[test]
    fn beli_jual_dan_bukan_trade() {
        // beli 0,1 SOL (+ fee 5000 + sewa akun token baru) → 500 token; sewa tak dihitung belanja
        let b = baca_trade(&tx(1_000_000_000, 897_955_720, 5_000, None, "500"), "W", "s", 1).unwrap();
        assert!(b.beli && b.token == 500 && b.sol == 100_000_000 && b.mint == "M");
        // jual 200 token → +0,05 SOL
        let j = baca_trade(&tx(1_000_000_000, 1_049_995_000, 5_000, Some("500"), "300"), "W", "s", 1).unwrap();
        assert!(!j.beli && j.token == 200 && j.sol == 50_000_000);
        // terima token tanpa bayar berarti (sewa saja) → bukan trade
        assert!(baca_trade(&tx(1_000_000_000, 997_955_720, 5_000, None, "500"), "W", "s", 1).is_none());
        // token naik & SOL naik → bukan beli/jual
        assert!(baca_trade(&tx(1_000_000_000, 1_100_000_000, 5_000, None, "500"), "W", "s", 1).is_none());
        // wallet tak ada di transaksi
        assert!(baca_trade(&tx(1, 1, 0, None, "5"), "X", "s", 1).is_none());
    }
}
