//! Pemantau watchlist: skor & harga token yang dipantau pengguna → notifikasi (tahap C, 1 Nov).
//!
//! ⚠️ Membaca API PUBLIK synt-dash (`X-Synt-Publik: 1`, field internal dibuang), BUKAN DB engine:
//! role `akun_rw` hanya punya `synt_akun`. Engine Solana dibekukan s/d Colosseum — ini hanya membaca.
//!
//! | jenis | kapan | siapa yang menerima |
//! |---|---|---|
//! | `audit` | skor berubah, atau token BNB yang menunggu akhirnya diberi skor | pemantau dgn `synt.notif.audit` (bawaan: nyala) |
//! | `harga` | harga bergerak ≥50% dari patokan, paling sering sejam sekali per token | pemantau dgn `synt.notif.price` (bawaan: nyala) |
//!
//! Pengamatan PERTAMA sebuah token hanya dicatat, tak dikabarkan: "berubah" butuh nilai sebelumnya.
//! Bawaan preferensi di sini WAJIB sama dgn nilai awal toggle di Settings terminal.

use serde::Deserialize;
use sqlx::PgPool;
use std::time::Duration;
use tracing::{info, warn};

const SELANG: Duration = Duration::from_secs(60);
/// beban ke synt-dash: satu permintaan per token per siklus; plafon menjaga siklus < SELANG
const MAKS_TOKEN: i64 = 400;
const AMBANG_HARGA: f64 = 0.5;

#[derive(Deserialize)]
struct Token {
    symbol: Option<String>,
    score: Option<i32>,
    price_usd: Option<f64>,
}

struct Jejak {
    skor: Option<i16>,
    harga_dasar: Option<f64>,
    kabar_baru: bool,
}

pub async fn jalan(pool: PgPool, dash: String) {
    let klien = match reqwest::Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(k) => k,
        Err(e) => return warn!("pemantau tak jalan, klien HTTP gagal: {e}"),
    };
    info!(dash, "pemantau watchlist jalan (tiap {}s)", SELANG.as_secs());
    let mut tik = tokio::time::interval(SELANG);
    tik.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tik.tick().await;
        if let Err(e) = siklus(&pool, &klien, &dash).await {
            warn!("siklus pemantau gagal: {e}");
        }
    }
}

async fn siklus(pool: &PgPool, klien: &reqwest::Client, dash: &str) -> anyhow::Result<()> {
    // hanya token yang setidaknya satu pemantaunya masih menyalakan audit ATAU harga
    let tokens: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT pa.token FROM pantauan pa
           LEFT JOIN preferensi pr ON pr.pengguna_id = pa.pengguna_id
          WHERE (pr.data->'synt.notif.audit') IS DISTINCT FROM 'false'::jsonb
             OR (pr.data->'synt.notif.price') IS DISTINCT FROM 'false'::jsonb
          LIMIT $1",
    )
    .bind(MAKS_TOKEN)
    .fetch_all(pool)
    .await?;

    let (mut dicek, mut kabar) = (0, 0);
    for t in &tokens {
        let url = if t.starts_with("0x") { format!("{dash}/api/bnb/token/{t}") } else { format!("{dash}/api/token?mint={t}") };
        let Ok(r) = klien.get(&url).header("X-Synt-Publik", "1").send().await else { continue };
        if !r.status().is_success() {
            continue; // token tak dikenal synt-dash (mis. sudah keluar retensi) → diam
        }
        let Ok(d) = r.json::<Token>().await else { continue };
        dicek += 1;
        kabar += periksa(pool, t, &d).await?;
    }
    // jejak token yang tak lagi dipantau siapa pun
    sqlx::query("DELETE FROM jejak_token j WHERE NOT EXISTS (SELECT 1 FROM pantauan p WHERE p.token = j.token)")
        .execute(pool)
        .await?;
    if kabar > 0 {
        info!(token = tokens.len(), dicek, kabar, "pemantau");
    }
    Ok(())
}

/// Bandingkan dgn jejak lalu kirim notifikasi. Mengembalikan jumlah notifikasi yang ditulis.
async fn periksa(pool: &PgPool, token: &str, d: &Token) -> anyhow::Result<u64> {
    let lama = sqlx::query_as::<_, (Option<i16>, Option<f64>, bool)>(
        "SELECT skor, harga_dasar, harga_kabar IS NULL OR harga_kabar < now() - interval '1 hour' FROM jejak_token WHERE token = $1",
    )
    .bind(token)
    .fetch_optional(pool)
    .await?
    .map(|(skor, harga_dasar, kabar_baru)| Jejak { skor, harga_dasar, kabar_baru });

    let simbol = d.symbol.as_deref().map(|s| s.chars().take(16).collect::<String>()).unwrap_or_else(|| "A token".into());
    let tautan = if token.starts_with("0x") { format!("/bnb/{token}") } else { format!("/coin/{token}") };
    let skor = d.score.and_then(|s| i16::try_from(s).ok());
    let mut ditulis = 0;
    let mut harga_dasar = lama.as_ref().and_then(|j| j.harga_dasar).or(d.price_usd);
    let mut harga_dikabarkan = false;

    if let Some(j) = &lama {
        let pesan = match (j.skor, skor) {
            (Some(a), Some(b)) if a != b => Some(format!("{simbol} score moved from {a} to {b}.")),
            (None, Some(b)) => Some(format!("{simbol} now has a score: {b}.")),
            _ => None,
        };
        if let Some(isi) = pesan {
            ditulis += kirim(pool, token, "audit", "synt.notif.audit", &format!("Audit updated: {simbol}"), &isi, &tautan).await?;
        }

        if let (Some(dasar), Some(kini)) = (j.harga_dasar, d.price_usd) {
            let ubah = kini / dasar - 1.0;
            if dasar > 0.0 && ubah.is_finite() && ubah.abs() >= AMBANG_HARGA && j.kabar_baru {
                let pct = (ubah * 100.0).round();
                let judul = format!("{simbol} {}{pct}%", if pct > 0.0 { "+" } else { "" });
                let isi = format!(
                    "Price is {} {}% since the last price alert for this token, or since it joined a watchlist.",
                    if pct > 0.0 { "up" } else { "down" },
                    pct.abs()
                );
                ditulis += kirim(pool, token, "harga", "synt.notif.price", &judul, &isi, &tautan).await?;
                harga_dasar = Some(kini);
                harga_dikabarkan = true;
            }
        }
    }

    sqlx::query(
        "INSERT INTO jejak_token (token, simbol, skor, harga_dasar, harga_kabar, diperiksa)
         VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN now() END, now())
         ON CONFLICT (token) DO UPDATE SET simbol = EXCLUDED.simbol, skor = EXCLUDED.skor,
             harga_dasar = EXCLUDED.harga_dasar,
             harga_kabar = CASE WHEN $5 THEN now() ELSE jejak_token.harga_kabar END,
             diperiksa = now()",
    )
    .bind(token)
    .bind(d.symbol.as_deref())
    .bind(skor)
    .bind(harga_dasar)
    .bind(harga_dikabarkan)
    .execute(pool)
    .await?;
    Ok(ditulis)
}

/// Satu notifikasi untuk tiap pemantau token ini yang menyalakan `kunci` (bawaan: nyala).
/// "Mati" = tepat JSON `false`; dibandingkan sebagai jsonb, bukan `::boolean` — satu nilai aneh
/// di preferensi seseorang tak boleh membuat cast gagal dan mematikan pemantau untuk semua orang.
async fn kirim(pool: &PgPool, token: &str, jenis: &str, kunci: &str, judul: &str, isi: &str, tautan: &str) -> anyhow::Result<u64> {
    Ok(sqlx::query(
        "INSERT INTO notifikasi (pengguna_id, jenis, judul, isi, tautan)
         SELECT pa.pengguna_id, $2, $3, $4, $5 FROM pantauan pa
           LEFT JOIN preferensi pr ON pr.pengguna_id = pa.pengguna_id
          WHERE pa.token = $1 AND (pr.data->$6) IS DISTINCT FROM 'false'::jsonb",
    )
    .bind(token)
    .bind(jenis)
    .bind(judul.chars().take(80).collect::<String>())
    .bind(isi)
    .bind(tautan)
    .bind(kunci)
    .execute(pool)
    .await?
    .rows_affected())
}
