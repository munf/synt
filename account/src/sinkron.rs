//! Watchlist & preferensi yang ikut akun (tahap B, 1 Nov).
//!
//! | rute | apa |
//! |---|---|
//! | `GET /pantauan` | daftar token yang dipantau, urut waktu ditambah |
//! | `PUT /pantauan/:token` · `DELETE /pantauan/:token` | tambah / buang satu token (idempoten) |
//! | `POST /pantauan/gabung` | gabungkan watchlist lokal perangkat ke akun (sekali per perangkat) |
//! | `GET /preferensi` · `PUT /preferensi` | satu objek JSON preferensi terminal |
//!
//! ⚠️ Preferensi memakai DAFTAR PUTIH kunci: tabel ini tak boleh jadi penyimpanan bebas
//! (Privacy hanya menjanjikan notifikasi, tampilan & quick buy).

use crate::api::{asal_sah, ip_klien, pengguna_sesi, AppState, Baris, Galat, Hasil};
use axum::{
    extract::{ConnectInfo, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::net::SocketAddr;

const MAKS_PANTAUAN: i64 = 200;
const MAKS_PREFERENSI: usize = 32;

/// Alamat mint Solana (base58) atau kontrak BNB (0x, disimpan huruf kecil). Sama dgn CHECK di DB.
fn token_sah(t: &str) -> Option<String> {
    let t = t.trim();
    if let Some(hex) = t.strip_prefix("0x").or_else(|| t.strip_prefix("0X")) {
        return (hex.len() == 40 && hex.bytes().all(|b| b.is_ascii_hexdigit())).then(|| format!("0x{}", hex.to_ascii_lowercase()));
    }
    let base58 = |b: u8| b.is_ascii_alphanumeric() && !matches!(b, b'0' | b'O' | b'I' | b'l');
    ((32..=44).contains(&t.len()) && t.bytes().all(base58)).then(|| t.to_string())
}

/// `synt.notif.audit`, `synt.display.compact`, `synt.quickbuy.amount` …
fn kunci_sah(k: &str) -> bool {
    ["synt.notif.", "synt.display.", "synt.quickbuy."].iter().any(|p| {
        k.strip_prefix(p)
            .is_some_and(|sisa| (1..=24).contains(&sisa.len()) && sisa.bytes().all(|b| b.is_ascii_alphabetic()))
    })
}

fn nilai_sah(v: &Value) -> bool {
    match v {
        Value::Bool(_) => true,
        Value::Number(n) => n.as_f64().is_some_and(|f| f.is_finite() && f.abs() <= 1e9),
        Value::String(s) => s.chars().count() <= 32,
        _ => false,
    }
}

async fn wajib_masuk(s: &AppState, h: &HeaderMap) -> Hasil<Baris> {
    pengguna_sesi(s, h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Not signed in."))
}

/// Penjaga semua rute yang MENGUBAH: origin sah + rem laju + sesi.
async fn jaga_ubah(s: &AppState, h: &HeaderMap, peer: SocketAddr) -> Hasil<Baris> {
    asal_sah(h, s)?;
    if !s.rem_simpan.izinkan(ip_klien(h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many changes. Wait a minute."));
    }
    wajib_masuk(s, h).await
}

fn tanpa_cache(v: Value) -> Response {
    let mut r = Json(v).into_response();
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    r
}

async fn daftar(s: &AppState, id: i64) -> Hasil<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT token FROM pantauan WHERE pengguna_id = $1 ORDER BY ditambah, token")
        .bind(id)
        .fetch_all(&s.pool)
        .await?)
}

pub async fn pantauan(State(s): State<AppState>, h: HeaderMap) -> Hasil<Response> {
    let b = wajib_masuk(&s, &h).await?;
    Ok(tanpa_cache(json!({ "tokens": daftar(&s, b.id).await? })))
}

pub async fn pantau(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Path(token): Path<String>,
) -> Hasil<StatusCode> {
    let b = jaga_ubah(&s, &h, peer).await?;
    let t = token_sah(&token).ok_or(Galat(StatusCode::BAD_REQUEST, "This is not a valid token address."))?;
    // plafon dicek di dalam INSERT yang sama: dua tab yang menambah bersamaan tak bisa melewatinya jauh
    let n = sqlx::query(
        "INSERT INTO pantauan (pengguna_id, token)
         SELECT $1, $2 WHERE (SELECT count(*) FROM pantauan WHERE pengguna_id = $1) < $3
         ON CONFLICT DO NOTHING",
    )
    .bind(b.id)
    .bind(&t)
    .bind(MAKS_PANTAUAN)
    .execute(&s.pool)
    .await?
    .rows_affected();
    if n == 0 {
        let ada: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pantauan WHERE pengguna_id = $1 AND token = $2)")
            .bind(b.id)
            .bind(&t)
            .fetch_one(&s.pool)
            .await?;
        if !ada {
            return Err(Galat(StatusCode::CONFLICT, "Your watchlist is full (200 tokens)."));
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn lepas(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Path(token): Path<String>,
) -> Hasil<StatusCode> {
    let b = jaga_ubah(&s, &h, peer).await?;
    let t = token_sah(&token).ok_or(Galat(StatusCode::BAD_REQUEST, "This is not a valid token address."))?;
    sqlx::query("DELETE FROM pantauan WHERE pengguna_id = $1 AND token = $2").bind(b.id).bind(&t).execute(&s.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct Gabung {
    tokens: Vec<String>,
}

/// Watchlist lokal perangkat → akun. Token tak sah dilewati (bukan menggagalkan semuanya:
/// localStorage lama bisa berisi apa saja); yang melewati plafon tak ikut masuk.
pub async fn gabung(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(g): Json<Gabung>,
) -> Hasil<Response> {
    let b = jaga_ubah(&s, &h, peer).await?;
    let mut tokens: Vec<String> = g.tokens.iter().take(MAKS_PANTAUAN as usize).filter_map(|t| token_sah(t)).collect();
    tokens.dedup();
    let mut tx = s.pool.begin().await?;
    // kunci baris pengguna: dua perangkat yang bergabung bersamaan tak bisa melewati plafon
    sqlx::query("SELECT 1 FROM pengguna WHERE id = $1 FOR UPDATE").bind(b.id).execute(&mut *tx).await?;
    let ada: i64 = sqlx::query_scalar("SELECT count(*) FROM pantauan WHERE pengguna_id = $1").bind(b.id).fetch_one(&mut *tx).await?;
    let sisa = (MAKS_PANTAUAN - ada).max(0);
    sqlx::query(
        "INSERT INTO pantauan (pengguna_id, token)
         SELECT $1, t FROM unnest($2::text[]) WITH ORDINALITY AS u(t, i)
          WHERE NOT EXISTS (SELECT 1 FROM pantauan p WHERE p.pengguna_id = $1 AND p.token = u.t)
          ORDER BY i LIMIT $3
         ON CONFLICT DO NOTHING",
    )
    .bind(b.id)
    .bind(&tokens)
    .bind(sisa)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(tanpa_cache(json!({ "tokens": daftar(&s, b.id).await? })))
}

pub async fn preferensi(State(s): State<AppState>, h: HeaderMap) -> Hasil<Response> {
    let b = wajib_masuk(&s, &h).await?;
    let data: Option<Value> = sqlx::query_scalar("SELECT data FROM preferensi WHERE pengguna_id = $1")
        .bind(b.id)
        .fetch_optional(&s.pool)
        .await?;
    // null = akun belum pernah menyimpan preferensi → perangkat mengunggah miliknya
    Ok(tanpa_cache(json!({ "data": data })))
}

#[derive(Deserialize)]
pub struct Simpan {
    data: Map<String, Value>,
}

pub async fn simpan_preferensi(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(p): Json<Simpan>,
) -> Hasil<StatusCode> {
    let b = jaga_ubah(&s, &h, peer).await?;
    // tombol notifikasi dibaca pemantau sbg boolean → wajib boolean
    let notif_bool = |k: &str, v: &Value| !k.starts_with("synt.notif.") || v.is_boolean();
    if p.data.len() > MAKS_PREFERENSI || !p.data.iter().all(|(k, v)| kunci_sah(k) && nilai_sah(v) && notif_bool(k, v)) {
        return Err(Galat(StatusCode::BAD_REQUEST, "These settings cannot be saved."));
    }
    sqlx::query(
        "INSERT INTO preferensi (pengguna_id, data) VALUES ($1, $2)
         ON CONFLICT (pengguna_id) DO UPDATE SET data = EXCLUDED.data, diubah = now()",
    )
    .bind(b.id)
    .bind(Value::Object(p.data))
    .execute(&s.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn token_dinormalisasi() {
        assert_eq!(token_sah(" 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU ").as_deref(), Some("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"));
        assert_eq!(token_sah("0xAbCdEf0123456789abcdef0123456789ABCDEF01").as_deref(), Some("0xabcdef0123456789abcdef0123456789abcdef01"));
        assert!(token_sah("0x123").is_none());
        assert!(token_sah("bukan alamat").is_none());
        assert!(token_sah("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl").is_none());
    }

    #[test]
    fn preferensi_daftar_putih() {
        assert!(kunci_sah("synt.notif.audit"));
        assert!(kunci_sah("synt.quickbuy.amount"));
        assert!(!kunci_sah("synt.watchlist"));
        assert!(!kunci_sah("synt.notif."));
        assert!(!kunci_sah("synt.display.x-y"));
        assert!(nilai_sah(&json!(true)) && nilai_sah(&json!(0.5)) && nilai_sah(&json!("abc")));
        assert!(!nilai_sah(&json!({"a": 1})) && !nilai_sah(&json!([1])) && !nilai_sah(&json!("x".repeat(33))));
    }
}
