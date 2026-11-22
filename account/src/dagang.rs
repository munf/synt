//! Trading terminal lab (2026-11-02, izin pemilik): beli/jual token Solana dari terminal.
//!
//! | rute | apa |
//! |---|---|
//! | `POST /dagang/siapkan` | kutip Jupiter `/build` → susun transaksi v0 TAK bertanda → simulasi → kembalikan |
//! | `POST /dagang/kirim` | terima transaksi yang SUDAH ditandatangani wallet → periksa → kirim ke RPC → lacak |
//! | `POST /dagang/lacak` | wallet yang mengirim sendiri (`signAndSendTransaction`) → hanya lacak tanda tangannya |
//! | `GET /dagang/:id` | status satu transaksi |
//! | `GET /dagang/saldo?mint=` | SOL + saldo satu token |
//! | `GET /dagang/riwayat` · `GET /dagang/posisi` | catatan & posisi per token |
//!
//! ## Non-custodial — yang TIDAK pernah terjadi di sini
//! Layanan tak memegang kunci privat dan tak bisa menandatangani. Transaksi yang dikirim balik
//! diperiksa: payer = wallet akun, tanda tangan sah atas pesan itu. Bila wallet mengubah pesan
//! (mis. menambah priority fee), transaksi tetap diteruskan — itu milik pengguna, sudah ia tanda
//! tangani — tapi dicatat di log.
//!
//! ## Kenapa `/build`, bukan `/order`
//! `/order` memungut biaya Jupiter 50 bps utk token < 24 jam — persis pair yang dinilai synt.
//! `/build` (router Metis) tanpa biaya Jupiter, dan terukur 2 Nov merutekan bonding curve pump.fun.
//! synt sendiri TIDAK memungut biaya (keputusan pemilik 2 Nov).
//!
//! ## Perakit langsung (22 Nov, izin pemilik 15 & 22 Nov — LAB saja)
//! Bila `AKUN_RAKIT_URL` diisi DAN `Origin` permintaan ada di `AKUN_RAKIT_ORIGINS` (lab), `siapkan` lebih dulu
//! meminta layanan perakit lokal (privat, di luar repo ini) merakit instruksi pump.fun langsung (curve & PumpSwap)
//! dalam bentuk jawaban `/build` yang sama — lalu jalurnya identik: susun v0 → simulasi → wallet menandatangani.
//! Transaksinya memuat tip kecil ke relay pengirim (bukan ke synt) dan `kirim` meneruskannya lewat perakit itu.
//! Perakit menolak (bukan pump.fun, koin cashback, galat apa pun) → Jupiter seperti biasa. Preview TETAP Jupiter.

use crate::api::{asal_sah, ip_klien, pengguna_sesi, AppState, Baris, Galat, Hasil};
use crate::soltx::{self, Instruksi, Kunci, Meta};
use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::{net::SocketAddr, sync::Arc, time::{Duration, Instant}};
use tracing::{info, warn};

pub const SOL: &str = "So11111111111111111111111111111111111111112";
const JUPITER_BUILD: &str = "https://api.jup.ag/swap/v2/build";
/// info token + harga USD (gratis, tanpa key; banyak mint dipisah koma); dipakai menilai posisi
const JUPITER_TOKEN: &str = "https://lite-api.jup.ag/tokens/v2/search";
/// batas CU saat simulasi; batas sebenarnya = terpakai × 1,2 + 10k
const CU_SIMULASI: u32 = 1_400_000;
const LAMPORT_MIN: u64 = 1_000_000; // 0,001 SOL
const LAMPORT_MAKS: u64 = 100_000_000_000; // 100 SOL
const PRIORITAS_MAKS: u64 = 100_000_000; // 0,1 SOL

/// Klien RPC + Jupiter. `None` di AppState bila `AKUN_RPC_URL` kosong → rute trading 503.
pub struct Dagang {
    http: reqwest::Client,
    rpc: String,
    jup_key: Option<String>,
    /// Jupiter tanpa key = 0,5 req/dtk SE-IP; dengan key gratis 1 req/dtk. Panggilan diantre di sini
    /// supaya kelebihan laju jadi tunggu sebentar, bukan 429 ke pengguna.
    jup_terakhir: tokio::sync::Mutex<Instant>,
    /// perakit langsung lokal (kosong = mati) & origin yang boleh memakainya
    langsung: Option<String>,
    langsung_asal: Vec<String>,
}

impl Dagang {
    pub fn dari_env() -> anyhow::Result<Option<Arc<Self>>> {
        let rpc = std::env::var("AKUN_RPC_URL").unwrap_or_default();
        if rpc.is_empty() {
            return Ok(None);
        }
        let http = reqwest::Client::builder().timeout(Duration::from_secs(12)).build()?;
        let jup_key = std::env::var("AKUN_JUP_API_KEY").ok().filter(|k| !k.is_empty());
        let langsung = std::env::var("AKUN_RAKIT_URL").ok().map(|u| u.trim_end_matches('/').to_string()).filter(|u| !u.is_empty());
        let langsung_asal: Vec<String> = std::env::var("AKUN_RAKIT_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(|o| o.trim().to_string())
            .filter(|o| !o.is_empty())
            .collect();
        info!(jupiter_key = jup_key.is_some(), perakit = langsung.is_some(), ?langsung_asal, "trading aktif");
        Ok(Some(Arc::new(Self {
            http,
            rpc,
            jup_key,
            jup_terakhir: tokio::sync::Mutex::new(Instant::now() - Duration::from_secs(10)),
            langsung,
            langsung_asal,
        })))
    }

    /// Perakit langsung boleh dipakai utk permintaan ini? (per permintaan: satu proses melayani lab & preview)
    pub fn langsung_untuk(&self, h: &HeaderMap) -> bool {
        let asal = h.get(header::ORIGIN).and_then(|v| v.to_str().ok()).unwrap_or("");
        self.langsung.is_some() && !asal.is_empty() && self.langsung_asal.iter().any(|o| o == asal)
    }

    /// Minta perakit lokal merakit swap. `None` = tak didukung / galat → pemanggil memakai Jupiter.
    async fn perakit(&self, wallet: &str, mint: &str, beli: bool, jumlah: u128, slippage_bps: u16) -> Option<Value> {
        let url = self.langsung.as_ref()?;
        let jumlah = u64::try_from(jumlah).ok()?;
        let r = self
            .http
            .post(format!("{url}/rakit"))
            .json(&json!({ "wallet": wallet, "mint": mint, "side": if beli { "buy" } else { "sell" }, "amount": jumlah.to_string(), "slippageBps": slippage_bps }))
            .send()
            .await
            .map_err(|e| warn!("perakit tak terjangkau: {e}"))
            .ok()?;
        let kode = r.status();
        let v: Value = r.json().await.unwrap_or(Value::Null);
        if !kode.is_success() || v.get("swapInstruction").is_none() {
            let detail = v.get("detail").cloned().unwrap_or_default();
            info!(mint, %kode, %detail, "perakit menolak; pakai Jupiter");
            return None;
        }
        Some(v)
    }

    /// Teruskan transaksi bertanda lewat perakit (relay ber-stake + RPC serentak).
    async fn kirim_langsung(&self, tx: &[u8]) -> anyhow::Result<()> {
        let url = self.langsung.as_ref().ok_or_else(|| anyhow::anyhow!("perakit mati"))?;
        let r = self.http.post(format!("{url}/kirim")).json(&json!({ "transaction": B64.encode(tx) })).send().await?;
        anyhow::ensure!(r.status().is_success(), "perakit menolak kirim: {}", r.status());
        Ok(())
    }

    pub async fn rpc(&self, method: &str, params: Value) -> anyhow::Result<Value> {
        let r: Value = self
            .http
            .post(&self.rpc)
            .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }))
            .send()
            .await?
            .json()
            .await?;
        if let Some(e) = r.get("error") {
            anyhow::bail!("RPC {method}: {e}");
        }
        Ok(r["result"].clone())
    }

    pub(crate) fn http(&self) -> &reqwest::Client {
        &self.http
    }

    /// Banyak panggilan satu metode dalam SATU permintaan batch JSON-RPC; hasil sejajar urutan `params` (galat → Null).
    pub(crate) async fn rpc_batch(&self, method: &str, params: Vec<Value>) -> anyhow::Result<Vec<Value>> {
        if params.is_empty() {
            return Ok(vec![]);
        }
        let isi: Vec<Value> = params.into_iter().enumerate().map(|(i, p)| json!({ "jsonrpc": "2.0", "id": i, "method": method, "params": p })).collect();
        let n = isi.len();
        let mut coba = 0;
        let r: Value = loop {
            let jawab = self.http.post(&self.rpc).json(&isi).send().await.map_err(|e| anyhow::anyhow!("RPC batch {method}: {}", e.without_url()))?;
            // 429 = batas laju paket RPC → tunggu & coba sekali lagi
            if jawab.status() == StatusCode::TOO_MANY_REQUESTS && coba == 0 {
                coba += 1;
                tokio::time::sleep(Duration::from_millis(1_500)).await;
                continue;
            }
            anyhow::ensure!(jawab.status().is_success(), "RPC batch {method}: status {}", jawab.status());
            break jawab.json().await?;
        };
        let mut hasil = vec![Value::Null; n];
        for x in r.as_array().ok_or_else(|| anyhow::anyhow!("RPC batch {method}: bukan array"))? {
            if let Some(i) = x["id"].as_u64().map(|i| i as usize).filter(|i| *i < n) {
                hasil[i] = x["result"].clone();
            }
        }
        Ok(hasil)
    }

    async fn jupiter(&self, q: &[(&str, String)]) -> Result<Value, Galat> {
        let jeda = if self.jup_key.is_some() { Duration::from_millis(1_050) } else { Duration::from_millis(2_100) };
        {
            let mut t = self.jup_terakhir.lock().await;
            let tunggu = (*t + jeda).saturating_duration_since(Instant::now());
            if tunggu > Duration::from_secs(8) {
                return Err(SIBUK);
            }
            tokio::time::sleep(tunggu).await;
            *t = Instant::now();
        }
        let mut req = self.http.get(JUPITER_BUILD).query(q);
        if let Some(k) = &self.jup_key {
            req = req.header("x-api-key", k);
        }
        let r = req.send().await.map_err(|e| {
            warn!("Jupiter tak terjangkau: {e}");
            Galat(StatusCode::BAD_GATEWAY, "The swap router is not responding. Try again.")
        })?;
        let kode = r.status();
        let v: Value = r.json().await.unwrap_or(Value::Null);
        if kode == StatusCode::TOO_MANY_REQUESTS {
            return Err(SIBUK);
        }
        if !kode.is_success() || v.get("swapInstruction").is_none() {
            warn!(%kode, galat = %v.get("error").unwrap_or(&v), "Jupiter /build gagal");
            return Err(Galat(StatusCode::UNPROCESSABLE_ENTITY, "No route found for this trade right now. Try a different amount."));
        }
        Ok(v)
    }
}

const SIBUK: Galat = Galat(StatusCode::TOO_MANY_REQUESTS, "Trading is busy. Try again in a few seconds.");
const MATI: Galat = Galat(StatusCode::SERVICE_UNAVAILABLE, "Trading is not available right now.");
const RPC_GAGAL: Galat = Galat(StatusCode::BAD_GATEWAY, "The Solana network is not responding. Try again.");

fn mesin(s: &AppState) -> Hasil<&Arc<Dagang>> {
    s.dagang.as_ref().ok_or(MATI)
}

fn tanpa_cache(v: Value) -> Response {
    let mut r = Json(v).into_response();
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r
}

/// Akun Solana yang masuk. Akun 0x (EVM) tak bisa memperdagangkan token Solana.
async fn akun_solana(s: &AppState, h: &HeaderMap) -> Hasil<(Baris, Kunci)> {
    let b = pengguna_sesi(s, h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Sign in with your wallet to trade."))?;
    if b.wallet.starts_with("0x") {
        return Err(Galat(StatusCode::BAD_REQUEST, "Solana trades need a Solana wallet account. Sign in with a Solana address."));
    }
    let k = soltx::kunci(&b.wallet).map_err(|_| Galat(StatusCode::BAD_REQUEST, "This account's wallet address is not valid."))?;
    Ok((b, k))
}

async fn jaga(s: &AppState, h: &HeaderMap, peer: SocketAddr) -> Hasil<(Baris, Kunci)> {
    asal_sah(h, s)?;
    if !s.rem_dagang.izinkan(ip_klien(h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many trade requests. Wait a minute."));
    }
    akun_solana(s, h).await
}

/// Rute baca yang memanggil RPC (saldo, posisi): sesi + rem per IP.
async fn jaga_baca(s: &AppState, h: &HeaderMap, peer: SocketAddr) -> Hasil<(Baris, Kunci)> {
    if !s.rem_baca_dagang.izinkan(ip_klien(h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many requests. Wait a minute."));
    }
    akun_solana(s, h).await
}

fn mint_sah(m: &str) -> Hasil<Kunci> {
    let m = m.trim();
    if m == SOL {
        return Err(Galat(StatusCode::BAD_REQUEST, "Pick a token to trade against SOL."));
    }
    soltx::kunci(m).map_err(|_| Galat(StatusCode::BAD_REQUEST, "This is not a valid token address."))
}

// ── instruksi dari Jupiter ──────────────────────────────────────────────────

fn instruksi(v: &Value) -> anyhow::Result<Instruksi> {
    let akun = v["accounts"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("accounts hilang"))?
        .iter()
        .map(|a| {
            Ok(Meta {
                kunci: soltx::kunci(a["pubkey"].as_str().unwrap_or_default())?,
                penanda: a["isSigner"].as_bool().unwrap_or(false),
                tulis: a["isWritable"].as_bool().unwrap_or(false),
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    Ok(Instruksi {
        program: soltx::kunci(v["programId"].as_str().unwrap_or_default())?,
        akun,
        data: B64.decode(v["data"].as_str().unwrap_or_default())?,
    })
}

struct Rakitan {
    /// instruksi Jupiter TANPA compute budget (budget dipasang sendiri)
    isi: Vec<Instruksi>,
    alt: Vec<(Kunci, Vec<Kunci>)>,
    blockhash: Kunci,
    blok_akhir: i64,
}

fn rakit(v: &Value) -> anyhow::Result<Rakitan> {
    let mut isi = Vec::new();
    for x in v["setupInstructions"].as_array().into_iter().flatten() {
        isi.push(instruksi(x)?);
    }
    isi.push(instruksi(&v["swapInstruction"])?);
    if !v["cleanupInstruction"].is_null() {
        isi.push(instruksi(&v["cleanupInstruction"])?);
    }
    for x in v["otherInstructions"].as_array().into_iter().flatten() {
        isi.push(instruksi(x)?);
    }
    let budget = soltx::kunci(soltx::COMPUTE_BUDGET)?;
    if isi.iter().any(|i| i.program == budget) {
        anyhow::bail!("compute budget di luar computeBudgetInstructions");
    }
    let mut alt = Vec::new();
    if let Some(peta) = v["addressesByLookupTableAddress"].as_object() {
        for (alamat, isi_tabel) in peta {
            let daftar = isi_tabel
                .as_array()
                .into_iter()
                .flatten()
                .map(|x| soltx::kunci(x.as_str().unwrap_or_default()))
                .collect::<anyhow::Result<Vec<_>>>()?;
            alt.push((soltx::kunci(alamat)?, daftar));
        }
    }
    let bh: Vec<u8> = v["blockhashWithMetadata"]["blockhash"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("blockhash hilang"))?
        .iter()
        .map(|x| x.as_u64().unwrap_or(0) as u8)
        .collect();
    Ok(Rakitan {
        isi,
        alt,
        blockhash: bh.try_into().map_err(|_| anyhow::anyhow!("blockhash bukan 32 byte"))?,
        blok_akhir: v["blockhashWithMetadata"]["lastValidBlockHeight"].as_i64().unwrap_or(0),
    })
}

fn susun(payer: &Kunci, r: &Rakitan, cu: u32, mikro: u64) -> anyhow::Result<Vec<u8>> {
    let mut ixs = vec![soltx::batas_cu(cu), soltx::harga_cu(mikro)];
    ixs.extend(r.isi.iter().cloned());
    soltx::susun_v0(payer, &ixs, &r.blockhash, &r.alt)
}

/// Galat simulasi / transaksi → kalimat untuk pengguna. Kode mentah tetap di log server.
fn arti_galat(err: &Value, log: &[String]) -> &'static str {
    let teks = err.to_string();
    let log_ada = |p: &str| log.iter().any(|l| l.contains(p));
    let kustom = err
        .get("InstructionError")
        .and_then(|x| x.get(1))
        .and_then(|x| x.get("Custom"))
        .and_then(Value::as_u64);
    if teks.contains("InsufficientFundsForFee") || teks.contains("InvalidAccountForFee") || teks.contains("AccountNotFound") || log_ada("insufficient lamports") {
        return "Not enough SOL for this trade plus the network fee.";
    }
    if log_ada("Error: insufficient funds") {
        return "Not enough balance for this trade.";
    }
    match kustom {
        // Jupiter SlippageToleranceExceeded / pump.fun TooLittleSolReceived & TooMuchSolRequired
        Some(6001) | Some(6002) | Some(6003) => "Price moved past your slippage. Raise slippage or try again.",
        Some(6005) => "This token just left the bonding curve. Try again in a moment.",
        _ => "The trade failed in simulation, so nothing was sent.",
    }
}

async fn simulasi(d: &Dagang, tx: &[u8]) -> Result<u64, Galat> {
    let v = d
        .rpc(
            "simulateTransaction",
            json!([B64.encode(tx), { "encoding": "base64", "sigVerify": false, "replaceRecentBlockhash": true, "commitment": "processed" }]),
        )
        .await
        .map_err(|e| {
            warn!("simulasi gagal dipanggil: {e}");
            RPC_GAGAL
        })?;
    let nilai = &v["value"];
    if !nilai["err"].is_null() {
        let log: Vec<String> = nilai["logs"].as_array().into_iter().flatten().filter_map(|l| l.as_str().map(String::from)).collect();
        warn!(err = %nilai["err"], ekor = ?log.iter().rev().take(4).collect::<Vec<_>>(), "simulasi menolak");
        return Err(Galat(StatusCode::UNPROCESSABLE_ENTITY, arti_galat(&nilai["err"], &log)));
    }
    Ok(nilai["unitsConsumed"].as_u64().unwrap_or(200_000))
}

pub struct Bangunan {
    /// jawaban Jupiter `/build` apa adanya (kutipan, rute)
    pub v: Value,
    pub pesan: Vec<u8>,
    /// transaksi tak bertanda siap ditandatangani wallet
    pub tx: Vec<u8>,
    pub cu: u32,
    pub blok_akhir: i64,
    /// akun token sumber ikut ditutup (jual habis) → sewa kembali ke wallet
    pub menutup: bool,
    /// "jupiter" | "langsung" (kolom `dagang.jalur`)
    pub jalur: &'static str,
    /// tip relay di dalam transaksi (lamport; 0 utk Jupiter)
    pub tip: u64,
}

/// Kutip Jupiter → rakit v0 → simulasi (CU nyata) → rakit ulang dgn batas CU & priority fee.
/// `tutup` = (akun token, program token) yang dikosongkan jual habis: ditutup di transaksi yang sama, HANYA bila
/// rute Jupiter memang menulis akun itu; bila simulasi menolak penutupan (mis. Token-2022 dgn fee tertahan), dirakit
/// ulang tanpa penutupan. Dipakai `siapkan` dan perintah uji `synt-akun uji-dagang`.
pub async fn bangun(
    d: &Dagang,
    payer: &Kunci,
    wallet: &str,
    mint: &str,
    beli: bool,
    jumlah: u128,
    slippage_bps: u16,
    prioritas: u64,
    tutup: Option<(Kunci, Kunci)>,
    langsung: bool,
) -> Result<Bangunan, Galat> {
    if langsung {
        if let Some(v) = d.perakit(wallet, mint, beli, jumlah, slippage_bps).await {
            match bangun_dari(d, payer, mint, v, prioritas, tutup, true).await {
                Ok(b) => return Ok(b),
                Err(Galat(_, p)) => info!(mint, alasan = p, "rakitan langsung gagal simulasi; pakai Jupiter"),
            }
        }
    }
    let (masuk_mint, keluar_mint) = if beli { (SOL, mint) } else { (mint, SOL) };
    let v = d
        .jupiter(&[
            ("inputMint", masuk_mint.to_string()),
            ("outputMint", keluar_mint.to_string()),
            ("amount", jumlah.to_string()),
            ("taker", wallet.to_string()),
            ("slippageBps", slippage_bps.to_string()),
        ])
        .await?;
    bangun_dari(d, payer, mint, v, prioritas, tutup, false).await
}

/// Jawaban berbentuk `/build` (Jupiter ATAU perakit langsung) → v0 → simulasi → v0 final.
async fn bangun_dari(
    d: &Dagang,
    payer: &Kunci,
    mint: &str,
    v: Value,
    prioritas: u64,
    tutup: Option<(Kunci, Kunci)>,
    langsung: bool,
) -> Result<Bangunan, Galat> {
    let mut r = rakit(&v).map_err(|e| {
        warn!("rakit Jupiter: {e}");
        Galat(StatusCode::BAD_GATEWAY, "The swap router returned an unexpected route. Try again.")
    })?;
    let mut menutup = false;
    if let Some((akun, program)) = tutup {
        if r.isi.iter().any(|ix| ix.akun.iter().any(|a| a.kunci == akun && a.tulis)) {
            r.isi.push(soltx::tutup_akun_token(program, akun, *payer));
            menutup = true;
        } else {
            warn!(mint, "akun token tak ditulis rute Jupiter; tak ditutup");
        }
    }
    // 1) simulasi dgn batas CU lebar → CU nyata; 2) batas = terpakai × 1,2 + 10k
    let coba = |r: &Rakitan| {
        susun(payer, r, CU_SIMULASI, 0).map(|m| soltx::transaksi_kosong(&m)).map_err(|e| {
            warn!("susun v0: {e}");
            Galat(StatusCode::BAD_GATEWAY, "Could not build this transaction. Try again.")
        })
    };
    let terpakai = match simulasi(d, &coba(&r)?).await {
        Err(_) if menutup => {
            warn!(mint, "simulasi menolak penutupan akun token; dirakit ulang tanpa penutupan");
            r.isi.pop();
            menutup = false;
            simulasi(d, &coba(&r)?).await?
        }
        hasil => hasil?,
    };
    let cu = ((terpakai as f64 * 1.2) as u32 + 10_000).clamp(50_000, CU_SIMULASI);
    let mut mikro = (prioritas as u128 * 1_000_000 / cu as u128) as u64;
    if langsung {
        // relay mewajibkan instruksi harga CU bernilai (tip saja tak cukup)
        mikro = mikro.max(1);
    }
    let pesan = susun(payer, &r, cu, mikro).map_err(|_| Galat(StatusCode::BAD_GATEWAY, "Could not build this transaction. Try again."))?;
    let tx = soltx::transaksi_kosong(&pesan);
    let tip = if langsung { v["tipLamports"].as_u64().unwrap_or(0) } else { 0 };
    let jalur = if langsung { "langsung" } else { "jupiter" };
    Ok(Bangunan { v, pesan, tx, cu, blok_akhir: r.blok_akhir, menutup, jalur, tip })
}

// ── saldo ───────────────────────────────────────────────────────────────────

pub struct AkunToken {
    pub alamat: Kunci,
    /// program pemilik akun (Token atau Token-2022)
    pub program: Kunci,
    pub jumlah: u128,
    pub desimal: u8,
}

/// Semua akun token wallet utk satu mint (Token maupun Token-2022).
pub async fn akun_token(d: &Dagang, wallet: &str, mint: &str) -> anyhow::Result<Vec<AkunToken>> {
    let v = d
        .rpc("getTokenAccountsByOwner", json!([wallet, { "mint": mint }, { "encoding": "jsonParsed", "commitment": "confirmed" }]))
        .await?;
    let mut hasil = Vec::new();
    for a in v["value"].as_array().into_iter().flatten() {
        let info = &a["account"]["data"]["parsed"]["info"]["tokenAmount"];
        let (Some(alamat), Some(program), Some(jumlah), Some(desimal)) = (
            a["pubkey"].as_str().and_then(|x| soltx::kunci(x).ok()),
            a["account"]["owner"].as_str().and_then(|x| soltx::kunci(x).ok()),
            info["amount"].as_str().and_then(|s| s.parse::<u128>().ok()),
            info["decimals"].as_u64(),
        ) else {
            continue;
        };
        hasil.push(AkunToken { alamat, program, jumlah, desimal: desimal as u8 });
    }
    Ok(hasil)
}

/// Saldo token wallet utk satu mint (jumlah semua akun token-nya).
async fn saldo_token(d: &Dagang, wallet: &str, mint: &str) -> anyhow::Result<Option<(u128, u8)>> {
    let akun = akun_token(d, wallet, mint).await?;
    Ok(akun.first().map(|a| (akun.iter().map(|x| x.jumlah).sum(), a.desimal)))
}

/// Desimal mint (Token maupun Token-2022). Gagal = None: UI memakai cadangan 6 (pump.fun).
async fn desimal_mint(d: &Dagang, mint: &str) -> Option<u8> {
    let v = d.rpc("getAccountInfo", json!([mint, { "encoding": "jsonParsed" }])).await.ok()?;
    v["value"]["data"]["parsed"]["info"]["decimals"].as_u64().map(|x| x as u8)
}

/// Semua saldo token wallet: mint → (unit mentah, desimal). Dua panggilan (Token + Token-2022).
async fn semua_saldo(d: &Dagang, wallet: &str) -> anyhow::Result<std::collections::HashMap<String, (u128, u8)>> {
    let mut peta = std::collections::HashMap::new();
    for program in ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"] {
        let v = d
            .rpc("getTokenAccountsByOwner", json!([wallet, { "programId": program }, { "encoding": "jsonParsed", "commitment": "confirmed" }]))
            .await?;
        for a in v["value"].as_array().into_iter().flatten() {
            let info = &a["account"]["data"]["parsed"]["info"];
            let (Some(mint), Some(jml), Some(dsm)) = (
                info["mint"].as_str(),
                info["tokenAmount"]["amount"].as_str().and_then(|x| x.parse::<u128>().ok()),
                info["tokenAmount"]["decimals"].as_u64(),
            ) else {
                continue;
            };
            let e = peta.entry(mint.to_string()).or_insert((0u128, dsm as u8));
            e.0 += jml;
        }
    }
    Ok(peta)
}

async fn saldo_sol(d: &Dagang, wallet: &str) -> anyhow::Result<u64> {
    Ok(d.rpc("getBalance", json!([wallet, { "commitment": "confirmed" }])).await?["value"].as_u64().unwrap_or(0))
}

#[derive(Deserialize)]
pub struct TanyaSaldo {
    mint: Option<String>,
}

pub async fn saldo(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Query(q): Query<TanyaSaldo>,
) -> Hasil<Response> {
    let d = mesin(&s)?;
    let (b, _) = jaga_baca(&s, &h, peer).await?;
    let sol = saldo_sol(d, &b.wallet).await.map_err(|e| {
        warn!("getBalance: {e}");
        RPC_GAGAL
    })?;
    let token = match q.mint.as_deref() {
        Some(m) => {
            let k = mint_sah(m)?;
            let mint = soltx::teks(&k);
            saldo_token(d, &b.wallet, &mint).await.map_err(|e| {
                warn!("getTokenAccountsByOwner: {e}");
                RPC_GAGAL
            })?
        }
        None => None,
    };
    Ok(tanpa_cache(json!({
        "wallet": b.wallet,
        "solLamports": sol.to_string(),
        "token": token.map(|(a, dsm)| json!({ "amount": a.to_string(), "decimals": dsm })),
    })))
}

/// Info token dari Jupiter (simbol, nama, ikon, desimal, harga USD) utk ≤ 50 mint (+ SOL) dlm SATU panggilan.
/// Gagal = peta kosong: posisi tetap tampil tanpa nama & nilai.
pub(crate) async fn info_token(d: &Dagang, mints: &[String]) -> std::collections::HashMap<String, Value> {
    let mut ids: Vec<&str> = mints.iter().map(String::as_str).take(49).collect();
    ids.push(SOL);
    let r = d.http.get(JUPITER_TOKEN).query(&[("query", ids.join(","))]).send().await;
    let v: Value = match r {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(e) => {
            warn!("info token Jupiter: {e}");
            Value::Null
        }
    };
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|x| Some((x["id"].as_str()?.to_string(), x.clone())))
        .collect()
}

// ── siapkan ─────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Siapkan {
    mint: String,
    /// "buy" | "sell"
    side: String,
    /// satuan terkecil: lamport (buy) atau unit token mentah (sell)
    amount: Option<String>,
    /// sell saja: persen saldo (1–100) — dihitung di server dari saldo on-chain terbaru
    percent: Option<u8>,
    slippage_bps: u16,
    priority_lamports: u64,
}

pub async fn siapkan(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<Siapkan>,
) -> Hasil<Response> {
    let d = mesin(&s)?.clone();
    let (b, payer) = jaga(&s, &h, peer).await?;
    let mint = soltx::teks(&mint_sah(&m.mint)?);
    let beli = match m.side.as_str() {
        "buy" => true,
        "sell" => false,
        _ => return Err(Galat(StatusCode::BAD_REQUEST, "Side must be buy or sell.")),
    };
    if !(1..=5000).contains(&m.slippage_bps) {
        return Err(Galat(StatusCode::BAD_REQUEST, "Slippage must be between 0.01% and 50%."));
    }
    if m.priority_lamports > PRIORITAS_MAKS {
        return Err(Galat(StatusCode::BAD_REQUEST, "Priority fee is capped at 0.1 SOL."));
    }

    let mut tutup = None;
    let jumlah: u128 = if beli {
        let l: u64 = m.amount.as_deref().and_then(|a| a.parse().ok()).ok_or(Galat(StatusCode::BAD_REQUEST, "Enter an amount of SOL."))?;
        if !(LAMPORT_MIN..=LAMPORT_MAKS).contains(&l) {
            return Err(Galat(StatusCode::BAD_REQUEST, "Buy amount must be between 0.001 and 100 SOL."));
        }
        l as u128
    } else {
        let akun = akun_token(&d, &b.wallet, &mint).await.map_err(|e| {
            warn!("saldo jual: {e}");
            RPC_GAGAL
        })?;
        let punya: u128 = akun.iter().map(|a| a.jumlah).sum();
        if punya == 0 {
            return Err(Galat(StatusCode::BAD_REQUEST, "You do not hold this token."));
        }
        let j = match (m.percent, m.amount.as_deref()) {
            (Some(p @ 1..=100), _) => punya * p as u128 / 100,
            (None, Some(a)) => a.parse::<u128>().map_err(|_| Galat(StatusCode::BAD_REQUEST, "Enter an amount to sell."))?,
            _ => return Err(Galat(StatusCode::BAD_REQUEST, "Enter an amount or a percentage to sell.")),
        };
        if j == 0 || j > punya {
            return Err(Galat(StatusCode::BAD_REQUEST, "You cannot sell more than you hold."));
        }
        // jual habis dari SATU akun token → akun itu kosong sesudahnya, tutup sekalian
        if let [a] = akun.as_slice() {
            if j == a.jumlah {
                tutup = Some((a.alamat, a.program));
            }
        }
        j
    };

    let langsung = d.langsung_untuk(&h);
    let Bangunan { v, pesan, tx, cu, blok_akhir, menutup, jalur, tip } =
        bangun(&d, &payer, &b.wallet, &mint, beli, jumlah, m.slippage_bps, m.priority_lamports, tutup, langsung).await?;

    let rute: Vec<String> = v["routePlan"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|x| x["swapInfo"]["label"].as_str().map(String::from))
        .collect();
    let rute = rute.join(" → ");
    let dampak = v["priceImpactPct"].as_str().and_then(|x| x.parse::<f64>().ok());
    let perkiraan = v["outAmount"].as_str().unwrap_or("0").to_string();
    let minimal = v["otherAmountThreshold"].as_str().unwrap_or("0").to_string();

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO dagang (pengguna_id, wallet, mint, sisi, masuk, perkiraan_keluar, minimal_keluar, slippage_bps,
                             prioritas_lamports, dampak_harga, rute, pesan_hash, blok_akhir, jalur)
         VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id",
    )
    .bind(b.id)
    .bind(&b.wallet)
    .bind(&mint)
    .bind(if beli { "beli" } else { "jual" })
    .bind(jumlah.to_string())
    .bind(&perkiraan)
    .bind(&minimal)
    .bind(m.slippage_bps as i32)
    .bind(m.priority_lamports as i64)
    .bind(dampak)
    .bind(&rute)
    .bind(Sha256::digest(&pesan).to_vec())
    .bind(blok_akhir)
    .bind(jalur)
    .fetch_one(&s.pool)
    .await?;

    Ok(tanpa_cache(json!({
        "id": id.to_string(),
        "transaction": B64.encode(&tx),
        "side": m.side,
        "mint": mint,
        "inAmount": jumlah.to_string(),
        "outAmount": perkiraan,
        "minOut": minimal,
        "priceImpactPct": dampak,
        "route": rute,
        "computeUnits": cu,
        // biaya jaringan perkiraan: 5000 lamport/tanda tangan + priority + tip relay (sewa akun token tak termasuk)
        "networkFeeLamports": (5_000 + m.priority_lamports + tip).to_string(),
        // jalur langsung: tip ke relay pengirim di dalam transaksi (bukan biaya synt)
        "relayTipLamports": tip.to_string(),
        "lastValidBlockHeight": blok_akhir,
        // jual habis: akun token ikut ditutup, sewanya kembali ke wallet (terlihat di delta SOL)
        "closesTokenAccount": menutup,
        "decimals": desimal_mint(&d, &mint).await,
    })))
}

// ── kirim & lacak ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct Kirim {
    id: String,
    /// base64 transaksi yang sudah ditandatangani wallet
    transaction: String,
}

#[derive(sqlx::FromRow)]
struct Siap {
    id: i64,
    wallet: String,
    mint: String,
    pesan_hash: Vec<u8>,
    blok_akhir: i64,
    status: String,
    jalur: String,
}

async fn ambil_siap(s: &AppState, pengguna: i64, id: &str) -> Hasil<Siap> {
    let id: i64 = id.parse().map_err(|_| Galat(StatusCode::BAD_REQUEST, "Unknown trade."))?;
    let r = sqlx::query_as::<_, Siap>(
        "SELECT id, wallet, mint, pesan_hash, blok_akhir, status, jalur FROM dagang WHERE id = $1 AND pengguna_id = $2",
    )
    .bind(id)
    .bind(pengguna)
    .fetch_optional(&s.pool)
    .await?
    .ok_or(Galat(StatusCode::NOT_FOUND, "Unknown trade."))?;
    if r.status != "disiapkan" {
        return Err(Galat(StatusCode::CONFLICT, "This trade was already sent."));
    }
    Ok(r)
}

pub async fn kirim(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<Kirim>,
) -> Hasil<Response> {
    let d = mesin(&s)?.clone();
    let (b, wallet) = jaga(&s, &h, peer).await?;
    let siap = ambil_siap(&s, b.id, &m.id).await?;
    let tx = B64
        .decode(m.transaction.trim())
        .ok()
        .filter(|t| t.len() <= 1_232)
        .ok_or(Galat(StatusCode::BAD_REQUEST, "The signed transaction is not readable."))?;
    let (ttd, pesan) = soltx::pecah(&tx).map_err(|_| Galat(StatusCode::BAD_REQUEST, "The signed transaction is not readable."))?;
    if soltx::payer_pesan(pesan).ok() != Some(wallet) {
        return Err(Galat(StatusCode::BAD_REQUEST, "This transaction is not paid by your account's wallet."));
    }
    let kunci = ed25519_dalek::VerifyingKey::from_bytes(&wallet).map_err(|_| Galat(StatusCode::BAD_REQUEST, "Wallet key is not valid."))?;
    if kunci.verify_strict(pesan, &ed25519_dalek::Signature::from_bytes(&ttd[0])).is_err() {
        return Err(Galat(StatusCode::BAD_REQUEST, "The wallet signature does not match this transaction."));
    }
    if Sha256::digest(pesan).as_slice() != siap.pesan_hash.as_slice() {
        // milik pengguna & sudah ia tanda tangani → tetap diteruskan; hanya dicatat
        warn!(id = siap.id, "wallet mengubah pesan transaksi sebelum menandatangani");
    }
    let tanda = bs58::encode(ttd[0]).into_string();

    // tandai DULU (sekali-pakai: dua klik "kirim" tak menghasilkan dua pelacak), baru kirim
    let n = sqlx::query("UPDATE dagang SET status = 'dikirim', tanda = $1, dikirim = now() WHERE id = $2 AND status = 'disiapkan'")
        .bind(&tanda)
        .bind(siap.id)
        .execute(&s.pool)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(Galat(StatusCode::CONFLICT, "This trade was already sent."));
    }
    let terkirim = if siap.jalur == "langsung" {
        match d.kirim_langsung(&tx).await {
            Ok(()) => Ok(()),
            Err(e) => {
                warn!(id = siap.id, "kirim lewat perakit gagal, coba RPC: {e}");
                kirim_rpc(&d, &tx).await
            }
        }
    } else {
        kirim_rpc(&d, &tx).await
    };
    if let Err(e) = terkirim {
        warn!(id = siap.id, "sendTransaction ditolak: {e}");
        selesai(&s.pool, siap.id, "gagal", Some("The network rejected the transaction. Nothing was spent."), None, None).await;
        return Err(Galat(StatusCode::BAD_GATEWAY, "The network rejected the transaction. Nothing was spent."));
    }
    info!(id = siap.id, tanda = %tanda, "transaksi dikirim");
    tokio::spawn(lacak_tx(s.pool.clone(), d, siap.id, siap.wallet, siap.mint, tanda.clone(), Some(tx), siap.blok_akhir));
    Ok(tanpa_cache(json!({ "id": siap.id.to_string(), "signature": tanda, "status": "sent" })))
}

#[derive(Deserialize)]
pub struct Lacak {
    id: String,
    signature: String,
}

/// Wallet yang hanya punya `signAndSendTransaction` sudah mengirim sendiri; kita cukup melacak.
pub async fn lacak(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<Lacak>,
) -> Hasil<Response> {
    let d = mesin(&s)?.clone();
    let (b, _) = jaga(&s, &h, peer).await?;
    let siap = ambil_siap(&s, b.id, &m.id).await?;
    let tanda = m.signature.trim();
    if bs58::decode(tanda).into_vec().map(|v| v.len()).ok() != Some(64) {
        return Err(Galat(StatusCode::BAD_REQUEST, "This is not a transaction signature."));
    }
    let n = sqlx::query("UPDATE dagang SET status = 'dikirim', tanda = $1, dikirim = now() WHERE id = $2 AND status = 'disiapkan'")
        .bind(tanda)
        .bind(siap.id)
        .execute(&s.pool)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(Galat(StatusCode::CONFLICT, "This trade was already sent."));
    }
    tokio::spawn(lacak_tx(s.pool.clone(), d, siap.id, siap.wallet, siap.mint, tanda.to_string(), None, siap.blok_akhir));
    Ok(tanpa_cache(json!({ "id": siap.id.to_string(), "signature": tanda, "status": "sent" })))
}

async fn kirim_rpc(d: &Dagang, tx: &[u8]) -> anyhow::Result<()> {
    // preflight dilewati: transaksi baru saja lolos simulasi; preflight hanya menambah ±400 ms
    d.rpc("sendTransaction", json!([B64.encode(tx), { "encoding": "base64", "skipPreflight": true, "maxRetries": 0 }]))
        .await
        .map(|_| ())
}

async fn selesai(pool: &PgPool, id: i64, status: &str, galat: Option<&str>, sol: Option<i64>, token: Option<String>) {
    let r = sqlx::query(
        "UPDATE dagang SET status = $1, galat = $2, sol_delta = $3, token_delta = $4::numeric, selesai = now()
          WHERE id = $5 AND status = 'dikirim'",
    )
    .bind(status)
    .bind(galat)
    .bind(sol)
    .bind(token)
    .bind(id)
    .execute(pool)
    .await;
    if let Err(e) = r {
        warn!(id, "gagal menulis hasil transaksi: {e}");
    }
}

/// Lacak sampai terkonfirmasi / gagal / blockhash kedaluwarsa. Bila `tx` ada, kirim ulang tiap
/// 2 dtk (RPC menjatuhkan transaksi diam-diam saat padat; kirim ulang tanda tangan sama aman).
pub async fn lacak_tx(pool: PgPool, d: Arc<Dagang>, id: i64, wallet: String, mint: String, tanda: String, tx: Option<Vec<u8>>, blok_akhir: i64) {
    let mulai = Instant::now();
    loop {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let st = d.rpc("getSignatureStatuses", json!([[tanda], { "searchTransactionHistory": false }])).await;
        if let Ok(v) = &st {
            let x = &v["value"][0];
            let tahap = x["confirmationStatus"].as_str().unwrap_or("");
            if tahap == "confirmed" || tahap == "finalized" {
                if x["err"].is_null() {
                    let (sol, tok) = delta(&d, &tanda, &wallet, &mint).await;
                    info!(id, tanda = %tanda, "transaksi berhasil");
                    selesai(&pool, id, "berhasil", None, sol, tok).await;
                } else {
                    let (sol, _) = delta(&d, &tanda, &wallet, &mint).await;
                    let log = log_tx(&d, &tanda).await;
                    warn!(id, err = %x["err"], "transaksi gagal on-chain");
                    selesai(&pool, id, "gagal", Some(arti_galat(&x["err"], &log)), sol, None).await;
                }
                return;
            }
        }
        let tinggi = d.rpc("getBlockHeight", json!([{ "commitment": "confirmed" }])).await.ok().and_then(|v| v.as_i64());
        let lewat = tinggi.is_some_and(|t| t > blok_akhir) || mulai.elapsed() > Duration::from_secs(150);
        if lewat {
            // satu cek terakhir dgn riwayat: konfirmasi bisa mendarat tepat di batas
            let v = d.rpc("getSignatureStatuses", json!([[tanda], { "searchTransactionHistory": true }])).await;
            if v.as_ref().is_ok_and(|v| !v["value"][0].is_null()) && mulai.elapsed() < Duration::from_secs(300) {
                continue;
            }
            warn!(id, "transaksi kedaluwarsa tanpa konfirmasi");
            selesai(&pool, id, "kedaluwarsa", Some("The transaction expired before it landed. Nothing was spent."), None, None).await;
            return;
        }
        if let Some(t) = &tx {
            let _ = kirim_rpc(&d, t).await;
        }
    }
}

async fn tx_json(d: &Dagang, tanda: &str) -> Option<Value> {
    for _ in 0..5 {
        if let Ok(v) = d
            .rpc("getTransaction", json!([tanda, { "encoding": "jsonParsed", "maxSupportedTransactionVersion": 1, "commitment": "confirmed" }]))
            .await
        {
            if !v.is_null() {
                return Some(v);
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    None
}

async fn log_tx(d: &Dagang, tanda: &str) -> Vec<String> {
    tx_json(d, tanda)
        .await
        .map(|v| v["meta"]["logMessages"].as_array().into_iter().flatten().filter_map(|l| l.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Perubahan saldo NYATA wallet: SOL (lamport, termasuk biaya & sewa) dan token (unit mentah).
async fn delta(d: &Dagang, tanda: &str, wallet: &str, mint: &str) -> (Option<i64>, Option<String>) {
    let Some(v) = tx_json(d, tanda).await else { return (None, None) };
    let meta = &v["meta"];
    let kunci = v["transaction"]["message"]["accountKeys"].as_array().cloned().unwrap_or_default();
    let posisi = kunci.iter().position(|k| k["pubkey"].as_str() == Some(wallet) || k.as_str() == Some(wallet));
    let sol = posisi.and_then(|i| Some(meta["postBalances"][i].as_i64()? - meta["preBalances"][i].as_i64()?));
    let jumlah = |daftar: &Value| -> i128 {
        daftar
            .as_array()
            .into_iter()
            .flatten()
            .filter(|b| b["owner"].as_str() == Some(wallet) && b["mint"].as_str() == Some(mint))
            .filter_map(|b| b["uiTokenAmount"]["amount"].as_str()?.parse::<i128>().ok())
            .sum()
    };
    let tok = jumlah(&meta["postTokenBalances"]) - jumlah(&meta["preTokenBalances"]);
    (sol, Some(tok.to_string()))
}

/// Saat boot: lanjutkan pelacakan transaksi yang terkirim sebelum restart (tanpa kirim ulang).
pub async fn lanjutkan(pool: PgPool, d: Arc<Dagang>) {
    let r = sqlx::query_as::<_, (i64, String, String, String, i64)>(
        "SELECT id, wallet, mint, tanda, blok_akhir FROM dagang WHERE chain = 'sol' AND status = 'dikirim' AND tanda IS NOT NULL LIMIT 100",
    )
    .fetch_all(&pool)
    .await;
    match r {
        Ok(baris) => {
            for (id, wallet, mint, tanda, blok) in baris {
                tokio::spawn(lacak_tx(pool.clone(), d.clone(), id, wallet, mint, tanda, None, blok));
            }
        }
        Err(e) => warn!("lanjutkan pelacakan: {e}"),
    }
}

// ── baca ────────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct BarisDagang {
    id: i64,
    mint: String,
    sisi: String,
    masuk: String,
    perkiraan_keluar: String,
    minimal_keluar: String,
    status: String,
    tanda: Option<String>,
    galat: Option<String>,
    sol_delta: Option<i64>,
    native_delta: Option<String>,
    token_delta: Option<String>,
    chain: String,
    dibuat: chrono::DateTime<chrono::Utc>,
    selesai: Option<chrono::DateTime<chrono::Utc>>,
}

const KOLOM: &str = "id, mint, sisi, masuk::text AS masuk, perkiraan_keluar::text AS perkiraan_keluar,
                     minimal_keluar::text AS minimal_keluar, status, tanda, galat, sol_delta,
                     native_delta::text AS native_delta, token_delta::text AS token_delta, chain, dibuat, selesai";

fn ke_json(r: BarisDagang) -> Value {
    let status = match r.status.as_str() {
        "disiapkan" => "prepared",
        "dikirim" => "sent",
        "berhasil" => "confirmed",
        "gagal" => "failed",
        _ => "expired",
    };
    json!({
        "id": r.id.to_string(),
        "mint": r.mint,
        "side": if r.sisi == "beli" { "buy" } else { "sell" },
        "inAmount": r.masuk,
        "outAmount": r.perkiraan_keluar,
        "minOut": r.minimal_keluar,
        "status": status,
        "signature": r.tanda,
        "error": r.galat,
        "chain": r.chain,
        // lamport (Solana) / wei (BNB); `solDelta` dipertahankan utk klien lama
        "nativeDelta": if r.chain == "bnb" { r.native_delta.clone() } else { r.sol_delta.map(|x| x.to_string()) },
        "solDelta": r.sol_delta.map(|x| x.to_string()),
        "tokenDelta": r.token_delta,
        "createdAt": r.dibuat,
        "settledAt": r.selesai,
    })
}

pub async fn status(State(s): State<AppState>, h: HeaderMap, Path(id): Path<String>) -> Hasil<Response> {
    let b = pengguna_sesi(&s, &h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Sign in with your wallet to trade."))?;
    let id: i64 = id.parse().map_err(|_| Galat(StatusCode::NOT_FOUND, "Unknown trade."))?;
    let r = sqlx::query_as::<_, BarisDagang>(&format!("SELECT {KOLOM} FROM dagang WHERE id = $1 AND pengguna_id = $2"))
        .bind(id)
        .bind(b.id)
        .fetch_optional(&s.pool)
        .await?
        .ok_or(Galat(StatusCode::NOT_FOUND, "Unknown trade."))?;
    Ok(tanpa_cache(ke_json(r)))
}

#[derive(Deserialize)]
pub struct TanyaRiwayat {
    mint: Option<String>,
    limit: Option<i64>,
}

pub async fn riwayat(State(s): State<AppState>, h: HeaderMap, Query(q): Query<TanyaRiwayat>) -> Hasil<Response> {
    let b = pengguna_sesi(&s, &h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Sign in with your wallet to trade."))?;
    // akun EVM: token 0x huruf kecil (bentuk yang disimpan bnb.rs); akun Solana: mint base58
    let mint = match q.mint.as_deref() {
        Some(m) if b.wallet.starts_with("0x") => Some(
            crate::bnb::alamat(&m.to_ascii_lowercase())
                .map(|_| m.to_ascii_lowercase())
                .ok_or(Galat(StatusCode::BAD_REQUEST, "This is not a valid token address."))?,
        ),
        Some(m) => Some(soltx::teks(&mint_sah(m)?)),
        None => None,
    };
    let rows = sqlx::query_as::<_, BarisDagang>(&format!(
        "SELECT {KOLOM} FROM dagang
          WHERE pengguna_id = $1 AND status <> 'disiapkan' AND ($2::text IS NULL OR mint = $2)
          ORDER BY dibuat DESC LIMIT $3"
    ))
    .bind(b.id)
    .bind(mint)
    .bind(q.limit.unwrap_or(50).clamp(1, 200))
    .fetch_all(&s.pool)
    .await?;
    Ok(tanpa_cache(json!({ "trades": rows.into_iter().map(ke_json).collect::<Vec<_>>() })))
}

/// Posisi per token dari transaksi BERHASIL milik akun + saldo on-chain saat ini.
/// Modal = SOL yang benar-benar keluar saat beli (termasuk biaya); hasil = SOL yang masuk saat jual.
pub async fn posisi(State(s): State<AppState>, ConnectInfo(peer): ConnectInfo<SocketAddr>, h: HeaderMap) -> Hasil<Response> {
    let d = mesin(&s)?;
    let (b, _) = jaga_baca(&s, &h, peer).await?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, i64, chrono::DateTime<chrono::Utc>)>(
        "SELECT mint,
                COALESCE(sum(-sol_delta) FILTER (WHERE sisi = 'beli'), 0)::text,
                COALESCE(sum(sol_delta) FILTER (WHERE sisi = 'jual'), 0)::text,
                COALESCE(sum(token_delta) FILTER (WHERE sisi = 'beli'), 0)::text,
                COALESCE(sum(-token_delta) FILTER (WHERE sisi = 'jual'), 0)::text,
                count(*),
                max(selesai)
           FROM dagang
          WHERE pengguna_id = $1 AND chain = 'sol' AND status = 'berhasil' AND sol_delta IS NOT NULL
          GROUP BY mint
          ORDER BY max(selesai) DESC
          LIMIT 100",
    )
    .bind(b.id)
    .fetch_all(&s.pool)
    .await?;
    let mints: Vec<String> = rows.iter().map(|r| r.0.clone()).collect();
    let info = info_token(d, &mints).await;
    let harga = |m: &str| info.get(m).and_then(|x| x["usdPrice"].as_f64()).filter(|p| p.is_finite() && *p > 0.0);
    // ikon hanya https (tampil di <img>; skema lain dibuang)
    let teks = |m: &str, k: &str, maks: usize| {
        info.get(m).and_then(|x| x[k].as_str()).filter(|t| t.chars().count() <= maks).map(String::from)
    };
    let saldo_semua = semua_saldo(d, &b.wallet).await.map_err(|e| {
        warn!("saldo posisi: {e}");
        RPC_GAGAL
    })?;
    let mut out = Vec::with_capacity(rows.len());
    for (mint, modal, hasil, dibeli, dijual, n, terakhir) in rows {
        // tak ada akun token = saldo 0 (sudah dijual habis / akun ditutup)
        let saldo = Some(saldo_semua.get(&mint).copied().unwrap_or((0, 0)));
        out.push(json!({
            "mint": mint,
            "solSpent": modal,
            "solReceived": hasil,
            "tokensBought": dibeli,
            "tokensSold": dijual,
            "trades": n,
            "lastTradeAt": terakhir,
            "balance": saldo.map(|(a, _)| a.to_string()),
            "decimals": saldo.map(|(_, dsm)| dsm).filter(|x| *x > 0).or_else(|| info.get(&mint).and_then(|x| x["decimals"].as_u64()).map(|x| x as u8)),
            "priceUsd": harga(&mint),
            "symbol": teks(&mint, "symbol", 20),
            "name": teks(&mint, "name", 60),
            "icon": teks(&mint, "icon", 300).filter(|u| u.starts_with("https://")),
        }));
    }
    Ok(tanpa_cache(json!({ "positions": out, "solUsd": harga(SOL) })))
}

/// Bersihkan transaksi yang disiapkan tapi tak pernah ditandatangani (dipanggil penjaga harian).
pub async fn bersihkan(pool: &PgPool) -> Result<u64, sqlx::Error> {
    Ok(sqlx::query("DELETE FROM dagang WHERE status = 'disiapkan' AND dibuat < now() - interval '1 day'")
        .execute(pool)
        .await?
        .rows_affected())
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn arti_galat_dikenali() {
        let slip = json!({ "InstructionError": [3, { "Custom": 6001 }] });
        assert!(arti_galat(&slip, &[]).contains("slippage"));
        assert!(arti_galat(&json!("InsufficientFundsForFee"), &[]).contains("Not enough SOL"));
        assert!(arti_galat(&json!("InvalidAccountForFee"), &[]).contains("Not enough SOL"));
        let log = vec!["Transfer: insufficient lamports 10, need 20".to_string()];
        assert!(arti_galat(&json!({ "InstructionError": [2, { "Custom": 1 }] }), &log).contains("Not enough SOL"));
        assert!(arti_galat(&json!({ "InstructionError": [2, { "Custom": 6005 }] }), &[]).contains("bonding curve"));
        assert!(arti_galat(&json!({ "InstructionError": [2, "Foo"] }), &[]).contains("nothing was sent"));
    }
}
