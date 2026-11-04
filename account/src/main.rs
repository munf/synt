//! synt-akun — akun pengguna terminal synt (login wallet Solana + profil).
//!
//! ## Kenapa proses & DB TERPISAH
//!
//! Inilah satu-satunya bagian synt yang menyimpan data MILIK PENGGUNA, dan satu-
//! satunya yang menulis atas permintaan internet. Karena itu ia dipisah dari:
//!
//! | dari | alasannya |
//! |---|---|
//! | engine (synt-v10/synt-bnb) | engine memegang kunci RPC & wallet; layanan publik tak boleh menyentuhnya |
//! | synt-dash | dash dijaga READ-ONLY oleh role `dash_ro` — menambah tulisan di sana merusak jaminan itu |
//! | DB `synt_v10` | role `akun_rw` hanya punya `synt_akun`; bug injeksi di sini tak bisa membaca/menulis data pasar |
//!
//! Konsekuensi lain yang disengaja: data pengguna bisa dicadangkan, dihapus,
//! atau diserahkan terpisah tanpa ikut menyeret dataset engine.
//!
//! ## Login = tanda tangan pesan, bukan transaksi
//!
//! Lihat `siws.rs`. Layanan ini hanya MEMVERIFIKASI tanda tangan; ia tak pernah
//! melihat kunci privat dan tak bisa memindahkan dana.

mod api;
mod batas;
mod bnb;
mod dagang;
mod kotak;
mod pemantau;
mod profil;
mod siwe;
mod siws;
mod sinkron;
mod soltx;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post, put},
    Router,
};
use std::{net::SocketAddr, str::FromStr, sync::Arc, time::Duration};
use tracing::{info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let filter = std::env::var("RUST_LOG").unwrap_or_else(|_| "synt_akun=info".into());
    tracing_subscriber::fmt().with_env_filter(filter).init();

    let url = std::env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL tak diset"))?;
    // gagal-cepat bila .env tertukar dgn URL engine: layanan publik ini HANYA boleh memegang synt_akun
    // Dibaca lewat parser sqlx sendiri, bukan potong-string: sqlx menghormati `?dbname=` &
    // `?user=`, jadi URL yang "tampak" synt_akun bisa saja tersambung ke DB lain (review 1 Nov).
    let opsi = sqlx::postgres::PgConnectOptions::from_str(&url)?;
    if opsi.get_username() != "akun_rw" || opsi.get_database() != Some("synt_akun") {
        anyhow::bail!("DATABASE_URL harus role `akun_rw` ke DB `synt_akun` — layanan ini tak boleh memegang DB lain");
    }
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(opsi)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    info!("Postgres synt_akun tersambung, migrasi terpasang");

    // `synt-akun umumkan "<judul>" "<isi>" [/tautan]` — pesan sistem ke semua pengguna, lalu keluar.
    // Jalankan dari /root/synt-akun (butuh .env): `ops/umumkan.sh "<judul>" "<isi>"`.
    let arg: Vec<String> = std::env::args().skip(1).collect();
    if arg.first().map(String::as_str) == Some("umumkan") {
        let (Some(judul), Some(isi)) = (arg.get(1), arg.get(2)) else {
            anyhow::bail!("pakai: synt-akun umumkan \"<judul>\" \"<isi>\" [/tautan]");
        };
        let n = kotak::umumkan(&pool, judul, isi, arg.get(3).map(String::as_str)).await?;
        println!("pesan sistem terkirim ke {n} pengguna");
        return Ok(());
    }

    // `synt-akun uji-dagang <wallet> <mint> buy|sell <jumlah mentah | habis>` — rakit + simulasi ke mainnet,
    // TANPA menandatangani/mengirim. Wallet bebas (simulasi `sigVerify: false`), mis. wallet publik ber-SOL.
    if arg.first().map(String::as_str) == Some("uji-dagang") {
        let (Some(w), Some(m), Some(sisi), Some(j)) = (arg.get(1), arg.get(2), arg.get(3), arg.get(4)) else {
            anyhow::bail!("pakai: synt-akun uji-dagang <wallet> <mint> buy|sell <jumlah mentah>");
        };
        let d = dagang::Dagang::dari_env()?.ok_or_else(|| anyhow::anyhow!("AKUN_RPC_URL kosong"))?;
        let payer = soltx::kunci(w)?;
        // `sell habis` = jual seluruh saldo satu akun token + tutup akunnya (seperti Max di terminal)
        let (jumlah, tutup) = if sisi == "sell" && j == "habis" {
            let akun = dagang::akun_token(&d, w, m).await?;
            let [a] = akun.as_slice() else { anyhow::bail!("wallet punya {} akun token utk mint ini (butuh tepat 1)", akun.len()) };
            (a.jumlah, Some((a.alamat, a.program)))
        } else {
            (j.parse()?, None)
        };
        match dagang::bangun(&d, &payer, w, m, sisi == "buy", jumlah, 1500, 100_000, tutup).await {
            Ok(b) => println!(
                "LOLOS simulasi · rute {} · keluar {} · min {} · CU {} · tx {} byte · tutup akun {}",
                b.v["routePlan"][0]["swapInfo"]["label"], b.v["outAmount"], b.v["otherAmountThreshold"], b.cu, b.tx.len(), b.menutup
            ),
            Err(api::Galat(k, p)) => println!("DITOLAK {k}: {p}"),
        }
        return Ok(());
    }

    // `synt-akun uji-bnb <wallet 0x> <token> buy <wei> | sell <jumlah mentah | habis>` — deteksi jalur + simulasi
    // `eth_simulateV1` (beli: termasuk uji jual-balik), TANPA mengirim apa pun. Wallet bebas (mis. wallet publik ber-BNB).
    if arg.first().map(String::as_str) == Some("uji-bnb") {
        let (Some(w), Some(t), Some(sisi), Some(j)) = (arg.get(1), arg.get(2), arg.get(3), arg.get(4)) else {
            anyhow::bail!("pakai: synt-akun uji-bnb <wallet> <token> buy|sell <jumlah mentah | habis>");
        };
        let b = bnb::Bnb::baru(String::new())?;
        let (Some(w), Some(t)) = (bnb::alamat(&w.to_ascii_lowercase()), bnb::alamat(&t.to_ascii_lowercase())) else {
            anyhow::bail!("alamat tak sah");
        };
        let jumlah: u128 = if j == "habis" { b.saldo_token(&t, &w).await? } else { j.parse()? };
        if jumlah == 0 {
            println!("SALDO 0 — tak ada yang diuji");
            return Ok(());
        }
        match bnb::kutip(&b, &w, &t, sisi == "buy", jumlah, 1500).await {
            Ok(k) => println!(
                "LOLOS simulasi · jalur {:?} · rute {} · masuk {} · keluar {} · min {} · balik {:?} · gas {} · approve {}",
                k.jalur, k.rute, k.masuk, k.keluar, k.minimal, k.balik, k.gas, k.approval.is_some()
            ),
            Err(api::Galat(k, p)) => println!("DITOLAK {k}: {p}"),
        }
        return Ok(());
    }

    let origins: Vec<String> = std::env::var("AKUN_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if origins.is_empty() {
        warn!("⚠️ AKUN_ORIGINS kosong — semua login & perubahan profil akan DITOLAK (403)");
    } else {
        info!(?origins, "origin yang diizinkan");
    }

    let cloudflare = std::env::var("AKUN_CLOUDFLARE").is_ok_and(|v| v == "1");
    info!(cloudflare, "sumber IP klien: {}", if cloudflare { "CF-Connecting-IP" } else { "X-Forwarded-For dari Caddy" });

    tokio::spawn(api::jaga_kebersihan(pool.clone()));
    let dash = std::env::var("AKUN_DASH_URL").unwrap_or_else(|_| "http://127.0.0.1:5679".into());
    tokio::spawn(pemantau::jalan(pool.clone(), dash.trim_end_matches('/').to_string()));

    let dagang = dagang::Dagang::dari_env()?;
    match &dagang {
        Some(d) => {
            tokio::spawn(dagang::lanjutkan(pool.clone(), d.clone()));
        }
        None => warn!("⚠️ AKUN_RPC_URL kosong — trading MATI (503)"),
    }
    let bnb = match bnb::Bnb::baru(dash.trim_end_matches('/').to_string()) {
        Ok(b) => {
            tokio::spawn(bnb::lanjutkan(pool.clone(), b.clone()));
            info!("trading BNB aktif");
            Some(b)
        }
        Err(e) => {
            warn!("⚠️ trading BNB MATI: {e}");
            None
        }
    };

    let menit = Duration::from_secs(60);
    let state = api::AppState {
        pool,
        origins: Arc::new(origins),
        cloudflare,
        rem_nonce: Arc::new(batas::Rem::baru(10, menit)),
        rem_nonce_global: Arc::new(batas::Rem::baru(300, menit)),
        rem_masuk: Arc::new(batas::Rem::baru(10, menit)),
        rem_ubah: Arc::new(batas::Rem::baru(20, menit)),
        rem_simpan: Arc::new(batas::Rem::baru(120, menit)),
        rem_dagang: Arc::new(batas::Rem::baru(60, menit)),
        rem_baca_dagang: Arc::new(batas::Rem::baru(120, menit)),
        dagang,
        bnb,
    };

    let app = Router::new()
        .route("/api/akun/sehat", get(api::sehat))
        .route("/api/akun/nonce", post(api::nonce))
        .route("/api/akun/masuk", post(api::masuk))
        .route("/api/akun/keluar", post(api::keluar))
        .route("/api/akun/saya", get(api::saya).patch(api::ubah_saya).delete(api::hapus_saya))
        .route("/api/akun/profil/:handle", get(api::profil_publik))
        .route("/api/akun/pantauan", get(sinkron::pantauan))
        .route("/api/akun/pantauan/gabung", post(sinkron::gabung))
        .route("/api/akun/pantauan/:token", put(sinkron::pantau).delete(sinkron::lepas))
        .route("/api/akun/preferensi", get(sinkron::preferensi).put(sinkron::simpan_preferensi))
        .route("/api/akun/kotak", get(kotak::kotak))
        .route("/api/akun/kotak/baca", post(kotak::baca))
        .route("/api/akun/ikuti/:handle", put(kotak::ikuti).delete(kotak::berhenti_ikuti))
        // trading terminal (2 Nov): transaksi TAK bertanda disusun di sini, ditandatangani wallet pengguna
        .route("/api/akun/dagang/siapkan", post(dagang::siapkan))
        .route("/api/akun/dagang/kirim", post(dagang::kirim))
        .route("/api/akun/dagang/lacak", post(dagang::lacak))
        .route("/api/akun/dagang/saldo", get(dagang::saldo))
        .route("/api/akun/dagang/riwayat", get(dagang::riwayat))
        .route("/api/akun/dagang/posisi", get(dagang::posisi))
        .route("/api/akun/dagang/bnb/siapkan", post(bnb::siapkan))
        .route("/api/akun/dagang/bnb/lacak", post(bnb::lacak))
        .route("/api/akun/dagang/bnb/saldo", get(bnb::saldo))
        .route("/api/akun/dagang/bnb/posisi", get(bnb::posisi))
        .route("/api/akun/dagang/:id", get(dagang::status))
        // badan terbesar yang sah = gabung watchlist 200 token × ±50 byte
        .layer(DefaultBodyLimit::max(16 * 1024))
        .with_state(state);

    let bind = std::env::var("AKUN_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let port = std::env::var("AKUN_PORT").unwrap_or_else(|_| "5681".into());
    let addr = format!("{bind}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!(addr, "synt-akun siap");
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        // systemd menghentikan dgn SIGTERM, bukan Ctrl-C — tanpa ini jalur tutup-rapi tak pernah jalan
        .with_graceful_shutdown(async {
            let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("SIGTERM");
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = term.recv() => {}
            }
        })
        .await?;
    Ok(())
}
