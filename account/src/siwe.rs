//! Sign-In With Ethereum (EIP-4361) — login wallet EVM, mis. akun 0x MetaMask (1 Nov).
//!
//! Satu alamat 0x = satu akun, TERPISAH dari akun alamat Solana orang yang sama (keputusan pemilik
//! 1 Nov: tanpa penautan). Alamat disimpan dalam bentuk checksum EIP-55 — bentuk kanonik, jadi
//! huruf besar/kecil yang dikirim klien tak pernah melahirkan akun kedua.
//!
//! Chain ID 56 (BNB Chain): menyebut jaringan synt; tanda tangan `personal_sign` sendiri sah di semua
//! chain EVM. ⚠️ Yang ditandatangani PESAN TEKS, bukan transaksi — sama seperti SIWS.

use chrono::{DateTime, SecondsFormat, Utc};
use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use sha3::{Digest, Keccak256};

pub use crate::siws::{Permintaan, PERNYATAAN};

const CHAIN_ID: u32 = 56;

fn keccak(data: &[u8]) -> [u8; 32] {
    Keccak256::digest(data).into()
}

/// `0x` + 40 hex → bentuk checksum EIP-55. Huruf campuran yang checksum-nya SALAH ditolak
/// (EIP-55 ada justru untuk menangkap salah ketik); semua kecil/semua besar diterima.
pub fn alamat(s: &str) -> Option<String> {
    let hex = s.trim().strip_prefix("0x")?;
    if hex.len() != 40 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let kanonik = checksum(&hex.to_ascii_lowercase());
    let campur = hex.bytes().any(|b| b.is_ascii_lowercase()) && hex.bytes().any(|b| b.is_ascii_uppercase());
    (!campur || kanonik[2..] == *hex).then_some(kanonik)
}

fn checksum(kecil: &str) -> String {
    let h = keccak(kecil.as_bytes());
    let mut s = String::from("0x");
    for (i, c) in kecil.chars().enumerate() {
        let nibble = (h[i / 2] >> if i % 2 == 0 { 4 } else { 0 }) & 0xf;
        s.push(if c.is_ascii_alphabetic() && nibble >= 8 { c.to_ascii_uppercase() } else { c });
    }
    s
}

pub fn susun_pesan(p: &Permintaan) -> String {
    let t = |d: DateTime<Utc>| d.to_rfc3339_opts(SecondsFormat::Millis, true);
    format!(
        "{domain} wants you to sign in with your Ethereum account:\n{alamat}\n\n{pernyataan}\n\n\
         URI: {uri}\nVersion: 1\nChain ID: {CHAIN_ID}\nNonce: {nonce}\nIssued At: {terbit}\n\
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

/// Tanda tangan `personal_sign` (0x + 65 byte hex: r‖s‖v) atas `pesan` oleh `alamat` (checksum).
/// Kontrak pintar (EIP-1271) tak didukung: hanya akun biasa yang punya kunci.
pub fn verifikasi(alamat: &str, pesan: &str, ttd_hex: &str) -> bool {
    let Some(hex) = ttd_hex.trim().strip_prefix("0x") else { return false };
    if hex.len() != 130 {
        return false;
    }
    let Ok(byte) = (0..65).map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16)).collect::<Result<Vec<u8>, _>>() else {
        return false;
    };
    let v = match byte[64] {
        27 | 28 => byte[64] - 27,
        0 | 1 => byte[64],
        _ => return false,
    };
    let Ok(mut sig) = Signature::from_slice(&byte[..64]) else { return false };
    let Some(mut rid) = RecoveryId::from_byte(v) else { return false };
    // s tinggi → normalkan & balik paritas; k256 hanya memulihkan bentuk s rendah
    if let Some(n) = sig.normalize_s() {
        sig = n;
        rid = RecoveryId::new(!rid.is_y_odd(), rid.is_x_reduced());
    }
    let awalan = format!("\x19Ethereum Signed Message:\n{}", pesan.len());
    let hash = keccak(&[awalan.as_bytes(), pesan.as_bytes()].concat());
    let Ok(kunci) = VerifyingKey::recover_from_prehash(&hash, &sig, rid) else { return false };
    let titik = kunci.to_encoded_point(false);
    let h = keccak(&titik.as_bytes()[1..]);
    let pulih: String = h[12..].iter().map(|b| format!("{b:02x}")).collect();
    checksum(&pulih) == alamat
}

#[cfg(test)]
mod uji {
    use super::*;
    use k256::ecdsa::SigningKey;

    fn kunci(n: u8) -> (SigningKey, String) {
        let sk = SigningKey::from_bytes(&[n; 32].into()).unwrap();
        let titik = sk.verifying_key().to_encoded_point(false);
        let h = keccak(&titik.as_bytes()[1..]);
        let a: String = h[12..].iter().map(|b| format!("{b:02x}")).collect();
        (sk, checksum(&a))
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

    fn tandatangani(sk: &SigningKey, p: &str, v_tambah: u8) -> String {
        let awalan = format!("\x19Ethereum Signed Message:\n{}", p.len());
        let hash = keccak(&[awalan.as_bytes(), p.as_bytes()].concat());
        let (sig, rid) = sk.sign_prehash_recoverable(&hash).unwrap();
        let mut b = sig.to_bytes().to_vec();
        b.push(rid.to_byte() + v_tambah);
        format!("0x{}", b.iter().map(|x| format!("{x:02x}")).collect::<String>())
    }

    #[test]
    fn checksum_eip55() {
        // vektor uji resmi EIP-55
        for a in ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359", "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB"] {
            assert_eq!(alamat(&a.to_ascii_lowercase()).as_deref(), Some(a));
            assert_eq!(alamat(a).as_deref(), Some(a));
        }
        assert!(alamat("0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed").is_none(), "checksum salah ditolak");
        assert!(alamat("0x123").is_none());
        assert!(alamat("5aaeb6053f3e94c9b9a09f33669435e7ef1beaed").is_none());
    }

    #[test]
    fn bentuk_pesan_siwe() {
        let (_, a) = kunci(7);
        let p = pesan(&a);
        assert!(p.starts_with(&format!("lab.synt.fun wants you to sign in with your Ethereum account:\n{a}\n\n")));
        assert!(p.contains("\nChain ID: 56\nNonce: a1b2c3d4e5f60718\n"));
    }

    #[test]
    fn tanda_tangan_sah_diterima_v27_dan_v0() {
        let (sk, a) = kunci(7);
        let p = pesan(&a);
        assert!(verifikasi(&a, &p, &tandatangani(&sk, &p, 27)));
        assert!(verifikasi(&a, &p, &tandatangani(&sk, &p, 0)));
    }

    #[test]
    fn pesan_diubah_atau_wallet_lain_ditolak() {
        let (sk, a) = kunci(7);
        let (_, lain) = kunci(9);
        let p = pesan(&a);
        let ttd = tandatangani(&sk, &p, 27);
        assert!(!verifikasi(&a, &p.replace("lab.synt.fun", "evil.example"), &ttd));
        assert!(!verifikasi(&lain, &p, &ttd));
        assert!(!verifikasi(&a, &p, "0x00"));
        assert!(!verifikasi(&a, &p, &ttd.replace("0x", "")));
    }
}
