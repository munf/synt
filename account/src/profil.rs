//! Aturan isi profil: handle, nama tampilan, bio.
//!
//! Ditegakkan dua kali — di sini (pesan galat yang bisa dibaca pengguna) dan
//! di CHECK constraint DB (pengaman terakhir bila jalur lain menulis).

/// Handle yang tak boleh diambil siapa pun: menyamar sebagai synt / staf, atau
/// bertabrakan dgn rute terminal (`/profile/settings` dsb.).
const DICADANGKAN: &[&str] = &[
    "synt", "synt_ai", "syntai", "synt_agent", "syntagent", "synt_call", "syntcall", "synt_official",
    "admin", "administrator", "root", "system", "sistem", "support", "help", "official", "team",
    "staff", "mod", "moderator", "security", "api", "null", "undefined", "anonymous", "me",
    "settings", "profile", "wallet", "login", "logout", "signin", "signup", "inbox",
    "anthropic", "claude", "solana", "phantom", "pumpfun", "pump_fun",
];

pub fn periksa_handle(h: &str) -> Result<String, &'static str> {
    let h = h.trim().trim_start_matches('@').to_ascii_lowercase();
    if h.len() < 3 || h.len() > 20 {
        return Err("Handle must be 3 to 20 characters.");
    }
    if !h.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_') {
        return Err("Handle can only use letters, numbers and underscores.");
    }
    // seluruh awalan `synt` milik merek: `syntofficial`, `synt_team`, `synt1` sama menyesatkannya
    if DICADANGKAN.contains(&h.as_str()) || h.starts_with("synt") {
        return Err("This handle is reserved.");
    }
    Ok(h)
}

/// Karakter FORMAT Unicode (kategori Cf) yang dipakai menyamar: pembalik arah teks
/// (U+202E membuat "lanoiciffo" tampil "official"), isolasi bidi, dan karakter
/// tak-terlihat. `char::is_control` hanya menangkap kategori Cc, tidak yang ini.
fn format_tersembunyi(c: char) -> bool {
    matches!(c as u32,
        0x00AD | 0x061C | 0x180E | 0x200B..=0x200F | 0x202A..=0x202E | 0x2060..=0x2064
        | 0x2066..=0x2069 | 0xFEFF | 0xFFF9..=0xFFFB)
}

/// Rapikan teks bebas: buang karakter kontrol (kecuali baris baru di bio) dan
/// karakter format tersembunyi, rapatkan spasi di tepi. String kosong → None.
pub fn rapikan(s: &str, boleh_baris_baru: bool, maks: usize) -> Result<Option<String>, ()> {
    let bersih: String = s
        .chars()
        .filter(|c| !format_tersembunyi(*c))
        .filter(|c| !c.is_control() || (boleh_baris_baru && *c == '\n'))
        .collect();
    let bersih = bersih.trim().to_string();
    if bersih.chars().count() > maks {
        return Err(());
    }
    Ok((!bersih.is_empty()).then_some(bersih))
}

/// Nama tampilan: dirapikan, maks 40, dan tak boleh menyamar sebagai synt / staf /
/// wallet. Dibandingkan setelah huruf kecil & hanya huruf-angka, jadi "S y n t",
/// "synt.official" dan "SYNT Official" tertangkap sama.
pub fn periksa_nama(s: &str) -> Result<Option<String>, &'static str> {
    let nama = rapikan(s, false, 40).map_err(|_| "Display name can be at most 40 characters.")?;
    if let Some(n) = &nama {
        let inti: String = n.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect();
        // dua pola: nama cadangan persis ("synt", "Phantom", "Admin") · menyebut synt BERSAMA
        // kata jabatan ("official synt", "the synt team"). Sengaja tak melarang awalan "synt"
        // seperti handle: "Syntax trader" nama wajar, dan @handle selalu tampil di sebelahnya.
        let jabatan = ["official", "team", "support", "admin", "staff", "moderator", "agent"];
        let menyamar = DICADANGKAN.iter().any(|d| inti == d.replace('_', ""))
            || (inti.contains("synt") && jabatan.iter().any(|j| inti.contains(j)));
        if menyamar {
            return Err("This display name is reserved.");
        }
    }
    Ok(nama)
}

/// `7xKXtg2C…sgAsU` — bentuk pendek untuk tampilan.
pub fn pendekkan(wallet: &str) -> String {
    if wallet.len() <= 10 {
        return wallet.to_string();
    }
    // 0x + 4 hex agar bagian depan alamat EVM tetap bermakna, bukan hanya "0xAb"
    let depan = if wallet.starts_with("0x") { 6 } else { 4 };
    format!("{}…{}", &wallet[..depan], &wallet[wallet.len() - 4..])
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn handle_dinormalisasi() {
        assert_eq!(periksa_handle(" @Trader_01 ").unwrap(), "trader_01");
    }

    #[test]
    fn handle_ditolak() {
        assert!(periksa_handle("ab").is_err());
        assert!(periksa_handle("a".repeat(21).as_str()).is_err());
        assert!(periksa_handle("nama-pakai-strip").is_err());
        assert!(periksa_handle("Admin").is_err());
        assert!(periksa_handle("synt_support").is_err());
        assert!(periksa_handle("héllo").is_err());
    }

    #[test]
    fn teks_dirapikan() {
        assert_eq!(rapikan("  hai\u{0007} ", false, 40).unwrap().as_deref(), Some("hai"));
        assert_eq!(rapikan("a\nb", false, 40).unwrap().as_deref(), Some("ab"));
        assert_eq!(rapikan("a\nb", true, 40).unwrap().as_deref(), Some("a\nb"));
        assert_eq!(rapikan("   ", false, 40).unwrap(), None);
        assert!(rapikan(&"x".repeat(41), false, 40).is_err());
    }

    #[test]
    fn format_tersembunyi_dibuang() {
        assert_eq!(rapikan("a\u{202E}b\u{200B}c\u{FEFF}", false, 40).unwrap().as_deref(), Some("abc"));
    }

    #[test]
    fn nama_menyamar_ditolak() {
        assert!(periksa_nama("synt").is_err());
        assert!(periksa_nama("SYNT Official").is_err());
        assert!(periksa_nama("s y n t").is_err());
        assert!(periksa_nama("Phantom").is_err());
        assert!(periksa_nama("Admin").is_err());
        assert!(periksa_nama("the synt team").is_err());
        assert_eq!(periksa_nama("Syntax trader").unwrap().as_deref(), Some("Syntax trader"));
        assert_eq!(periksa_nama("Yeremias NJ").unwrap().as_deref(), Some("Yeremias NJ"));
        assert_eq!(periksa_nama("").unwrap(), None);
        assert!(periksa_handle("syntofficial").is_err());
    }

    #[test]
    fn wallet_dipendekkan() {
        assert_eq!(pendekkan("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"), "7xKX…gAsU");
    }
}
