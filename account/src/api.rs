//! Rute `/api/akun/*`.
//!
//! | rute | apa |
//! |---|---|
//! | `POST /nonce` | pesan SIWS (Solana) atau SIWE (alamat 0x) untuk ditandatangani wallet (sekali pakai, 10 menit) |
//! | `POST /masuk` | verifikasi tanda tangan → buat akun bila baru → cookie sesi |
//! | `POST /keluar` | hapus sesi |
//! | `GET /saya` · `PATCH /saya` | profil sendiri (GET tanpa sesi = 204) |
//! | `DELETE /saya` | hapus akun sendiri beserta semua sesinya (handle ditahan 30 hari) |
//! | `/pantauan*` · `/preferensi` | watchlist & preferensi — lihat `sinkron.rs` |
//! | `/kotak*` · `/ikuti/:handle` | notifikasi, pesan sistem & follow — lihat `kotak.rs` |
//! | `GET /profil/:handle` | profil publik orang lain |
//!
//! ⚠️ Tiap permintaan yang MENGUBAH sesuatu wajib membawa `Origin` yang ada di
//! `AKUN_ORIGINS`. Bersama `SameSite=Lax` itu menutup CSRF: situs lain tak bisa
//! memakai cookie pengguna untuk login-paksa, keluar-paksa, atau mengubah profil.

use crate::{batas::Rem, kotak, profil, siwe, siws};
use axum::{
    extract::{ConnectInfo, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::{net::{IpAddr, SocketAddr}, sync::Arc};
use tracing::{info, warn};

/// ⭐ Awalan `__Host-` (review 1 Nov): browser hanya menerima cookie ini bila Secure,
/// `Path=/`, dan TANPA `Domain`. Subdomain lain di *.synt.fun jadi tak bisa menimpanya
/// (cookie tossing → korban diam-diam masuk ke akun penyerang).
const COOKIE: &str = "__Host-synt_sesi";
const UMUR_SESI_HARI: i64 = 30;
const UMUR_NONCE_MENIT: i64 = 10;
/// nonce aktif per wallet — cukup utk beberapa tab, tak cukup utk membanjiri tabel
const NONCE_PER_WALLET: i64 = 5;
const MASA_TUNGGU_HANDLE_HARI: i32 = 30;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub origins: Arc<Vec<String>>,
    /// true = percaya `CF-Connecting-IP` (hanya benar bila SEMUA lalu lintas lewat Cloudflare)
    pub cloudflare: bool,
    pub rem_nonce: Arc<Rem>,
    /// plafon nonce SELURUH layanan per menit — rem per-IP bisa diakali rotasi alamat
    pub rem_nonce_global: Arc<Rem>,
    pub rem_masuk: Arc<Rem>,
    pub rem_ubah: Arc<Rem>,
    /// watchlist & preferensi: lebih longgar dari profil — tombol bintang bisa ditekan beruntun
    pub rem_simpan: Arc<Rem>,
    /// trading: siapkan/kirim/lacak per IP
    pub rem_dagang: Arc<Rem>,
    /// trading: saldo & posisi (tiap panggilan = RPC berbayar) per IP
    pub rem_baca_dagang: Arc<Rem>,
    /// None = `AKUN_RPC_URL` kosong → rute trading menjawab 503
    pub dagang: Option<Arc<crate::dagang::Dagang>>,
    /// trading BNB Chain (3 Nov); None hanya bila klien HTTP gagal dibuat
    pub bnb: Option<Arc<crate::bnb::Bnb>>,
}

// ── galat ───────────────────────────────────────────────────────────────────

pub struct Galat(pub StatusCode, pub &'static str);

impl IntoResponse for Galat {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<sqlx::Error> for Galat {
    fn from(e: sqlx::Error) -> Self {
        // isi galat DB tak dikirim ke pengguna (bisa memuat nama tabel/kolom)
        warn!("galat DB: {e}");
        Galat(StatusCode::SERVICE_UNAVAILABLE, "Account service is unavailable. Try again shortly.")
    }
}

pub(crate) type Hasil<T> = Result<T, Galat>;

const TERLALU_SERING: Galat = Galat(StatusCode::TOO_MANY_REQUESTS, "Too many sign-in attempts. Wait a minute.");

// ── pembantu ────────────────────────────────────────────────────────────────

/// IP klien. Hanya dipakai rem laju, tak pernah disimpan.
///
/// ⚠️ `CF-Connecting-IP` hanya bisa dipercaya bila origin TAK terjangkau selain lewat
/// Cloudflare (ufw di VPS ini hanya membuka 80/443 utk rentang Cloudflare). Tanpa
/// `AKUN_CLOUDFLARE=1` dipakai `X-Forwarded-For` yang DITULIS Caddy dari peer-nya
/// sendiri (Caddy tanpa `trusted_proxies` mengganti, bukan meneruskan, nilai klien).
pub(crate) fn ip_klien(h: &HeaderMap, peer: SocketAddr, cloudflare: bool) -> IpAddr {
    let nama = if cloudflare { "cf-connecting-ip" } else { "x-forwarded-for" };
    h.get(nama)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .unwrap_or(peer.ip())
}

pub(crate) fn asal_sah(h: &HeaderMap, s: &AppState) -> Hasil<String> {
    let asal = h.get(header::ORIGIN).and_then(|v| v.to_str().ok()).unwrap_or("");
    if s.origins.iter().any(|o| o == asal) {
        Ok(asal.to_string())
    } else {
        Err(Galat(StatusCode::FORBIDDEN, "Request origin is not allowed."))
    }
}

fn token_cookie(h: &HeaderMap) -> Option<String> {
    h.get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|c| c.trim().strip_prefix(&format!("{COOKIE}=")).map(str::to_string))
        .filter(|t| t.len() == 64 && t.bytes().all(|b| b.is_ascii_hexdigit()))
}

pub(crate) fn hash_token(t: &str) -> Vec<u8> {
    Sha256::digest(t.as_bytes()).to_vec()
}

fn acak_hex(n: usize) -> Result<String, Galat> {
    let mut b = vec![0u8; n];
    getrandom::getrandom(&mut b).map_err(|_| Galat(StatusCode::INTERNAL_SERVER_ERROR, "Could not start sign-in."))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

fn cookie_sesi(token: &str) -> HeaderValue {
    let v = format!("{COOKIE}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={}", UMUR_SESI_HARI * 86_400);
    HeaderValue::from_str(&v).expect("cookie ASCII")
}

fn cookie_hapus() -> HeaderValue {
    HeaderValue::from_static("__Host-synt_sesi=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")
}

#[derive(sqlx::FromRow)]
pub(crate) struct Baris {
    pub id: i64,
    pub wallet: String,
    handle: Option<String>,
    nama: Option<String>,
    bio: Option<String>,
    dibuat: DateTime<Utc>,
}

impl Baris {
    /// nama tampilan → @handle → alamat pendek (sama dgn `namaTampil` di terminal)
    pub fn nama_tampil(&self) -> String {
        self.nama
            .clone()
            .or_else(|| self.handle.as_ref().map(|h| format!("@{h}")))
            .unwrap_or_else(|| profil::pendekkan(&self.wallet))
    }

    pub fn handle_publik(&self) -> Option<&str> {
        self.handle.as_deref()
    }
}

#[derive(sqlx::FromRow)]
struct BarisMasuk {
    #[sqlx(flatten)]
    b: Baris,
    /// baris baru dibuat oleh INSERT ini (bukan akun lama yang masuk lagi)
    baru: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Profil {
    /// alamat lengkap hanya untuk pemiliknya sendiri; profil publik cukup bentuk pendek
    #[serde(skip_serializing_if = "Option::is_none")]
    wallet: Option<String>,
    wallet_short: String,
    handle: Option<String>,
    display_name: Option<String>,
    bio: Option<String>,
    joined: DateTime<Utc>,
    /// angka publik; None = tak dihitung untuk jawaban ini
    #[serde(skip_serializing_if = "Option::is_none")]
    followers: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    following: Option<i64>,
    /// hanya di profil publik dan hanya bila yang melihat sedang masuk
    #[serde(skip_serializing_if = "Option::is_none")]
    is_following: Option<bool>,
}

impl Profil {
    fn dari(b: Baris, milik_sendiri: bool) -> Self {
        Profil {
            wallet_short: profil::pendekkan(&b.wallet),
            wallet: milik_sendiri.then_some(b.wallet),
            handle: b.handle,
            display_name: b.nama,
            bio: b.bio,
            joined: b.dibuat,
            followers: None,
            following: None,
            is_following: None,
        }
    }

    async fn dengan_ikuti(mut self, pool: &PgPool, id: i64) -> Hasil<Self> {
        let (pengikut, diikuti) = kotak::hitung_ikuti(pool, id).await?;
        self.followers = Some(pengikut);
        self.following = Some(diikuti);
        Ok(self)
    }
}

/// Pengguna dari cookie sesi. Membaca saja; `terakhir_dipakai` diperbarui paling
/// sering sejam sekali — tiap kunjungan halaman tak perlu jadi tulisan DB.
pub(crate) async fn pengguna_sesi(s: &AppState, h: &HeaderMap) -> Hasil<Option<Baris>> {
    let Some(token) = token_cookie(h) else { return Ok(None) };
    let hash = hash_token(&token);
    let baris = sqlx::query_as::<_, Baris>(
        "SELECT p.id, p.wallet, p.handle, p.nama, p.bio, p.dibuat
           FROM sesi JOIN pengguna p ON p.id = sesi.pengguna_id
          WHERE sesi.token_hash = $1 AND sesi.kedaluwarsa > now()",
    )
    .bind(&hash)
    .fetch_optional(&s.pool)
    .await?;
    if baris.is_some() {
        sqlx::query(
            "UPDATE sesi SET terakhir_dipakai = now()
              WHERE token_hash = $1 AND terakhir_dipakai < now() - interval '1 hour'",
        )
        .bind(&hash)
        .execute(&s.pool)
        .await?;
    }
    Ok(baris)
}

// ── rute ────────────────────────────────────────────────────────────────────

pub async fn sehat(State(s): State<AppState>) -> impl IntoResponse {
    let db = sqlx::query("SELECT 1").execute(&s.pool).await.is_ok();
    let kode = if db { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (kode, Json(json!({ "ok": db })))
}

/// Alamat dari klien → (bentuk kanonik, EVM?). Solana = base58 kunci ed25519 apa adanya; EVM = checksum
/// EIP-55. Kedua bentuk tak mungkin bertabrakan di kolom `wallet` (abjad base58 tak memuat `0`),
/// jadi satu kolom UNIQUE cukup.
fn alamat_sah(a: &str) -> Option<(String, bool)> {
    let a = a.trim();
    if a.starts_with("0x") {
        return siwe::alamat(a).map(|x| (x, true));
    }
    siws::kunci_publik(a).map(|_| (a.to_string(), false))
}

#[derive(Deserialize)]
pub struct MintaNonce {
    address: String,
}

pub async fn nonce(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<MintaNonce>,
) -> Hasil<impl IntoResponse> {
    let asal = asal_sah(&h, &s)?;
    if !s.rem_nonce.izinkan(ip_klien(&h, peer, s.cloudflare)) || !s.rem_nonce_global.izinkan_global() {
        return Err(TERLALU_SERING);
    }
    let (alamat, evm) = alamat_sah(&m.address).ok_or(Galat(StatusCode::BAD_REQUEST, "This is not a valid wallet address."))?;
    let alamat = alamat.as_str();
    let aktif: i64 = sqlx::query_scalar("SELECT count(*) FROM nonce_masuk WHERE wallet = $1 AND kedaluwarsa > now()")
        .bind(alamat)
        .fetch_one(&s.pool)
        .await?;
    if aktif >= NONCE_PER_WALLET {
        return Err(TERLALU_SERING);
    }
    let domain = asal.split("://").nth(1).unwrap_or(&asal);
    let nonce = acak_hex(16)?;
    let terbit = Utc::now();
    let kedaluwarsa = terbit + chrono::Duration::minutes(UMUR_NONCE_MENIT);
    let minta = siws::Permintaan { domain, uri: &asal, alamat, nonce: &nonce, terbit, kedaluwarsa };
    let pesan = if evm { siwe::susun_pesan(&minta) } else { siws::susun_pesan(&minta) };
    sqlx::query("INSERT INTO nonce_masuk (nonce, wallet, pesan, kedaluwarsa, asal) VALUES ($1, $2, $3, $4, $5)")
        .bind(&nonce)
        .bind(alamat)
        .bind(&pesan)
        .bind(kedaluwarsa)
        .bind(&asal)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "nonce": nonce, "message": pesan, "expiresAt": kedaluwarsa })))
}

#[derive(Deserialize)]
pub struct Masuk {
    address: String,
    nonce: String,
    signature: String,
}

pub async fn masuk(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(m): Json<Masuk>,
) -> Hasil<Response> {
    let asal = asal_sah(&h, &s)?;
    if !s.rem_masuk.izinkan(ip_klien(&h, peer, s.cloudflare)) {
        return Err(TERLALU_SERING);
    }
    // alamat tak sah → tak ada nonce yang cocok → "kedaluwarsa", sama dgn nonce palsu
    let (alamat, evm) = alamat_sah(&m.address).unwrap_or_default();
    let alamat = alamat.as_str();
    // DELETE … RETURNING: nonce hangus saat dibaca, berhasil atau tidak verifikasinya.
    // Tanda tangan yang tertangkap tak bisa dipakai dua kali.
    let ambil = sqlx::query_as::<_, (String, DateTime<Utc>, Option<String>)>(
        "DELETE FROM nonce_masuk WHERE nonce = $1 AND wallet = $2 RETURNING pesan, kedaluwarsa, asal",
    )
    .bind(m.nonce.trim())
    .bind(alamat)
    .fetch_optional(&s.pool)
    .await?;
    let kadaluwarsa = Galat(StatusCode::UNAUTHORIZED, "This sign-in request has expired. Try again.");
    let Some((pesan, kedaluwarsa, asal_nonce)) = ambil else { return Err(kadaluwarsa) };
    if kedaluwarsa <= Utc::now() {
        return Err(kadaluwarsa);
    }
    // pesan untuk origin A tak boleh ditukar di origin B (bermakna begitu AKUN_ORIGINS > 1)
    if asal_nonce.as_deref() != Some(asal.as_str()) {
        return Err(Galat(StatusCode::UNAUTHORIZED, "This sign-in request belongs to another site."));
    }
    let sah = if evm { siwe::verifikasi(alamat, &pesan, &m.signature) } else { siws::verifikasi(alamat, &pesan, m.signature.trim()) };
    if !sah {
        return Err(Galat(StatusCode::UNAUTHORIZED, "The wallet signature could not be verified."));
    }

    // `xmax = 0` ⇔ baris ini lahir dari INSERT, bukan dari cabang ON CONFLICT (akun lama)
    let BarisMasuk { b, baru } = sqlx::query_as::<_, BarisMasuk>(
        "INSERT INTO pengguna (wallet, masuk_terakhir) VALUES ($1, now())
         ON CONFLICT (wallet) DO UPDATE SET masuk_terakhir = now()
         RETURNING id, wallet, handle, nama, bio, dibuat, (xmax = 0) AS baru",
    )
    .bind(alamat)
    .fetch_one(&s.pool)
    .await?;
    if baru {
        kotak::sambut(&s.pool, b.id).await?;
    }

    let token = acak_hex(32)?;
    sqlx::query("INSERT INTO sesi (token_hash, pengguna_id, kedaluwarsa) VALUES ($1, $2, now() + make_interval(days => $3))")
        .bind(hash_token(&token))
        .bind(b.id)
        .bind(UMUR_SESI_HARI as i32)
        .execute(&s.pool)
        .await?;
    info!(pengguna = b.id, "masuk");

    let id = b.id;
    let mut r = Json(Profil::dari(b, true).dengan_ikuti(&s.pool, id).await?).into_response();
    r.headers_mut().insert(header::SET_COOKIE, cookie_sesi(&token));
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(r)
}

pub async fn keluar(State(s): State<AppState>, h: HeaderMap) -> Hasil<Response> {
    asal_sah(&h, &s)?;
    if let Some(t) = token_cookie(&h) {
        sqlx::query("DELETE FROM sesi WHERE token_hash = $1").bind(hash_token(&t)).execute(&s.pool).await?;
    }
    let mut r = StatusCode::NO_CONTENT.into_response();
    r.headers_mut().insert(header::SET_COOKIE, cookie_hapus());
    Ok(r)
}

pub async fn saya(State(s): State<AppState>, h: HeaderMap) -> Hasil<Response> {
    match pengguna_sesi(&s, &h).await? {
        Some(b) => {
            let id = b.id;
            let mut r = Json(Profil::dari(b, true).dengan_ikuti(&s.pool, id).await?).into_response();
            r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            Ok(r)
        }
        // 204, bukan 401: "belum masuk" adalah keadaan normal tiap pengunjung, bukan galat —
        // 401 di sini memunculkan baris merah di konsol browser pada SETIAP halaman.
        None => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

/// Field yang tak dikirim = tak diubah. String kosong = dikosongkan
/// (kecuali handle: sekali dipilih, hanya bisa diganti, tak dihapus).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ubah {
    handle: Option<String>,
    display_name: Option<String>,
    bio: Option<String>,
}

pub async fn ubah_saya(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
    Json(u): Json<Ubah>,
) -> Hasil<impl IntoResponse> {
    asal_sah(&h, &s)?;
    if !s.rem_ubah.izinkan(ip_klien(&h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many changes. Wait a minute."));
    }
    let Some(b) = pengguna_sesi(&s, &h).await? else {
        return Err(Galat(StatusCode::UNAUTHORIZED, "Not signed in."));
    };
    let handle = u
        .handle
        .as_deref()
        .map(profil::periksa_handle)
        .transpose()
        .map_err(|e| Galat(StatusCode::BAD_REQUEST, e))?;
    let nama = u
        .display_name
        .as_deref()
        .map(profil::periksa_nama)
        .transpose()
        .map_err(|e| Galat(StatusCode::BAD_REQUEST, e))?;
    let bio = u
        .bio
        .as_deref()
        .map(|x| profil::rapikan(x, true, 160))
        .transpose()
        .map_err(|_| Galat(StatusCode::BAD_REQUEST, "Bio can be at most 160 characters."))?;
    // Satu transaksi: baris pengguna dikunci (FOR UPDATE) supaya handle lama yang dilepas
    // dan handle baru yang diambil tercatat konsisten, juga bila dua tab menyimpan bersamaan.
    let mut tx = s.pool.begin().await?;
    let lama: Option<String> = sqlx::query_scalar("SELECT handle FROM pengguna WHERE id = $1 FOR UPDATE")
        .bind(b.id)
        .fetch_one(&mut *tx)
        .await?;
    let milik = hash_token(&b.wallet);
    if let Some(h) = handle.as_deref().filter(|h| Some(*h) != lama.as_deref()) {
        let ditahan: Option<DateTime<Utc>> = sqlx::query_scalar(
            "SELECT sampai FROM handle_lepas WHERE handle = $1 AND sampai > now() AND wallet_hash <> $2",
        )
        .bind(h)
        .bind(&milik)
        .fetch_optional(&mut *tx)
        .await?;
        if ditahan.is_some() {
            return Err(Galat(StatusCode::CONFLICT, "This handle was released recently and is on hold for 30 days."));
        }
    }
    // Satu UPDATE, hanya kolom yang dikirim: dua PATCH bersamaan (mis. dua tab) tak saling
    // menimpa field yang tak mereka sentuh — versi baca-lalu-tulis kehilangan salah satunya.
    let hasil = sqlx::query_as::<_, Baris>(
        "UPDATE pengguna SET
             handle = CASE WHEN $2 THEN $3 ELSE handle END,
             nama   = CASE WHEN $4 THEN $5 ELSE nama END,
             bio    = CASE WHEN $6 THEN $7 ELSE bio END
          WHERE id = $1
         RETURNING id, wallet, handle, nama, bio, dibuat",
    )
    .bind(b.id)
    .bind(handle.is_some())
    .bind(handle.clone())
    .bind(nama.is_some())
    .bind(nama.flatten())
    .bind(bio.is_some())
    .bind(bio.flatten())
    .fetch_one(&mut *tx)
    .await;
    let baru = match hasil {
        Ok(baru) => baru,
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => {
            return Err(Galat(StatusCode::CONFLICT, "This handle is already taken."));
        }
        Err(e) => return Err(e.into()),
    };
    if baru.handle != lama {
        if let Some(l) = &lama {
            lepas_handle(&mut tx, l, &milik).await?;
        }
        // mengambil kembali handle sendiri yang sedang ditahan → tahanannya selesai
        if let Some(h) = &baru.handle {
            sqlx::query("DELETE FROM handle_lepas WHERE handle = $1").bind(h).execute(&mut *tx).await?;
        }
    }
    tx.commit().await?;
    let id = baru.id;
    Ok(Json(Profil::dari(baru, true).dengan_ikuti(&s.pool, id).await?))
}

/// Tahan handle yang dilepas selama MASA_TUNGGU_HANDLE_HARI; hanya wallet pelepas yang boleh
/// mengambilnya lagi dalam masa itu. Halaman Privacy menyebut 30 hari — ubah keduanya bersamaan.
async fn lepas_handle(tx: &mut sqlx::Transaction<'_, sqlx::Postgres>, handle: &str, wallet_hash: &[u8]) -> Hasil<()> {
    sqlx::query(
        "INSERT INTO handle_lepas (handle, wallet_hash, sampai) VALUES ($1, $2, now() + make_interval(days => $3))
         ON CONFLICT (handle) DO UPDATE SET wallet_hash = EXCLUDED.wallet_hash, dilepas = now(), sampai = EXCLUDED.sampai",
    )
    .bind(handle)
    .bind(wallet_hash)
    .bind(MASA_TUNGGU_HANDLE_HARI)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Hapus akun sendiri: baris `pengguna` (sesi ikut terhapus lewat ON DELETE CASCADE) dan
/// nonce yang masih menunggu untuk wallet itu. Kebijakan privasi menjanjikan penghapusan
/// mandiri, jadi jalurnya harus ada tanpa perlu menghubungi siapa pun.
pub async fn hapus_saya(
    State(s): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    h: HeaderMap,
) -> Hasil<Response> {
    asal_sah(&h, &s)?;
    if !s.rem_ubah.izinkan(ip_klien(&h, peer, s.cloudflare)) {
        return Err(Galat(StatusCode::TOO_MANY_REQUESTS, "Too many changes. Wait a minute."));
    }
    let Some(b) = pengguna_sesi(&s, &h).await? else {
        return Err(Galat(StatusCode::UNAUTHORIZED, "Not signed in."));
    };
    let mut tx = s.pool.begin().await?;
    if let Some(h) = &b.handle {
        lepas_handle(&mut tx, h, &hash_token(&b.wallet)).await?;
    }
    sqlx::query("DELETE FROM nonce_masuk WHERE wallet = $1").bind(&b.wallet).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM pengguna WHERE id = $1").bind(b.id).execute(&mut *tx).await?;
    tx.commit().await?;
    info!(pengguna = b.id, "akun dihapus");
    let mut r = StatusCode::NO_CONTENT.into_response();
    r.headers_mut().insert(header::SET_COOKIE, cookie_hapus());
    Ok(r)
}

pub async fn profil_publik(State(s): State<AppState>, h: HeaderMap, Path(handle): Path<String>) -> Hasil<Response> {
    let hd = handle.trim_start_matches('@').to_ascii_lowercase();
    let b = sqlx::query_as::<_, Baris>("SELECT id, wallet, handle, nama, bio, dibuat FROM pengguna WHERE handle = $1")
        .bind(&hd)
        .fetch_optional(&s.pool)
        .await?
        .ok_or(Galat(StatusCode::NOT_FOUND, "Profile not found."))?;
    let id = b.id;
    let mut p = Profil::dari(b, false).dengan_ikuti(&s.pool, id).await?;
    // `isFollowing` membuat jawaban berbeda per penonton → jangan disimpan cache bersama
    if let Some(saya) = pengguna_sesi(&s, &h).await? {
        if saya.id != id {
            p.is_following = Some(
                sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM ikuti WHERE pengikut_id = $1 AND diikuti_id = $2)")
                    .bind(saya.id)
                    .bind(id)
                    .fetch_one(&s.pool)
                    .await?,
            );
        }
    }
    let mut r = Json(p).into_response();
    r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
    Ok(r)
}

/// Nonce & sesi kedaluwarsa dibuang tiap 2 menit — tabel tak menumpuk sampah
/// (nonce hidup 10 menit; sapuan 10 menit membuatnya bertahan sampai 20).
pub async fn jaga_kebersihan(pool: PgPool) {
    let mut tik = tokio::time::interval(std::time::Duration::from_secs(120));
    loop {
        tik.tick().await;
        let n = sqlx::query("DELETE FROM nonce_masuk WHERE kedaluwarsa < now()").execute(&pool).await;
        let s = sqlx::query("DELETE FROM sesi WHERE kedaluwarsa < now()").execute(&pool).await;
        if let Err(e) = sqlx::query("DELETE FROM handle_lepas WHERE sampai < now()").execute(&pool).await {
            warn!("pembersihan handle_lepas gagal: {e}");
        }
        // retensi notifikasi (dijanjikan halaman Privacy): 30 hari, 100 terbaru per pengguna
        let tua = sqlx::query("DELETE FROM notifikasi WHERE dibuat < now() - interval '30 days'").execute(&pool).await;
        let lebih = sqlx::query(
            "DELETE FROM notifikasi WHERE id IN (
                SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY pengguna_id ORDER BY dibuat DESC, id DESC) AS ke
                                  FROM notifikasi) x WHERE ke > 100)",
        )
        .execute(&pool)
        .await;
        if let Err(e) = tua.and(lebih) {
            warn!("pembersihan notifikasi gagal: {e}");
        }
        if let Err(e) = crate::dagang::bersihkan(&pool).await {
            warn!("pembersihan dagang gagal: {e}");
        }
        match (n, s) {
            (Ok(n), Ok(s)) if n.rows_affected() + s.rows_affected() > 0 => {
                info!(nonce = n.rows_affected(), sesi = s.rows_affected(), "pembersihan")
            }
            (Err(e), _) | (_, Err(e)) => warn!("pembersihan gagal: {e}"),
            _ => {}
        }
    }
}
