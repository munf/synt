//! Trading BNB Chain (2026-11-03, izin pemilik; lab saja): beli/jual token four.meme, Flap.sh & yang sudah lulus.
//!
//! | rute | apa |
//! |---|---|
//! | `POST /dagang/bnb/siapkan` | deteksi jalur → susun calldata → `eth_simulateV1` → kembalikan tx TAK bertanda (+ approve bila perlu) |
//! | `POST /dagang/bnb/lacak` | wallet sudah mengirim (`eth_sendTransaction`) → periksa pengirim & isi → lacak receipt |
//! | `GET /dagang/bnb/saldo?token=` | BNB + saldo satu token |
//! | `GET /dagang/bnb/posisi` | posisi per token (transaksi berhasil + saldo on-chain) |
//!
//! `GET /dagang/:id` & `/dagang/riwayat` dipakai bersama Solana (baris dipisah per akun; akun = satu jenis wallet).
//!
//! ## Jalur (diukur di mainnet 3 Nov dgn `eth_simulateV1`)
//! | jalur | syarat | beli | jual (approve ke) |
//! |---|---|---|---|
//! | four.meme | Helper3 `getTokenInfo`: manager = TM2, belum `liquidityAdded`, quote = BNB | TM2 `buyTokenAMAP(token, funds, min)` | TM2 `sellToken(0, token, amount, min)` (TM2) |
//! | Flap.sh | Portal `getTokenV5` status 1 | Portal `swapExactInput((0, token, funds, min, ""))` | `swapExactInput((token, 0, amount, min, ""))` (Portal) |
//! | KyberSwap | selain itu (lulus ke PancakeSwap V2/V3/Infinity dll.) | API route + build; router WAJIB = konstanta | sama (router) |
//!
//! ⛔ four.meme ber-quote token lain (USD1, xxxB): jualnya DITOLAK kontrak (revert "GW", 3 Nov) → tak didukung, beli juga
//! tidak (jangan sampai pengguna bisa membeli tapi tak bisa menjual). Batas min (`min`) ditegakkan kontrak — terukur:
//! min raksasa → revert "Slippage" (four.meme) / galat kustom (Flap).
//!
//! ## Uji beli-lalu-jual
//! Tiap beli disimulasikan [beli, approve, jual SEMUA hasilnya] dlm SATU `eth_simulateV1`: token yang tak bisa dijual
//! kembali (honeypot) ditolak SEBELUM dibeli, dan BNB yang kembali tampil di tinjauan (pajak + biaya kurva terlihat).
//!
//! ⛔ Non-custodial: wallet pengguna yang menandatangani & mengirim; layanan tak pernah memegang kunci.
//! synt TANPA biaya (keputusan pemilik 2 Nov); Kyber dipanggil tanpa parameter fee.
//! RPC: `AKUN_BSC_RPC_URL` (bawaan RPC publik BNB Chain — hanya baca & simulasi; pengiriman lewat wallet).

use crate::api::{asal_sah, ip_klien, pengguna_sesi, AppState, Baris, Galat, Hasil};
use axum::{
    extract::{ConnectInfo, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sha3::Keccak256;
use sqlx::PgPool;
use std::{net::SocketAddr, sync::Arc, time::{Duration, Instant}};
use tracing::{info, warn};

pub type Alamat = [u8; 20];

const RPC_BAWAAN: &str = "https://bsc-dataseed.bnbchain.org";
const TM2: &str = "0x5c952063c7fc8610ffdb798152d69f0b9550762b";
/// TokenManager V1 (token < 2024-09-05): kurvanya tak didukung; yang sudah lulus lewat Kyber
const TM1: &str = "0xec4549cadce5da21df6e6422d448034b5233bfbc";
const HELPER3: &str = "0xf251f83e40a78868fcfa3fa4599dad6494e46034";
const PORTAL: &str = "0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0";
/// MetaAggregationRouterV2 KyberSwap. Calldata dari API yang menuju alamat lain DITOLAK.
const KYBER_ROUTER: &str = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5";
const KYBER_API: &str = "https://aggregator-api.kyberswap.com/bsc/api/v1";
/// penanda native di Kyber; juga alamat log transfer native di `eth_simulateV1` `traceTransfers`
const NATIVE: &str = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WEI_MIN: u128 = 1_000_000_000_000_000; // 0,001 BNB
const WEI_MAKS: u128 = 50_000_000_000_000_000_000; // 50 BNB

const RPC_GAGAL: Galat = Galat(StatusCode::BAD_GATEWAY, "BNB Chain is not responding. Try again in a moment.");
const KURANG_BNB: Galat = Galat(StatusCode::UNPROCESSABLE_ENTITY, "Not enough BNB for this trade plus gas.");
const SIBUK: Galat = Galat(StatusCode::SERVICE_UNAVAILABLE, "The swap router is busy. Try again in a few seconds.");
const PAJAK: Galat = Galat(
    StatusCode::UNPROCESSABLE_ENTITY,
    "This token's transfer tax is higher than your slippage. Raise slippage or trade a smaller amount.",
);

// ── hex & ABI ───────────────────────────────────────────────────────────────

fn dari_hex(s: &str) -> Option<Vec<u8>> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
}

fn ke_hex(b: &[u8]) -> String {
    let mut s = String::with_capacity(2 + b.len() * 2);
    s.push_str("0x");
    for x in b {
        s.push_str(&format!("{x:02x}"));
    }
    s
}

pub fn alamat(s: &str) -> Option<Alamat> {
    let s = s.trim();
    if s.len() != 42 || !s.starts_with("0x") {
        return None;
    }
    dari_hex(s)?.try_into().ok()
}

fn konst(s: &str) -> Alamat {
    alamat(s).expect("konstanta alamat")
}

/// "0x1a" → u128 (None bila bukan hex / melewati u128)
fn u_hex(v: &Value) -> Option<u128> {
    let s = v.as_str()?.strip_prefix("0x")?;
    if s.is_empty() {
        return Some(0);
    }
    u128::from_str_radix(s, 16).ok()
}

fn pilih(sig: &str) -> [u8; 4] {
    let h = Keccak256::digest(sig.as_bytes());
    [h[0], h[1], h[2], h[3]]
}

fn ku(x: u128) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[16..].copy_from_slice(&x.to_be_bytes());
    w
}

fn ka(a: &Alamat) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[12..].copy_from_slice(a);
    w
}

fn kode(sig: &str, kata: &[[u8; 32]]) -> Vec<u8> {
    let mut v = pilih(sig).to_vec();
    for k in kata {
        v.extend_from_slice(k);
    }
    v
}

/// kata ke-`i` jawaban ABI sbg u128 (None bila > u128 atau tak ada)
fn baca_u(d: &[u8], i: usize) -> Option<u128> {
    let w = d.get(i * 32..i * 32 + 32)?;
    if w[..16].iter().any(|b| *b != 0) {
        return None;
    }
    Some(u128::from_be_bytes(w[16..].try_into().ok()?))
}

fn baca_a(d: &[u8], i: usize) -> Option<Alamat> {
    d.get(i * 32 + 12..i * 32 + 32)?.try_into().ok()
}

/// topic `Transfer(address,address,uint256)` — dipakai ERC-20 & log native `traceTransfers`
fn topik_transfer() -> String {
    ke_hex(&Keccak256::digest(b"Transfer(address,address,uint256)"))
}

#[derive(Clone, Debug)]
pub struct Panggilan {
    pub ke: Alamat,
    pub data: Vec<u8>,
    pub nilai: u128,
}

impl Panggilan {
    /// pembanding transaksi yang kembali dari wallet: SHA-256 (to ‖ value ‖ data)
    fn sidik(&self) -> Vec<u8> {
        let mut h = Sha256::new();
        h.update(self.ke);
        h.update(ku(self.nilai));
        h.update(&self.data);
        h.finalize().to_vec()
    }
}

fn approve(token: &Alamat, spender: &Alamat, jumlah: u128) -> Panggilan {
    Panggilan { ke: *token, data: kode("approve(address,uint256)", &[ka(spender), ku(jumlah)]), nilai: 0 }
}

/// Flap Portal `swapExactInput((address,address,uint256,uint256,bytes))` — tuple dinamis (bytes kosong)
fn flap_swap(masuk: &Alamat, keluar: &Alamat, jumlah: u128, min: u128, nilai: u128) -> Panggilan {
    Panggilan {
        ke: konst(PORTAL),
        data: kode(
            "swapExactInput((address,address,uint256,uint256,bytes))",
            &[ku(0x20), ka(masuk), ka(keluar), ku(jumlah), ku(min), ku(0xa0), ku(0)],
        ),
        nilai,
    }
}

// ── klien ───────────────────────────────────────────────────────────────────

pub struct Bnb {
    http: reqwest::Client,
    rpc: String,
    dash: String,
    kyber_terakhir: tokio::sync::Mutex<Instant>,
}

/// satu panggilan hasil `eth_simulateV1`
struct HasilSim {
    ok: bool,
    gas: u64,
    log: Vec<Value>,
    galat: String,
}

impl Bnb {
    pub fn baru(dash: String) -> anyhow::Result<Arc<Self>> {
        let rpc = std::env::var("AKUN_BSC_RPC_URL").ok().filter(|x| !x.trim().is_empty()).unwrap_or_else(|| RPC_BAWAAN.into());
        // ⚠️ tanpa User-Agent, Cloudflare di depan API Kyber menjawab 403 (terukur 3 Nov)
        let http = reqwest::Client::builder().timeout(Duration::from_secs(15)).user_agent("synt-akun/1.0").build()?;
        Ok(Arc::new(Self { http, rpc, dash, kyber_terakhir: tokio::sync::Mutex::new(Instant::now() - Duration::from_secs(5)) }))
    }

    async fn rpc(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        let v: Value = self
            .http
            .post(&self.rpc)
            .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }))
            .send()
            .await?
            .json()
            .await?;
        if let Some(e) = v.get("error") {
            anyhow::bail!("{}", e["message"].as_str().unwrap_or("galat RPC"));
        }
        Ok(v["result"].clone())
    }

    async fn panggil(&self, ke: &Alamat, data: &[u8]) -> anyhow::Result<Vec<u8>> {
        let r = self.rpc("eth_call", json!([{ "to": ke_hex(ke), "data": ke_hex(data) }, "latest"])).await?;
        dari_hex(r.as_str().unwrap_or_default()).ok_or_else(|| anyhow::anyhow!("eth_call bukan hex"))
    }

    pub async fn saldo_bnb(&self, w: &Alamat) -> anyhow::Result<u128> {
        u_hex(&self.rpc("eth_getBalance", json!([ke_hex(w), "latest"])).await?).ok_or_else(|| anyhow::anyhow!("saldo bukan angka"))
    }

    pub async fn saldo_token(&self, token: &Alamat, w: &Alamat) -> anyhow::Result<u128> {
        baca_u(&self.panggil(token, &kode("balanceOf(address)", &[ka(w)])).await?, 0).ok_or_else(|| anyhow::anyhow!("balanceOf"))
    }

    async fn izin(&self, token: &Alamat, w: &Alamat, spender: &Alamat) -> anyhow::Result<u128> {
        // allowance "tak terbatas" (2^256-1) melewati u128 → anggap cukup
        let d = self.panggil(token, &kode("allowance(address,address)", &[ka(w), ka(spender)])).await?;
        Ok(baca_u(&d, 0).unwrap_or(if d.len() >= 32 { u128::MAX } else { 0 }))
    }

    pub async fn desimal(&self, token: &Alamat) -> Option<u8> {
        baca_u(&self.panggil(token, &kode("decimals()", &[])).await.ok()?, 0).filter(|d| *d <= 36).map(|d| d as u8)
    }

    /// Simulasi berurutan atas state terbaru. `Err(KURANG_BNB)` bila saldo tak cukup utk `value`.
    async fn simulasi(&self, dari: &Alamat, calls: &[Panggilan]) -> Result<Vec<HasilSim>, Galat> {
        let isi: Vec<Value> = calls
            .iter()
            .map(|c| json!({ "from": ke_hex(dari), "to": ke_hex(&c.ke), "data": ke_hex(&c.data), "value": format!("0x{:x}", c.nilai) }))
            .collect();
        let r = self
            .rpc("eth_simulateV1", json!([{ "blockStateCalls": [{ "calls": isi }], "traceTransfers": true }, "latest"]))
            .await
            .map_err(|e| {
                let t = e.to_string();
                if t.contains("insufficient funds") {
                    return KURANG_BNB;
                }
                warn!("eth_simulateV1: {t}");
                RPC_GAGAL
            })?;
        let hasil: Vec<HasilSim> = r[0]["calls"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|c| HasilSim {
                ok: c["status"].as_str() == Some("0x1"),
                gas: u_hex(&c["gasUsed"]).unwrap_or(0) as u64,
                log: c["logs"].as_array().cloned().unwrap_or_default(),
                galat: c["error"]["message"].as_str().unwrap_or_default().to_string(),
            })
            .collect();
        if hasil.len() != calls.len() {
            warn!("eth_simulateV1: jumlah hasil {} ≠ {}", hasil.len(), calls.len());
            return Err(RPC_GAGAL);
        }
        Ok(hasil)
    }

    /// KyberSwap route + build. Router selain konstanta DITOLAK; `value` harus = jumlah BNB yang ditawarkan.
    async fn kyber(&self, masuk: &str, keluar: &str, jumlah: u128, wallet: &Alamat, slip: u16) -> Result<(Panggilan, u128, String), Galat> {
        {
            let mut t = self.kyber_terakhir.lock().await;
            let tunggu = Duration::from_millis(350).saturating_sub(t.elapsed());
            if tunggu > Duration::from_secs(8) {
                return Err(SIBUK);
            }
            tokio::time::sleep(tunggu).await;
            *t = Instant::now();
        }
        let tanpa_rute = Galat(StatusCode::UNPROCESSABLE_ENTITY, "No route for this token on BNB Chain right now.");
        let rute: Value = self
            .http
            .get(format!("{KYBER_API}/routes"))
            .header("x-client-id", "synt")
            .query(&[("tokenIn", masuk), ("tokenOut", keluar), ("amountIn", &jumlah.to_string())])
            .send()
            .await
            .map_err(|e| {
                warn!("kyber routes: {e}");
                SIBUK
            })?
            .json()
            .await
            .map_err(|_| SIBUK)?;
        let ringkas = &rute["data"]["routeSummary"];
        if ringkas.is_null() {
            info!(masuk, keluar, kode = %rute["code"], pesan = %rute["message"], "kyber tanpa rute");
            return Err(tanpa_rute);
        }
        let mut label: Vec<String> = Vec::new();
        for x in ringkas["route"].as_array().into_iter().flatten().flat_map(|r| r.as_array().cloned().unwrap_or_default()) {
            if let Some(e) = x["exchange"].as_str() {
                if !label.iter().any(|l| l == e) {
                    label.push(e.to_string());
                }
            }
        }
        let w = ke_hex(wallet);
        let bangun: Value = self
            .http
            .post(format!("{KYBER_API}/route/build"))
            .header("x-client-id", "synt")
            .json(&json!({ "routeSummary": ringkas, "sender": w, "recipient": w, "slippageTolerance": slip }))
            .send()
            .await
            .map_err(|e| {
                warn!("kyber build: {e}");
                SIBUK
            })?
            .json()
            .await
            .map_err(|_| SIBUK)?;
        let d = &bangun["data"];
        let router = d["routerAddress"].as_str().unwrap_or_default().to_ascii_lowercase();
        if router != KYBER_ROUTER {
            warn!(router, "kyber: router tak dikenal — DITOLAK");
            return Err(Galat(StatusCode::BAD_GATEWAY, "The swap router returned an unexpected route. Nothing was sent."));
        }
        let nilai: u128 = d["transactionValue"].as_str().and_then(|x| x.parse().ok()).unwrap_or(0);
        let diharap = if masuk == NATIVE { jumlah } else { 0 };
        let (Some(data), Some(keluar_n)) = (d["data"].as_str().and_then(dari_hex), d["amountOut"].as_str().and_then(|x| x.parse::<u128>().ok()))
        else {
            return Err(tanpa_rute);
        };
        if nilai != diharap {
            warn!(nilai, diharap, "kyber: value tak sesuai — DITOLAK");
            return Err(Galat(StatusCode::BAD_GATEWAY, "The swap router returned an unexpected route. Nothing was sent."));
        }
        Ok((Panggilan { ke: konst(KYBER_ROUTER), data, nilai }, keluar_n, label.join(" → ")))
    }
}

// ── jalur ───────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Jalur {
    Four,
    Flap,
    Kyber,
}

impl Jalur {
    fn nama(self) -> &'static str {
        match self {
            Jalur::Four => "four.meme",
            Jalur::Flap => "Flap.sh",
            Jalur::Kyber => "KyberSwap",
        }
    }
    fn spender(self) -> Alamat {
        konst(match self {
            Jalur::Four => TM2,
            Jalur::Flap => PORTAL,
            Jalur::Kyber => KYBER_ROUTER,
        })
    }
}

/// Di mana token diperdagangkan SEKARANG: kurva four.meme, kurva Flap, atau pasar DEX (Kyber).
pub async fn jalur(b: &Bnb, token: &Alamat) -> Result<Jalur, Galat> {
    let tak_didukung = |t: &'static str| Err(Galat(StatusCode::UNPROCESSABLE_ENTITY, t));
    // four.meme: getTokenInfo → (version, tokenManager, quote, …, liquidityAdded = kata 11)
    if let Ok(d) = b.panggil(&konst(HELPER3), &kode("getTokenInfo(address)", &[ka(token)])).await {
        let manager = baca_a(&d, 1);
        let lulus = baca_u(&d, 11).unwrap_or(0) != 0;
        if manager == Some(konst(TM2)) || manager == Some(konst(TM1)) {
            if lulus {
                return Ok(Jalur::Kyber);
            }
            if manager == Some(konst(TM1)) {
                return tak_didukung("This is an older four.meme token. synt cannot trade its curve yet.");
            }
            if baca_a(&d, 2) != Some([0u8; 20]) {
                return tak_didukung("This four.meme token trades against a token other than BNB. synt supports BNB pairs only for now.");
            }
            return Ok(Jalur::Four);
        }
    }
    // Flap: getTokenV5 → (status, …, quoteToken = kata 9, nativeToQuoteSwapEnabled = kata 10)
    if let Ok(d) = b.panggil(&konst(PORTAL), &kode("getTokenV5(address)", &[ka(token)])).await {
        match baca_u(&d, 0) {
            Some(1) => {
                if baca_a(&d, 9).is_some_and(|q| q != [0u8; 20]) && baca_u(&d, 10).unwrap_or(0) == 0 {
                    return tak_didukung("This Flap token trades against a token other than BNB. synt supports BNB pairs only for now.");
                }
                return Ok(Jalur::Flap);
            }
            Some(2) | Some(3) => return tak_didukung("This Flap token is not tradable right now."),
            _ => {}
        }
    }
    Ok(Jalur::Kyber)
}

fn beli_kurva(j: Jalur, token: &Alamat, dana: u128, min: u128) -> Panggilan {
    match j {
        Jalur::Four => Panggilan { ke: konst(TM2), data: kode("buyTokenAMAP(address,uint256,uint256)", &[ka(token), ku(dana), ku(min)]), nilai: dana },
        _ => flap_swap(&[0u8; 20], token, dana, min, dana),
    }
}

fn jual_kurva(j: Jalur, token: &Alamat, jumlah: u128, min: u128) -> Panggilan {
    match j {
        Jalur::Four => Panggilan {
            ke: konst(TM2),
            data: kode("sellToken(uint256,address,uint256,uint256)", &[ku(0), ka(token), ku(jumlah), ku(min)]),
            nilai: 0,
        },
        _ => flap_swap(token, &[0u8; 20], jumlah, min, 0),
    }
}

/// jumlah `Transfer` ke (`masuk = true`) / dari wallet di log satu panggilan; `asal` = token, atau NATIVE utk BNB
fn hitung_transfer(log: &[Value], asal: &str, w: &Alamat, masuk: bool) -> u128 {
    let topik = topik_transfer();
    let kunci = ke_hex(&ka(w));
    log.iter()
        .filter(|l| l["address"].as_str().is_some_and(|a| a.eq_ignore_ascii_case(asal)))
        .filter(|l| l["topics"][0].as_str() == Some(topik.as_str()))
        .filter(|l| l["topics"][if masuk { 2 } else { 1 }].as_str().is_some_and(|t| t.eq_ignore_ascii_case(&kunci)))
        .filter_map(|l| u_hex(&l["data"]))
        .sum()
}

fn arti_galat(t: &str) -> Galat {
    let teks = if t.contains("insufficient funds") {
        "Not enough BNB for this trade plus gas."
    } else if t.contains("Slippage") || t.contains("Return amount is not enough") || t.contains("INSUFFICIENT_OUTPUT") {
        "Price moved past your slippage. Raise slippage or try again."
    } else if t.contains("exceeds balance") || t.contains("TRANSFER_FROM_FAILED") {
        "Not enough balance for this trade."
    } else {
        "The trade failed in a test run, so nothing was sent."
    };
    Galat(StatusCode::UNPROCESSABLE_ENTITY, teks)
}

/// x × (1 − bps/10.000) tanpa luapan u128
fn minus_slip(x: u128, bps: u16) -> u128 {
    let sisa = 10_000 - bps.min(10_000) as u128;
    x / 10_000 * sisa + x % 10_000 * sisa / 10_000
}

pub struct Kutipan {
    pub jalur: Jalur,
    pub rute: String,
    pub tx: Panggilan,
    pub gas: u64,
    /// jual: approve yang harus dikirim lebih dulu (izin < jumlah)
    pub approval: Option<Panggilan>,
    pub masuk: u128,
    pub keluar: u128,
    pub minimal: u128,
    /// beli: BNB yang kembali bila seluruh hasil langsung dijual (uji beli-lalu-jual)
    pub balik: Option<u128>,
}

/// Inti `siapkan` (juga dipakai `synt-akun uji-bnb`): kutip + simulasi, tanpa DB.
/// beli: `jumlah` = wei. jual: `jumlah` = unit token mentah.
pub async fn kutip(b: &Bnb, w: &Alamat, token: &Alamat, beli: bool, jumlah: u128, slip: u16) -> Result<Kutipan, Galat> {
    let j = jalur(b, token).await?;
    let token_hex = ke_hex(token);
    if beli {
        let (tx0, rute, kyber_keluar) = match j {
            Jalur::Kyber => {
                let (p, k, r) = b.kyber(NATIVE, &token_hex, jumlah, w, slip).await?;
                (p, r, Some(k))
            }
            _ => (beli_kurva(j, token, jumlah, 0), j.nama().to_string(), None),
        };
        let s1 = b.simulasi(w, &[tx0.clone()]).await?;
        if !s1[0].ok {
            info!(token = %token_hex, galat = %s1[0].galat, "simulasi beli menolak");
            return Err(arti_galat(&s1[0].galat));
        }
        let dapat = hitung_transfer(&s1[0].log, &token_hex, w, true);
        if dapat == 0 {
            return Err(Galat(StatusCode::UNPROCESSABLE_ENTITY, "The buy returned no tokens in a test run, so nothing was sent."));
        }
        let (tx, minimal) = match kyber_keluar {
            Some(k) => {
                let min = minus_slip(k, slip);
                if dapat < min {
                    return Err(PAJAK);
                }
                (tx0, min)
            }
            None => {
                let min = minus_slip(dapat, slip);
                (beli_kurva(j, token, jumlah, min), min)
            }
        };
        // uji beli-lalu-jual: [beli final, approve, jual semua] — honeypot ditolak di sini
        let jual0 = match j {
            Jalur::Kyber => b.kyber(&token_hex, NATIVE, dapat, w, 5_000).await.map_err(|_| {
                Galat(StatusCode::UNPROCESSABLE_ENTITY, "synt could not check that this token can be sold back, so nothing was sent.")
            })?.0,
            _ => jual_kurva(j, token, dapat, 0),
        };
        let s2 = b.simulasi(w, &[tx.clone(), approve(token, &j.spender(), dapat), jual0]).await?;
        if !s2[0].ok {
            return Err(arti_galat(&s2[0].galat));
        }
        if !s2[1].ok || !s2[2].ok {
            warn!(token = %token_hex, jalur = j.nama(), galat = %s2[2].galat, "uji jual-balik GAGAL — beli ditolak");
            return Err(Galat(
                StatusCode::UNPROCESSABLE_ENTITY,
                "Selling this token back failed in a test run, so synt will not buy it.",
            ));
        }
        let balik = hitung_transfer(&s2[2].log, NATIVE, w, true);
        let gas = s2[0].gas * 5 / 4 + 30_000;
        return Ok(Kutipan { jalur: j, rute, tx, gas, approval: None, masuk: jumlah, keluar: dapat, minimal, balik: Some(balik) });
    }

    let spender = j.spender();
    let izin = b.izin(token, w, &spender).await.map_err(|e| {
        warn!("allowance: {e}");
        RPC_GAGAL
    })?;
    let approval = (izin < jumlah).then(|| approve(token, &spender, jumlah));
    let (tx0, rute, kyber_keluar) = match j {
        Jalur::Kyber => {
            let (p, k, r) = b.kyber(&token_hex, NATIVE, jumlah, w, slip).await?;
            (p, r, Some(k))
        }
        _ => (jual_kurva(j, token, jumlah, 0), j.nama().to_string(), None),
    };
    let mut calls: Vec<Panggilan> = approval.iter().cloned().collect();
    calls.push(tx0.clone());
    let s1 = b.simulasi(w, &calls).await?;
    let akhir = s1.last().expect("satu panggilan");
    if !s1[0].ok && approval.is_some() {
        return Err(Galat(StatusCode::UNPROCESSABLE_ENTITY, "The approval failed in a test run, so nothing was sent."));
    }
    if !akhir.ok {
        info!(token = %token_hex, galat = %akhir.galat, "simulasi jual menolak");
        return Err(arti_galat(&akhir.galat));
    }
    let dapat = hitung_transfer(&akhir.log, NATIVE, w, true);
    if dapat == 0 {
        return Err(Galat(StatusCode::UNPROCESSABLE_ENTITY, "The sale returned no BNB in a test run, so nothing was sent."));
    }
    let gas = akhir.gas * 5 / 4 + 30_000;
    let (tx, minimal) = match kyber_keluar {
        Some(k) => {
            let min = minus_slip(k, slip);
            if dapat < min {
                return Err(PAJAK);
            }
            (tx0, min)
        }
        None => {
            let min = minus_slip(dapat, slip);
            (jual_kurva(j, token, jumlah, min), min)
        }
    };
    Ok(Kutipan { jalur: j, rute, tx, gas, approval, masuk: jumlah, keluar: dapat, minimal, balik: None })
}

// ── rute HTTP ───────────────────────────────────────────────────────────────

fn mesin(s: &AppState) -> Hasil<&Arc<Bnb>> {
    s.bnb.as_ref().ok_or(Galat(StatusCode::SERVICE_UNAVAILABLE, "BNB trading is not available right now."))
}

fn tanpa_cache(v: Value) -> Response {
    let mut r = Json(v).into_response();
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r
}

async fn akun_evm(s: &AppState, h: &HeaderMap) -> Hasil<(Baris, Alamat)> {
    let b = pengguna_sesi(s, h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Sign in with your wallet to trade."))?;
    let w = alamat(&b.wallet)
        .ok_or(Galat(StatusCode::BAD_REQUEST, "BNB Chain trades need an EVM wallet account. Sign in with a 0x address."))?;
    Ok((b, w))
}

async fn jaga(s: &AppState, h: &HeaderMap, peer: SocketAddr) -> Hasil<(Baris, Alamat)> {
    asal_sah(h, s)?;
    if !s.rem_dagang.izinkan(ip_klien(h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many trade requests. Wait a minute."));
    }
    akun_evm(s, h).await
}

async fn jaga_baca(s: &AppState, h: &HeaderMap, peer: SocketAddr) -> Hasil<(Baris, Alamat)> {
    if !s.rem_baca_dagang.izinkan(ip_klien(h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many requests. Wait a minute."));
    }
    akun_evm(s, h).await
}

fn token_sah(t: &str) -> Hasil<Alamat> {
    let a = alamat(t).ok_or(Galat(StatusCode::BAD_REQUEST, "This is not a valid token address."))?;
    if a == [0u8; 20] || a == konst(NATIVE) {
        return Err(Galat(StatusCode::BAD_REQUEST, "Pick a token to trade against BNB."));
    }
    Ok(a)
}

fn tx_json(p: &Panggilan, gas: Option<u64>) -> Value {
    json!({
        "to": ke_hex(&p.ke),
        "data": ke_hex(&p.data),
        "value": format!("0x{:x}", p.nilai),
        "gas": gas.map(|g| format!("0x{g:x}")),
    })
}

#[derive(Deserialize)]
pub struct TanyaSaldo {
    token: Option<String>,
}

pub async fn saldo(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Query(q): Query<TanyaSaldo>,
) -> Hasil<Response> {
    let b = mesin(&s)?;
    let (akun, w) = jaga_baca(&s, &h, peer).await?;
    let bnb = b.saldo_bnb(&w).await.map_err(|e| {
        warn!("eth_getBalance: {e}");
        RPC_GAGAL
    })?;
    let token = match q.token.as_deref() {
        Some(t) => {
            let t = token_sah(t)?;
            let a = b.saldo_token(&t, &w).await.map_err(|e| {
                warn!("balanceOf: {e}");
                RPC_GAGAL
            })?;
            Some(json!({ "amount": a.to_string(), "decimals": b.desimal(&t).await.unwrap_or(18) }))
        }
        None => None,
    };
    Ok(tanpa_cache(json!({ "wallet": akun.wallet, "bnbWei": bnb.to_string(), "token": token })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Siapkan {
    token: String,
    /// "buy" | "sell"
    side: String,
    /// buy: wei · sell: unit token mentah
    amount: Option<String>,
    /// sell saja: persen saldo (1–100), dihitung di server dari saldo on-chain terbaru
    percent: Option<u8>,
    slippage_bps: u16,
}

pub async fn siapkan(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<Siapkan>,
) -> Hasil<Response> {
    let b = mesin(&s)?.clone();
    let (akun, w) = jaga(&s, &h, peer).await?;
    let token = token_sah(&m.token)?;
    let beli = match m.side.as_str() {
        "buy" => true,
        "sell" => false,
        _ => return Err(Galat(StatusCode::BAD_REQUEST, "Side must be buy or sell.")),
    };
    if !(1..=5000).contains(&m.slippage_bps) {
        return Err(Galat(StatusCode::BAD_REQUEST, "Slippage must be between 0.01% and 50%."));
    }
    let jumlah: u128 = if beli {
        let wei: u128 = m.amount.as_deref().and_then(|a| a.parse().ok()).ok_or(Galat(StatusCode::BAD_REQUEST, "Enter an amount of BNB."))?;
        if !(WEI_MIN..=WEI_MAKS).contains(&wei) {
            return Err(Galat(StatusCode::BAD_REQUEST, "Buy amount must be between 0.001 and 50 BNB."));
        }
        wei
    } else {
        let punya = b.saldo_token(&token, &w).await.map_err(|e| {
            warn!("saldo jual: {e}");
            RPC_GAGAL
        })?;
        if punya == 0 {
            return Err(Galat(StatusCode::BAD_REQUEST, "You do not hold this token."));
        }
        let j = match (m.percent, m.amount.as_deref()) {
            (Some(p @ 1..=100), _) => punya / 100 * p as u128 + punya % 100 * p as u128 / 100,
            (None, Some(a)) => a.parse::<u128>().map_err(|_| Galat(StatusCode::BAD_REQUEST, "Enter an amount to sell."))?,
            _ => return Err(Galat(StatusCode::BAD_REQUEST, "Enter an amount or a percentage to sell.")),
        };
        if j == 0 || j > punya {
            return Err(Galat(StatusCode::BAD_REQUEST, "You cannot sell more than you hold."));
        }
        j
    };

    let k = kutip(&b, &w, &token, beli, jumlah, m.slippage_bps).await?;
    let token_hex = ke_hex(&token);
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO dagang (pengguna_id, wallet, mint, sisi, masuk, perkiraan_keluar, minimal_keluar, slippage_bps,
                             prioritas_lamports, rute, pesan_hash, blok_akhir, chain)
         VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8, 0, $9, $10, 0, 'bnb')
         RETURNING id",
    )
    .bind(akun.id)
    .bind(ke_hex(&w))
    .bind(&token_hex)
    .bind(if beli { "beli" } else { "jual" })
    .bind(k.masuk.to_string())
    .bind(k.keluar.to_string())
    .bind(k.minimal.to_string())
    .bind(m.slippage_bps as i32)
    .bind(format!("{} · {}", k.jalur.nama(), k.rute))
    .bind(k.tx.sidik())
    .fetch_one(&s.pool)
    .await?;

    let harga_gas = b.rpc("eth_gasPrice", json!([])).await.ok().as_ref().and_then(u_hex).unwrap_or(100_000_000);
    Ok(tanpa_cache(json!({
        "id": id.to_string(),
        "chain": "bnb",
        "side": m.side,
        "mint": token_hex,
        "inAmount": k.masuk.to_string(),
        "outAmount": k.keluar.to_string(),
        "minOut": k.minimal.to_string(),
        "priceImpactPct": null,
        "route": if k.jalur == Jalur::Kyber { format!("KyberSwap: {}", k.rute) } else { k.rute.clone() },
        "venue": k.jalur.nama(),
        "tx": tx_json(&k.tx, Some(k.gas)),
        // approve ke kontrak jalur, sebesar jumlah jual SAJA (bukan tak terbatas)
        "approval": k.approval.as_ref().map(|a| tx_json(a, None)),
        "roundTripWei": k.balik.map(|x| x.to_string()),
        "networkFeeWei": (k.gas as u128 * harga_gas + if k.approval.is_some() { 50_000 * harga_gas } else { 0 }).to_string(),
        "decimals": b.desimal(&token).await,
    })))
}

#[derive(Deserialize)]
pub struct Lacak {
    id: String,
    hash: String,
}

pub async fn lacak(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<Lacak>,
) -> Hasil<Response> {
    let b = mesin(&s)?.clone();
    let (akun, w) = jaga(&s, &h, peer).await?;
    let id: i64 = m.id.parse().map_err(|_| Galat(StatusCode::BAD_REQUEST, "Unknown trade."))?;
    let hash = m.hash.trim().to_ascii_lowercase();
    if hash.len() != 66 || dari_hex(&hash).is_none() {
        return Err(Galat(StatusCode::BAD_REQUEST, "This is not a transaction hash."));
    }
    let r: Option<(String, Vec<u8>, String)> = sqlx::query_as(
        "SELECT mint, pesan_hash, status FROM dagang WHERE id = $1 AND pengguna_id = $2 AND chain = 'bnb'",
    )
    .bind(id)
    .bind(akun.id)
    .fetch_optional(&s.pool)
    .await?;
    let (token, sidik, status) = r.ok_or(Galat(StatusCode::NOT_FOUND, "Unknown trade."))?;
    if status != "disiapkan" {
        return Err(Galat(StatusCode::CONFLICT, "This trade was already sent."));
    }
    let n = sqlx::query("UPDATE dagang SET status = 'dikirim', tanda = $1, dikirim = now() WHERE id = $2 AND status = 'disiapkan'")
        .bind(&hash)
        .bind(id)
        .execute(&s.pool)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(Galat(StatusCode::CONFLICT, "This trade was already sent."));
    }
    info!(id, hash = %hash, "transaksi BNB dikirim wallet");
    tokio::spawn(lacak_tx(s.pool.clone(), b, id, w, token, hash.clone(), sidik));
    Ok(tanpa_cache(json!({ "id": id.to_string(), "signature": hash, "status": "sent" })))
}

async fn selesai(pool: &PgPool, id: i64, status: &str, galat: Option<&str>, bnb: Option<String>, token: Option<String>) {
    let r = sqlx::query(
        "UPDATE dagang SET status = $1, galat = $2, native_delta = $3::numeric, token_delta = $4::numeric, selesai = now()
          WHERE id = $5 AND status = 'dikirim'",
    )
    .bind(status)
    .bind(galat)
    .bind(bnb)
    .bind(token)
    .bind(id)
    .execute(pool)
    .await;
    if let Err(e) = r {
        warn!(id, "gagal menulis hasil transaksi BNB: {e}");
    }
}

/// Lacak sampai receipt ada / tak pernah muncul. Pengirim WAJIB wallet akun dan isinya WAJIB = yang disiapkan:
/// tanpa ini, siapa pun bisa menempelkan hash transaksi orang lain dan mengisi posisinya dgn trade milik orang lain.
pub async fn lacak_tx(pool: PgPool, b: Arc<Bnb>, id: i64, w: Alamat, token: String, hash: String, sidik: Vec<u8>) {
    let mulai = Instant::now();
    let mut diperiksa = false;
    loop {
        tokio::time::sleep(Duration::from_secs(2)).await;
        if !diperiksa {
            match b.rpc("eth_getTransactionByHash", json!([hash])).await {
                Ok(v) if !v.is_null() => {
                    if !v["from"].as_str().is_some_and(|f| f.eq_ignore_ascii_case(&ke_hex(&w))) {
                        warn!(id, "hash tx BNB bukan dari wallet akun");
                        selesai(&pool, id, "gagal", Some("This transaction was not sent from your account."), None, None).await;
                        return;
                    }
                    let isi = (|| {
                        Some(Panggilan { ke: alamat(v["to"].as_str()?)?, data: dari_hex(v["input"].as_str()?)?, nilai: u_hex(&v["value"])? })
                    })();
                    if isi.map(|p| p.sidik()) != Some(sidik.clone()) {
                        warn!(id, "tx BNB tak sama dgn yang disiapkan");
                        selesai(&pool, id, "gagal", Some("This transaction does not match the prepared trade."), None, None).await;
                        return;
                    }
                    diperiksa = true;
                }
                Ok(_) => {
                    if mulai.elapsed() > Duration::from_secs(180) {
                        selesai(&pool, id, "kedaluwarsa", Some("The transaction never reached the network. Nothing was spent."), None, None).await;
                        return;
                    }
                }
                Err(e) => warn!(id, "getTransactionByHash: {e}"),
            }
        }
        if diperiksa {
            match b.rpc("eth_getTransactionReceipt", json!([hash])).await {
                Ok(r) if !r.is_null() => {
                    if r["status"].as_str() != Some("0x1") {
                        selesai(&pool, id, "gagal", Some("The trade reverted on-chain. Only the gas fee was spent."), None, None).await;
                        return;
                    }
                    let log = r["logs"].as_array().cloned().unwrap_or_default();
                    let masuk = hitung_transfer(&log, &token, &w, true) as i128;
                    let keluar = hitung_transfer(&log, &token, &w, false) as i128;
                    // saldo blok-1 tak terbaca (state lama dibuang RPC) → beli: −(value + gas), jual: tak diketahui
                    let gas = u_hex(&r["gasUsed"]).zip(u_hex(&r["effectiveGasPrice"])).map(|(a, b)| (a * b) as i128);
                    let bnb = match delta_bnb(&b, &w, &r["blockNumber"]).await {
                        Some(x) => Some(x),
                        None => match b.rpc("eth_getTransactionByHash", json!([hash])).await.ok().and_then(|v| u_hex(&v["value"])) {
                            Some(nilai) if nilai > 0 => gas.map(|g| -(nilai as i128) - g),
                            _ => None,
                        },
                    };
                    info!(id, "transaksi BNB terkonfirmasi");
                    selesai(&pool, id, "berhasil", None, bnb.map(|x| x.to_string()), Some((masuk - keluar).to_string())).await;
                    return;
                }
                Ok(_) => {}
                Err(e) => warn!(id, "getTransactionReceipt: {e}"),
            }
        }
        if mulai.elapsed() > Duration::from_secs(900) {
            selesai(&pool, id, "kedaluwarsa", Some("Still pending after 15 minutes. Check the transaction on BscScan."), None, None).await;
            return;
        }
    }
}

/// Perubahan saldo BNB wallet di blok transaksi (termasuk gas). RPC publik hanya menyimpan state ±100 blok
/// terakhir → dibaca segera setelah receipt; gagal = None (posisi tetap tercatat dari delta token).
async fn delta_bnb(b: &Bnb, w: &Alamat, blok: &Value) -> Option<i128> {
    let n = u_hex(blok)?;
    let saldo = |x: u128| b.rpc("eth_getBalance", json!([ke_hex(w), format!("0x{x:x}")]));
    let sesudah = u_hex(&saldo(n).await.ok()?)?;
    let sebelum = u_hex(&saldo(n.checked_sub(1)?).await.ok()?)?;
    Some(sesudah as i128 - sebelum as i128)
}

/// Saat start: lanjutkan pelacakan transaksi BNB yang masih `dikirim`.
pub async fn lanjutkan(pool: PgPool, b: Arc<Bnb>) {
    let rows: Vec<(i64, String, String, Option<String>, Vec<u8>)> = match sqlx::query_as(
        "SELECT id, wallet, mint, tanda, pesan_hash FROM dagang WHERE chain = 'bnb' AND status = 'dikirim' AND tanda IS NOT NULL LIMIT 100",
    )
    .fetch_all(&pool)
    .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!("lanjutkan dagang BNB: {e}");
            return;
        }
    };
    for (id, wallet, token, hash, sidik) in rows {
        let (Some(w), Some(hash)) = (alamat(&wallet), hash) else { continue };
        tokio::spawn(lacak_tx(pool.clone(), b.clone(), id, w, token, hash, sidik));
    }
}

/// Posisi per token dari transaksi BNB BERHASIL + saldo on-chain. Nama field sama dgn posisi Solana
/// (`solSpent` = BNB wei, `solUsd` = harga BNB) agar tabel posisi terminal satu; `chain` membedakan.
pub async fn posisi(State(s): State<AppState>, ConnectInfo(peer): ConnectInfo<SocketAddr>, h: HeaderMap) -> Hasil<Response> {
    let b = mesin(&s)?;
    let (akun, w) = jaga_baca(&s, &h, peer).await?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, i64, chrono::DateTime<chrono::Utc>)>(
        "SELECT mint,
                COALESCE(sum(-native_delta) FILTER (WHERE sisi = 'beli'), 0)::text,
                COALESCE(sum(native_delta) FILTER (WHERE sisi = 'jual'), 0)::text,
                COALESCE(sum(token_delta) FILTER (WHERE sisi = 'beli'), 0)::text,
                COALESCE(sum(-token_delta) FILTER (WHERE sisi = 'jual'), 0)::text,
                count(*),
                max(selesai)
           FROM dagang
          WHERE pengguna_id = $1 AND chain = 'bnb' AND status = 'berhasil'
          GROUP BY mint
          ORDER BY max(selesai) DESC
          LIMIT 50",
    )
    .bind(akun.id)
    .fetch_all(&s.pool)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    let mut bnb_usd: Option<f64> = None;
    for (mint, modal, hasil, dibeli, dijual, n, terakhir) in rows {
        let t = alamat(&mint);
        let saldo = match t {
            Some(t) => b.saldo_token(&t, &w).await.ok(),
            None => None,
        };
        let desimal = match t {
            Some(t) => b.desimal(&t).await,
            None => None,
        };
        let info = info_dash(b, &mint).await;
        if bnb_usd.is_none() && info["quote_symbol"].as_str() == Some("BNB") {
            bnb_usd = info["quote_usd"].as_f64().filter(|x| x.is_finite() && *x > 0.0);
        }
        let teks = |k: &str, maks: usize| info[k].as_str().filter(|x| x.chars().count() <= maks).map(String::from);
        out.push(json!({
            "mint": mint,
            "solSpent": modal,
            "solReceived": hasil,
            "tokensBought": dibeli,
            "tokensSold": dijual,
            "trades": n,
            "lastTradeAt": terakhir,
            "balance": saldo.map(|x| x.to_string()),
            "decimals": desimal,
            "priceUsd": info["price_usd"].as_f64().filter(|x| x.is_finite() && *x > 0.0),
            "symbol": teks("symbol", 20),
            "name": teks("name", 60),
            // gambar synt-dash: https atau jalur /api/img milik terminal sendiri
            "icon": teks("image_thumb", 400).or_else(|| teks("image", 400)).filter(|u| u.starts_with("https://") || u.starts_with("/api/img")),
        }));
    }
    Ok(tanpa_cache(json!({ "positions": out, "solUsd": bnb_usd, "chain": "bnb" })))
}

/// Info token dari API publik synt-dash (simbol, gambar, harga). Gagal = Null: posisi tampil tanpa nama & nilai.
async fn info_dash(b: &Bnb, token: &str) -> Value {
    let r = b.http.get(format!("{}/api/bnb/token/{token}", b.dash)).timeout(Duration::from_secs(3)).send().await;
    match r {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn selektor_dikenal() {
        assert_eq!(ke_hex(&pilih("transfer(address,uint256)")), "0xa9059cbb");
        assert_eq!(ke_hex(&pilih("approve(address,uint256)")), "0x095ea7b3");
        assert_eq!(ke_hex(&pilih("getTokenInfo(address)")), "0x1f69565f");
        assert_eq!(topik_transfer(), "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
    }

    #[test]
    fn slippage_tanpa_luapan() {
        assert_eq!(minus_slip(10_000, 1_500), 8_500);
        assert_eq!(minus_slip(u128::MAX, 0), u128::MAX);
        assert_eq!(minus_slip(1, 5_000), 0);
    }

    #[test]
    fn sidik_berubah_bila_isi_berubah() {
        let p = Panggilan { ke: [1; 20], data: vec![1, 2], nilai: 5 };
        let mut q = p.clone();
        q.nilai = 6;
        assert_ne!(p.sidik(), q.sidik());
    }

    #[test]
    fn alamat_dan_hex() {
        assert_eq!(alamat(TM2).map(|a| ke_hex(&a)), Some(TM2.to_string()));
        assert!(alamat("0x123").is_none());
        assert_eq!(u_hex(&json!("0x")), Some(0));
        assert_eq!(u_hex(&json!("0x10")), Some(16));
    }
}
