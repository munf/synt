//! Sign-In With Solana — susun pesan & verifikasi tanda tangan.
//!
//! Bentuk pesan mengikuti spesifikasi SIWS (padanan EIP-4361 untuk Solana) yang
//! dipakai Phantom/Solflare/Backpack, supaya wallet menampilkannya sebagai
//! permintaan login, bukan teks acak.
//!
//! ⚠️ Yang ditandatangani adalah PESAN TEKS, bukan transaksi. Tak ada dana yang
//! bisa berpindah lewat jalur ini, dan layanan ini tak pernah melihat kunci privat.

use chrono::{DateTime, SecondsFormat, Utc};
use ed25519_dalek::{Signature, VerifyingKey};

pub const PERNYATAAN: &str =
    "Sign in to synt. This request will not trigger a blockchain transaction or cost any fees.";

/// Alamat wallet → kunci publik. Gagal bila bukan base58 32 byte atau bukan
/// titik ed25519 yang sah (mis. PDA, yang memang tak bisa menandatangani).
pub fn kunci_publik(alamat: &str) -> Option<VerifyingKey> {
    if alamat.len() < 32 || alamat.len() > 44 {
        return None;
    }
    let byte = bs58::decode(alamat).into_vec().ok()?;
    let arr: [u8; 32] = byte.try_into().ok()?;
    VerifyingKey::from_bytes(&arr).ok()
}

pub struct Permintaan<'a> {
    pub domain: &'a str,
    pub uri: &'a str,
    pub alamat: &'a str,
    pub nonce: &'a str,
    pub terbit: DateTime<Utc>,
    pub kedaluwarsa: DateTime<Utc>,
}

pub fn susun_pesan(p: &Permintaan) -> String {
    let t = |d: DateTime<Utc>| d.to_rfc3339_opts(SecondsFormat::Millis, true);
    format!(
        "{domain} wants you to sign in with your Solana account:\n{alamat}\n\n{pernyataan}\n\n\
         URI: {uri}\nVersion: 1\nChain ID: mainnet\nNonce: {nonce}\nIssued At: {terbit}\n\
         Expiration Time: {kedaluwarsa}",
        domain = p.domain,
        alamat = p.alamat,
        pernyataan = PERNYATAAN,
        uri = p.uri,
        nonce = p.nonce,
        terbit = t(p.terbit),
        kedaluwarsa = t(p.kedaluwarsa),
    )
}

/// Tanda tangan base58 (64 byte) atas `pesan` oleh `alamat`.
/// `verify_strict` menolak tanda tangan yang lentur (malleable) & kunci lemah.
pub fn verifikasi(alamat: &str, pesan: &str, ttd_base58: &str) -> bool {
    let Some(kunci) = kunci_publik(alamat) else { return false };
    let Ok(byte) = bs58::decode(ttd_base58).into_vec() else { return false };
    let Ok(arr) = <[u8; 64]>::try_from(byte.as_slice()) else { return false };
    kunci.verify_strict(pesan.as_bytes(), &Signature::from_bytes(&arr)).is_ok()
}

#[cfg(test)]
mod uji {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn kunci() -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let alamat = bs58::encode(sk.verifying_key().as_bytes()).into_string();
        (sk, alamat)
    }

    fn pesan(alamat: &str) -> String {
        let t = DateTime::parse_from_rfc3339("2026-11-01T12:00:00Z").unwrap().with_timezone(&Utc);
        susun_pesan(&Permintaan {
            domain: "lab.synt.fun",
            uri: "https://lab.synt.fun",
            alamat,
            nonce: "a1b2c3d4e5f60718",
            terbit: t,
            kedaluwarsa: t + chrono::Duration::minutes(10),
        })
    }

    #[test]
    fn bentuk_pesan_siws() {
        let (_, a) = kunci();
        let p = pesan(&a);
        assert!(p.starts_with(&format!("lab.synt.fun wants you to sign in with your Solana account:\n{a}\n\n")));
        assert!(p.contains("\nNonce: a1b2c3d4e5f60718\n"));
        assert!(p.ends_with("Expiration Time: 2026-11-01T12:10:00.000Z"));
    }

    #[test]
    fn tanda_tangan_sah_diterima() {
        let (sk, a) = kunci();
        let p = pesan(&a);
        let ttd = bs58::encode(sk.sign(p.as_bytes()).to_bytes()).into_string();
        assert!(verifikasi(&a, &p, &ttd));
    }

    #[test]
    fn pesan_diubah_ditolak() {
        let (sk, a) = kunci();
        let p = pesan(&a);
        let ttd = bs58::encode(sk.sign(p.as_bytes()).to_bytes()).into_string();
        assert!(!verifikasi(&a, &p.replace("lab.synt.fun", "evil.example"), &ttd));
    }

    #[test]
    fn wallet_lain_ditolak() {
        let (sk, _) = kunci();
        let lain = bs58::encode(SigningKey::from_bytes(&[9u8; 32]).verifying_key().as_bytes()).into_string();
        let p = pesan(&lain);
        let ttd = bs58::encode(sk.sign(p.as_bytes()).to_bytes()).into_string();
        assert!(!verifikasi(&lain, &p, &ttd));
    }

    #[test]
    fn alamat_rusak_ditolak() {
        assert!(kunci_publik("bukan-base58-0OIl").is_none());
        assert!(kunci_publik("11111111").is_none());
        assert!(!verifikasi("abc", "x", "y"));
    }
}
