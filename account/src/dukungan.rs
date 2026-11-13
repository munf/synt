//! Tiket support dari terminal (2026-11-04, keputusan pemilik: form tiket, bukan sekadar kontak).
//!
//! Alur: tombol "?" di header → `POST /dukungan` → baris `tiket` → diteruskan ke Telegram tim
//! (bot alert yang sudah ada, `AKUN_SUPPORT_TG_*`). Pengguna yang masuk dibalas lewat pesan sistem
//! (`synt-akun balas <id> "<isi>"`); tamu wajib menulis kontak karena tak punya kotak pesan.
//!
//! | yang disimpan | asal |
//! |---|---|
//! | kategori, pesan, kontak | ditulis pengguna |
//! | konteks (halaman, token, tx, id trade, build, layar) | dilampirkan terminal, DAFTAR PUTIH di sini |
//! | akun | dari sesi — bukan dari isi permintaan |
//!
//! ⛔ IP tak disimpan (hanya rem laju). Detail trade di pesan Telegram dibaca dari tabel `dagang` milik akun itu
//! sendiri, bukan dipercaya dari browser: id trade orang lain tak bisa membuka transaksinya.

use crate::api::{asal_sah, ip_klien, pengguna_sesi, AppState, Galat, Hasil};
use crate::profil;
use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sqlx::PgPool;
use std::{net::SocketAddr, sync::Arc, time::Duration};
use tracing::{info, warn};

const PESAN_MIN: usize = 10;
const PESAN_MAKS: usize = 2000;
/// batas pesan Telegram 4.096 karakter; sisanya untuk kepala tiket
const PESAN_TG_MAKS: usize = 3000;

// ── Telegram ────────────────────────────────────────────────────────────────

pub struct Telegram {
    http: reqwest::Client,
    token: String,
    chat: String,
}

impl Telegram {
    /// None = `AKUN_SUPPORT_TG_TOKEN`/`_CHAT` kosong: tiket tetap tersimpan, hanya tak diteruskan.
    pub fn dari_env() -> anyhow::Result<Option<Arc<Self>>> {
        let ambil = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        let (Some(token), Some(chat)) = (ambil("AKUN_SUPPORT_TG_TOKEN"), ambil("AKUN_SUPPORT_TG_CHAT")) else {
            return Ok(None);
        };
        let http = reqwest::Client::builder().timeout(Duration::from_secs(10)).build()?;
        Ok(Some(Arc::new(Self { http, token: token.trim().into(), chat: chat.trim().into() })))
    }

    async fn kirim(&self, teks: &str) -> anyhow::Result<()> {
        // Teks POLOS (tanpa parse_mode): isi tiket ditulis orang asing, Markdown/HTML-nya tak boleh ditafsirkan.
        let r = self
            .http
            .post(format!("https://api.telegram.org/bot{}/sendMessage", self.token))
            .json(&json!({ "chat_id": self.chat, "text": teks, "disable_web_page_preview": true }))
            .send()
            .await
            // ⛔ URL memuat token bot — galat reqwest menuliskan URL-nya ke log kalau tak dibuang
            .map_err(|e| anyhow::anyhow!("Telegram: {}", e.without_url()))?;
        let status = r.status();
        if !status.is_success() {
            let isi: Value = r.json().await.unwrap_or(Value::Null);
            anyhow::bail!("Telegram {status}: {}", isi["description"].as_str().unwrap_or("?"));
        }
        Ok(())
    }
}

// ── validasi ────────────────────────────────────────────────────────────────

/// Kode kategori dari terminal (Inggris) → nilai kolom.
fn kategori(k: &str) -> Option<&'static str> {
    Some(match k {
        "trading" => "trading",
        "account" => "akun",
        "scores" => "skor",
        "bug" => "bug",
        "other" => "lain",
        _ => return None,
    })
}

fn label_kategori(k: &str) -> &'static str {
    match k {
        "trading" => "Trading",
        "akun" => "Account & sign-in",
        "skor" => "Scores & data",
        "bug" => "Bug",
        _ => "Other",
    }
}

/// Buang karakter kendali (kecuali baris baru bila `baris`), rapikan tepi.
fn bersih(s: &str, baris: bool) -> String {
    s.chars()
        .filter(|c| !c.is_control() || (baris && *c == '\n'))
        .collect::<String>()
        .trim()
        .to_string()
}

fn base58(s: &str, rentang: std::ops::RangeInclusive<usize>) -> bool {
    rentang.contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() && !matches!(b, b'0' | b'O' | b'I' | b'l'))
}

fn hex0x(s: &str, n: usize) -> bool {
    s.strip_prefix("0x").is_some_and(|h| h.len() == n && h.bytes().all(|b| b.is_ascii_hexdigit()))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct KonteksMasuk {
    page: Option<String>,
    chain: Option<String>,
    token: Option<String>,
    tx: Option<String>,
    trade_id: Option<String>,
    trade_status: Option<String>,
    trade_error: Option<String>,
    build: Option<String>,
    screen: Option<String>,
    wallet_app: Option<String>,
}

/// Hanya field yang lolos bentuknya yang disimpan; yang aneh DIBUANG diam-diam, bukan menolak tiket —
/// orang yang sedang kesulitan tak boleh gagal melapor karena lampiran otomatis.
fn saring_konteks(k: KonteksMasuk) -> Map<String, Value> {
    let mut m = Map::new();
    let mut taruh = |kunci: &str, v: Option<String>| {
        if let Some(v) = v {
            m.insert(kunci.into(), Value::String(v));
        }
    };
    taruh("page", k.page.filter(|p| p.starts_with('/') && p.len() <= 200 && p.bytes().all(|b| b.is_ascii_graphic())));
    taruh("chain", k.chain.filter(|c| c == "sol" || c == "bnb"));
    taruh(
        "token",
        k.token.map(|t| t.trim().to_string()).filter(|t| base58(t, 32..=44) || hex0x(&t.to_ascii_lowercase(), 40)),
    );
    taruh("tx", k.tx.map(|t| t.trim().to_string()).filter(|t| base58(t, 64..=88) || hex0x(&t.to_ascii_lowercase(), 64)));
    taruh("tradeId", k.trade_id.filter(|t| (1..=18).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_digit())));
    taruh(
        "tradeStatus",
        k.trade_status.filter(|t| (1..=20).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')),
    );
    taruh("tradeError", k.trade_error.map(|e| bersih(&e, false).chars().take(200).collect()).filter(|e: &String| !e.is_empty()));
    taruh(
        "build",
        k.build.filter(|b| (1..=40).contains(&b.len()) && b.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))),
    );
    taruh("screen", k.screen.filter(|s| s.len() <= 11 && s.split_once('x').is_some_and(|(a, b)| angka(a) && angka(b))));
    taruh(
        "walletApp",
        k.wallet_app
            .map(|w| bersih(&w, false))
            .filter(|w| (1..=30).contains(&w.len()) && w.chars().all(|c| c.is_alphanumeric() || " .-".contains(c))),
    );
    m
}

fn angka(s: &str) -> bool {
    (1..=5).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_digit())
}

// ── rute ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Kirim {
    category: String,
    message: String,
    contact: Option<String>,
    #[serde(default)]
    context: KonteksMasuk,
    include_wallet: Option<bool>,
    /// jebakan bot: field tersembunyi di form; manusia tak pernah mengisinya
    website: Option<String>,
}

pub async fn kirim(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(k): Json<Kirim>,
) -> Hasil<Json<Value>> {
    asal_sah(&h, &s)?;
    if !s.rem_tiket.izinkan(ip_klien(&h, peer, s.cloudflare)) || !s.rem_tiket_global.izinkan_global() {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many requests. Wait a few minutes, or email support@synt.fun."));
    }
    let kat = kategori(&k.category).ok_or(Galat(StatusCode::BAD_REQUEST, "Pick a topic."))?;
    let pesan = bersih(&k.message, true);
    let n = pesan.chars().count();
    if n < PESAN_MIN {
        return Err(Galat(StatusCode::BAD_REQUEST, "Tell us a little more: at least 10 characters."));
    }
    if n > PESAN_MAKS {
        return Err(Galat(StatusCode::BAD_REQUEST, "Keep it under 2,000 characters."));
    }
    let kontak = k.contact.map(|c| bersih(&c, false)).filter(|c| !c.is_empty());
    if kontak.as_ref().is_some_and(|c| !(3..=120).contains(&c.chars().count())) {
        return Err(Galat(StatusCode::BAD_REQUEST, "That contact looks too short or too long."));
    }
    let saya = pengguna_sesi(&s, &h).await?;
    if saya.is_none() && kontak.is_none() {
        return Err(Galat(StatusCode::BAD_REQUEST, "Add an email or Telegram handle so we can reply."));
    }
    // Bot mengisi semua field. Jawab seolah berhasil agar ia tak belajar mengubah taktik.
    if k.website.is_some_and(|w| !w.trim().is_empty()) {
        info!("tiket dari jebakan bot dibuang");
        return Ok(Json(json!({ "id": 0, "replyIn": if saya.is_some() { "messages" } else { "contact" } })));
    }

    let konteks = Value::Object(saring_konteks(k.context));
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO tiket (pengguna_id, kategori, pesan, kontak, konteks, sertakan_wallet)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    )
    .bind(saya.as_ref().map(|b| b.id))
    .bind(kat)
    .bind(&pesan)
    .bind(&kontak)
    .bind(&konteks)
    .bind(k.include_wallet.unwrap_or(true))
    .fetch_one(&s.pool)
    .await?;
    info!(tiket = id, kategori = kat, masuk = saya.is_some(), "tiket support baru");

    if let Some(b) = &saya {
        // tanda terima di Messages: balasan nanti muncul di tempat yang sama
        sqlx::query("INSERT INTO notifikasi (pengguna_id, jenis, judul, isi) VALUES ($1, 'sistem', $2, $3)")
            .bind(b.id)
            .bind(format!("Support request #{id} received"))
            .bind("Thanks for writing in. We read every request and will reply here in Messages.")
            .execute(&s.pool)
            .await?;
    }
    if let Some(tg) = s.tg_dukungan.clone() {
        let pool = s.pool.clone();
        tokio::spawn(async move {
            if let Err(e) = teruskan(&pool, &tg, id).await {
                warn!(tiket = id, "tiket belum terteruskan, dicoba ulang nanti: {e}");
            }
        });
    }
    Ok(Json(json!({ "id": id, "replyIn": if saya.is_some() { "messages" } else { "contact" } })))
}

// ── penerusan ───────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct BarisTiket {
    id: i64,
    pengguna_id: Option<i64>,
    kategori: String,
    pesan: String,
    kontak: Option<String>,
    konteks: Value,
    sertakan_wallet: bool,
    wallet: Option<String>,
    handle: Option<String>,
}

#[derive(sqlx::FromRow)]
struct BarisTrade {
    chain: String,
    sisi: String,
    status: String,
    tanda: Option<String>,
    galat: Option<String>,
    mint: String,
}

async fn teruskan(pool: &PgPool, tg: &Telegram, id: i64) -> anyhow::Result<()> {
    let t = sqlx::query_as::<_, BarisTiket>(
        "SELECT t.id, t.pengguna_id, t.kategori, t.pesan, t.kontak, t.konteks, t.sertakan_wallet, p.wallet, p.handle
           FROM tiket t LEFT JOIN pengguna p ON p.id = t.pengguna_id WHERE t.id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| anyhow::anyhow!("tiket {id} tak ada (akun dihapus?)"))?;
    let k = |n: &str| t.konteks.get(n).and_then(Value::as_str);
    let trade = match (t.pengguna_id, k("tradeId").and_then(|x| x.parse::<i64>().ok())) {
        (Some(p), Some(tid)) => sqlx::query_as::<_, BarisTrade>(
            "SELECT chain, sisi, status, tanda, galat, mint FROM dagang WHERE id = $1 AND pengguna_id = $2",
        )
        .bind(tid)
        .bind(p)
        .fetch_optional(pool)
        .await?
        .map(|d| (tid, d)),
        _ => None,
    };

    let mut b = vec![format!("🎫 Support #{} · {}", t.id, label_kategori(&t.kategori))];
    b.push(match (&t.wallet, t.sertakan_wallet) {
        (Some(w), true) => format!("From: {}{} (signed in)\nWallet: {w}", t.handle.as_deref().map(|h| format!("@{h} · ")).unwrap_or_default(), profil::pendekkan(w)),
        (Some(_), false) => format!("From: {}account #{} (signed in, wallet withheld)", t.handle.as_deref().map(|h| format!("@{h} · ")).unwrap_or_default(), t.pengguna_id.unwrap_or(0)),
        (None, _) => "From: guest".into(),
    });
    if let Some(c) = &t.kontak {
        b.push(format!("Contact: {c}"));
    }
    if let Some(p) = k("page") {
        b.push(format!("Page: {p}"));
    }
    if let Some(tok) = k("token") {
        b.push(format!("Token: {tok}{}", k("chain").map(|c| format!(" ({c})")).unwrap_or_default()));
    }
    match &trade {
        // dari DB akun itu sendiri — lebih bisa dipercaya daripada yang dikirim browser
        Some((tid, d)) => {
            b.push(format!(
                "Trade #{tid}: {} {} · {} · {}{}",
                d.chain,
                if d.sisi == "beli" { "buy" } else { "sell" },
                d.status,
                profil::pendekkan(&d.mint),
                d.galat.as_deref().map(|g| format!(" · {g}")).unwrap_or_default()
            ));
            if let Some(sig) = &d.tanda {
                b.push(format!("Tx: {}", penjelajah(&d.chain, sig)));
            }
        }
        None => {
            if let Some(sig) = k("tx") {
                b.push(format!("Tx (from browser): {}", penjelajah(k("chain").unwrap_or("sol"), sig)));
            }
            if k("tradeStatus").is_some() || k("tradeError").is_some() {
                b.push(format!(
                    "Trade (from browser): {}{}",
                    k("tradeStatus").unwrap_or("?"),
                    k("tradeError").map(|e| format!(" · {e}")).unwrap_or_default()
                ));
            }
        }
    }
    let lain: Vec<String> = [("build", "build"), ("screen", "screen"), ("walletApp", "wallet app")]
        .iter()
        .filter_map(|(n, label)| k(n).map(|v| format!("{label} {v}")))
        .collect();
    if !lain.is_empty() {
        b.push(lain.join(" · "));
    }
    let isi: String = t.pesan.chars().take(PESAN_TG_MAKS).collect();
    b.push(format!("\n{isi}{}", if t.pesan.chars().count() > PESAN_TG_MAKS { "…" } else { "" }));
    b.push(if t.pengguna_id.is_some() {
        format!("\nReply: ops/balas.sh {} \"<text>\"", t.id)
    } else {
        "\nGuest: reply via the contact above.".into()
    });

    tg.kirim(&b.join("\n")).await?;
    sqlx::query("UPDATE tiket SET diteruskan = true WHERE id = $1").bind(id).execute(pool).await?;
    Ok(())
}

fn penjelajah(chain: &str, sig: &str) -> String {
    if chain == "bnb" {
        format!("https://bscscan.com/tx/{sig}")
    } else {
        format!("https://solscan.io/tx/{sig}")
    }
}

/// Coba ulang tiket yang gagal diteruskan (Telegram sedang galat, proses restart di tengah jalan) — maks 1 hari,
/// lebih tua dari itu tetap terbaca lewat `synt-akun tiket`. Juga retensi 90 hari (dijanjikan Privacy).
pub async fn jalan(pool: PgPool, tg: Option<Arc<Telegram>>) {
    let mut tik = tokio::time::interval(Duration::from_secs(120));
    loop {
        tik.tick().await;
        if let Err(e) = sqlx::query("DELETE FROM tiket WHERE dibuat < now() - interval '90 days'").execute(&pool).await {
            warn!("retensi tiket gagal: {e}");
        }
        let Some(tg) = &tg else { continue };
        let tertunda: Vec<i64> = match sqlx::query_scalar(
            "SELECT id FROM tiket WHERE NOT diteruskan AND dibuat > now() - interval '1 day'
                AND dibuat < now() - interval '1 minute' ORDER BY id LIMIT 20",
        )
        .fetch_all(&pool)
        .await
        {
            Ok(v) => v,
            Err(e) => {
                warn!("tiket tertunda tak terbaca: {e}");
                continue;
            }
        };
        for id in tertunda {
            if let Err(e) = teruskan(&pool, tg, id).await {
                warn!(tiket = id, "penerusan ulang gagal: {e}");
                break; // Telegram masih galat → jangan menghabiskan antrean sekaligus
            }
        }
    }
}

// ── CLI tim ─────────────────────────────────────────────────────────────────

/// `synt-akun tiket [n]` — tiket terbaru.
pub async fn daftar(pool: &PgPool, n: i64) -> anyhow::Result<()> {
    let baris: Vec<(i64, chrono::DateTime<chrono::Utc>, String, String, Option<String>, Option<String>, String, bool)> =
        sqlx::query_as(
            "SELECT t.id, t.dibuat, t.kategori, t.status, p.handle, coalesce(p.wallet, t.kontak), t.pesan, t.diteruskan
               FROM tiket t LEFT JOIN pengguna p ON p.id = t.pengguna_id ORDER BY t.id DESC LIMIT $1",
        )
        .bind(n)
        .fetch_all(pool)
        .await?;
    for (id, dibuat, kat, status, handle, dari, pesan, tg) in baris {
        let dari = handle.map(|h| format!("@{h}")).or(dari.map(|d| profil::pendekkan(&d))).unwrap_or_default();
        let ringkas: String = pesan.replace('\n', " ").chars().take(80).collect();
        println!(
            "#{id} {} {kat} {status}{} · {dari} · {ringkas}",
            dibuat.format("%d %b %H:%M"),
            if tg { "" } else { " (belum ke Telegram)" }
        );
    }
    Ok(())
}

/// `synt-akun balas <id> "<isi>"` — pesan sistem ke pemilik tiket + status `dibalas`.
pub async fn balas(pool: &PgPool, id: i64, isi: &str) -> anyhow::Result<()> {
    anyhow::ensure!(!isi.trim().is_empty() && isi.chars().count() <= 600, "isi 1-600 karakter");
    anyhow::ensure!(!isi.contains('\u{2014}'), "tanpa em dash (aturan copy publik)");
    let (pengguna, kontak): (Option<i64>, Option<String>) =
        sqlx::query_as("SELECT pengguna_id, kontak FROM tiket WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| anyhow::anyhow!("tiket #{id} tak ada"))?;
    let Some(p) = pengguna else {
        anyhow::bail!("tiket #{id} dari tamu: balas lewat kontaknya ({})", kontak.unwrap_or_default());
    };
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO notifikasi (pengguna_id, jenis, judul, isi) VALUES ($1, 'sistem', $2, $3)")
        .bind(p)
        .bind(format!("Reply to support request #{id}"))
        .bind(isi.trim())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE tiket SET status = 'dibalas' WHERE id = $1").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

/// `synt-akun tiket-selesai <id>`
pub async fn selesai(pool: &PgPool, id: i64) -> anyhow::Result<()> {
    let n = sqlx::query("UPDATE tiket SET status = 'selesai' WHERE id = $1").bind(id).execute(pool).await?.rows_affected();
    anyhow::ensure!(n == 1, "tiket #{id} tak ada");
    Ok(())
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn konteks_hanya_bentuk_sah() {
        let m = saring_konteks(KonteksMasuk {
            page: Some("/coin/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr".into()),
            chain: Some("eth".into()),
            token: Some("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr".into()),
            tx: Some("bukan tanda".into()),
            trade_id: Some("12a".into()),
            trade_status: Some("failed".into()),
            trade_error: Some("Slippage\u{0007} exceeded".into()),
            build: Some("631e664".into()),
            screen: Some("1440x900".into()),
            wallet_app: Some("<script>".into()),
        });
        assert!(m.contains_key("page") && m.contains_key("token") && m.contains_key("build") && m.contains_key("screen"));
        assert!(!m.contains_key("chain") && !m.contains_key("tx") && !m.contains_key("tradeId") && !m.contains_key("walletApp"));
        assert_eq!(m["tradeError"], "Slippage exceeded");
        assert_eq!(m["tradeStatus"], "failed");
    }

    #[test]
    fn tx_kedua_chain() {
        let sol = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
        let bnb = format!("0x{}", "ab".repeat(32));
        for t in [sol.to_string(), bnb] {
            let m = saring_konteks(KonteksMasuk { tx: Some(t), ..Default::default() });
            assert!(m.contains_key("tx"));
        }
    }

    #[test]
    fn halaman_tanpa_spasi_atau_skema() {
        for p in ["https://evil.example", "/coin/a b", ""] {
            assert!(!saring_konteks(KonteksMasuk { page: Some(p.into()), ..Default::default() }).contains_key("page"));
        }
    }

    #[test]
    fn kategori_dikenal_saja() {
        assert_eq!(kategori("account"), Some("akun"));
        assert_eq!(kategori("akun"), None);
    }
}
