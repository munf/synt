//! Kotak masuk & follow (tahap C, 1 Nov).
//!
//! | rute | apa |
//! |---|---|
//! | `GET /kotak` | 30 notifikasi + 30 pesan sistem terbaru, dgn jumlah belum dibaca |
//! | `POST /kotak/baca` | tandai dibaca: `{ids}` tertentu, atau semua di `{tempat}` |
//! | `PUT /ikuti/:handle` · `DELETE /ikuti/:handle` | ikuti / berhenti mengikuti |
//!
//! Lonceng = `audit`·`harga`·`ikuti`; kotak pesan = `sistem` (tak ada pesan antar-pengguna).
//! Retensi 30 hari / 100 terbaru per pengguna ditegakkan `api::jaga_kebersihan`.

use crate::api::{asal_sah, ip_klien, pengguna_sesi, AppState, Galat, Hasil};
use axum::{
    extract::{ConnectInfo, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use std::net::SocketAddr;

const MAKS_DIIKUTI: i64 = 1000;
const PER_HALAMAN: i64 = 30;

#[derive(sqlx::FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
struct Butir {
    id: i64,
    /// nama bentuk UI (`price`, `social`, `system`) — terminal tak perlu tahu istilah DB
    kind: String,
    title: String,
    text: String,
    href: Option<String>,
    at: DateTime<Utc>,
    read: bool,
}

async fn daftar(pool: &PgPool, id: i64, pesan: bool) -> Hasil<(Vec<Butir>, i64)> {
    let butir = sqlx::query_as::<_, Butir>(
        "SELECT id,
                CASE jenis WHEN 'harga' THEN 'price' WHEN 'ikuti' THEN 'social' WHEN 'sistem' THEN 'system' ELSE jenis END AS kind,
                judul AS title, isi AS text, tautan AS href, dibuat AS at, dibaca IS NOT NULL AS read
           FROM notifikasi
          WHERE pengguna_id = $1 AND (jenis = 'sistem') = $2
          ORDER BY dibuat DESC, id DESC LIMIT $3",
    )
    .bind(id)
    .bind(pesan)
    .bind(PER_HALAMAN)
    .fetch_all(pool)
    .await?;
    let belum: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM notifikasi WHERE pengguna_id = $1 AND (jenis = 'sistem') = $2 AND dibaca IS NULL",
    )
    .bind(id)
    .bind(pesan)
    .fetch_one(pool)
    .await?;
    Ok((butir, belum))
}

pub async fn kotak(State(s): State<AppState>, h: HeaderMap) -> Hasil<Response> {
    let b = pengguna_sesi(&s, &h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Not signed in."))?;
    let (notif, belum_notif) = daftar(&s.pool, b.id, false).await?;
    let (pesan, belum_pesan) = daftar(&s.pool, b.id, true).await?;
    let mut r = Json(json!({
        "notifications": notif,
        "messages": pesan,
        "unread": { "notifications": belum_notif, "messages": belum_pesan },
    }))
    .into_response();
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(r)
}

#[derive(Deserialize)]
pub struct Baca {
    ids: Option<Vec<i64>>,
    /// `notifications` | `messages` — dipakai bila `ids` tak dikirim
    tempat: Option<String>,
}

pub async fn baca(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<Baca>,
) -> Hasil<StatusCode> {
    asal_sah(&h, &s)?;
    if !s.rem_simpan.izinkan(ip_klien(&h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many changes. Wait a minute."));
    }
    let b = pengguna_sesi(&s, &h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Not signed in."))?;
    match (m.ids, m.tempat.as_deref()) {
        (Some(ids), _) => {
            let ids: Vec<i64> = ids.into_iter().take(100).collect();
            sqlx::query("UPDATE notifikasi SET dibaca = now() WHERE pengguna_id = $1 AND id = ANY($2) AND dibaca IS NULL")
                .bind(b.id)
                .bind(&ids)
                .execute(&s.pool)
                .await?;
        }
        (None, Some(t @ ("notifications" | "messages"))) => {
            sqlx::query(
                "UPDATE notifikasi SET dibaca = now() WHERE pengguna_id = $1 AND (jenis = 'sistem') = $2 AND dibaca IS NULL",
            )
            .bind(b.id)
            .bind(t == "messages")
            .execute(&s.pool)
            .await?;
        }
        _ => return Err(Galat(StatusCode::BAD_REQUEST, "Nothing to mark as read.")),
    }
    Ok(StatusCode::NO_CONTENT)
}

/// id pengguna ber-handle itu (huruf besar & `@` diabaikan, sama dgn profil publik)
async fn target(pool: &PgPool, handle: &str) -> Hasil<i64> {
    let h = handle.trim_start_matches('@').to_ascii_lowercase();
    sqlx::query_scalar("SELECT id FROM pengguna WHERE handle = $1")
        .bind(&h)
        .fetch_optional(pool)
        .await?
        .ok_or(Galat(StatusCode::NOT_FOUND, "Profile not found."))
}

pub async fn ikuti(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Path(handle): Path<String>,
) -> Hasil<StatusCode> {
    asal_sah(&h, &s)?;
    if !s.rem_simpan.izinkan(ip_klien(&h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many changes. Wait a minute."));
    }
    let b = pengguna_sesi(&s, &h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Not signed in."))?;
    let t = target(&s.pool, &handle).await?;
    if t == b.id {
        return Err(Galat(StatusCode::BAD_REQUEST, "You cannot follow yourself."));
    }
    let n = sqlx::query(
        "INSERT INTO ikuti (pengikut_id, diikuti_id)
         SELECT $1, $2 WHERE (SELECT count(*) FROM ikuti WHERE pengikut_id = $1) < $3
         ON CONFLICT DO NOTHING",
    )
    .bind(b.id)
    .bind(t)
    .bind(MAKS_DIIKUTI)
    .execute(&s.pool)
    .await?
    .rows_affected();
    if n == 0 {
        let sudah: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM ikuti WHERE pengikut_id = $1 AND diikuti_id = $2)")
            .bind(b.id)
            .bind(t)
            .fetch_one(&s.pool)
            .await?;
        if !sudah {
            return Err(Galat(StatusCode::CONFLICT, "You can follow at most 1,000 profiles."));
        }
        return Ok(StatusCode::NO_CONTENT);
    }
    // Kabar "pengikut baru" hanya bila yang diikuti MENYALAKAN Social (bawaan: mati), dan sekali per
    // pengikut per 24 jam — ikuti/berhenti berulang tak boleh jadi cara membanjiri lonceng orang lain.
    // Nama pengikut ditulis SAAT INI; ia boleh menggantinya kemudian, notifikasi lama tak ikut berubah.
    let nama = b.nama_tampil();
    let tautan = b.handle_publik().map(|h| format!("/profile/{h}"));
    sqlx::query(
        "INSERT INTO notifikasi (pengguna_id, jenis, judul, isi, tautan, aktor_id)
         SELECT $1, 'ikuti', 'New follower', $2, $3, $4
          WHERE (SELECT data->'synt.notif.social' FROM preferensi WHERE pengguna_id = $1) = 'true'::jsonb
            AND NOT EXISTS (SELECT 1 FROM notifikasi WHERE pengguna_id = $1 AND jenis = 'ikuti' AND aktor_id = $4
                            AND dibuat > now() - interval '24 hours')",
    )
    .bind(t)
    .bind(format!("{nama} started following you."))
    .bind(tautan)
    .bind(b.id)
    .execute(&s.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn berhenti_ikuti(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Path(handle): Path<String>,
) -> Hasil<StatusCode> {
    asal_sah(&h, &s)?;
    if !s.rem_simpan.izinkan(ip_klien(&h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many changes. Wait a minute."));
    }
    let b = pengguna_sesi(&s, &h).await?.ok_or(Galat(StatusCode::UNAUTHORIZED, "Not signed in."))?;
    let t = target(&s.pool, &handle).await?;
    sqlx::query("DELETE FROM ikuti WHERE pengikut_id = $1 AND diikuti_id = $2").bind(b.id).bind(t).execute(&s.pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// (pengikut, diikuti) seorang pengguna — angka publik di profil.
pub async fn hitung_ikuti(pool: &PgPool, id: i64) -> Hasil<(i64, i64)> {
    Ok(sqlx::query_as(
        "SELECT (SELECT count(*) FROM ikuti WHERE diikuti_id = $1), (SELECT count(*) FROM ikuti WHERE pengikut_id = $1)",
    )
    .bind(id)
    .fetch_one(pool)
    .await?)
}

/// Pesan sistem ke SEMUA pengguna — `synt-akun umumkan "<judul>" "<isi>" [/tautan]`. Dijalankan tangan
/// oleh operator di VPS; tak ada rute HTTP untuk ini, jadi tak ada yang bisa menyiarkan dari internet.
pub async fn umumkan(pool: &PgPool, judul: &str, isi: &str, tautan: Option<&str>) -> anyhow::Result<u64> {
    anyhow::ensure!(!judul.trim().is_empty() && judul.chars().count() <= 80, "judul 1-80 karakter");
    anyhow::ensure!(!isi.trim().is_empty() && isi.chars().count() <= 600, "isi 1-600 karakter");
    anyhow::ensure!(!judul.contains('\u{2014}') && !isi.contains('\u{2014}'), "tanpa em dash (aturan copy publik)");
    Ok(sqlx::query(
        "INSERT INTO notifikasi (pengguna_id, jenis, judul, isi, tautan) SELECT id, 'sistem', $1, $2, $3 FROM pengguna",
    )
    .bind(judul.trim())
    .bind(isi.trim())
    .bind(tautan)
    .execute(pool)
    .await?
    .rows_affected())
}

/// Pesan sambutan untuk akun BARU (bukan tiap kali masuk).
pub async fn sambut(pool: &PgPool, id: i64) -> Hasil<()> {
    sqlx::query(
        "INSERT INTO notifikasi (pengguna_id, jenis, judul, isi, tautan) VALUES ($1, 'sistem', $2, $3, '/settings')",
    )
    .bind(id)
    .bind("Welcome to synt")
    .bind(
        "Your account is ready. Star a token to add it to your watchlist: you will get an alert when its score \
         changes or its price moves 50% or more. Choose which alerts you get in Settings.",
    )
    .execute(pool)
    .await?;
    Ok(())
}
