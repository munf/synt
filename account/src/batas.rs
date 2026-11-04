//! Rem laju per IP, di memori.
//!
//! Cukup untuk satu proses di satu VPS. Tujuannya membatasi penyalahgunaan
//! murahan (membanjiri nonce, menebak tanda tangan), bukan menahan serangan
//! terdistribusi — itu tugas Cloudflare di depan.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv6Addr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Batas isi peta. Lewat dari ini dan semua entri masih di dalam jendela →
/// permintaan BARU ditolak (gagal-tertutup), bukan peta yang tumbuh tanpa batas.
const MAKS_ENTRI: usize = 20_000;

pub struct Rem {
    maks: u32,
    jendela: Duration,
    peta: Mutex<HashMap<IpAddr, (Instant, u32)>>,
}

/// IPv6 dihitung per /64: satu pelanggan biasa memegang satu /64 utuh, jadi
/// menghitung per alamat berarti 2^64 jatah gratis lewat rotasi alamat.
fn kunci(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => {
            let s = v6.segments();
            IpAddr::V6(Ipv6Addr::new(s[0], s[1], s[2], s[3], 0, 0, 0, 0))
        }
        v4 => v4,
    }
}

impl Rem {
    pub fn baru(maks: u32, jendela: Duration) -> Self {
        Self { maks, jendela, peta: Mutex::new(HashMap::new()) }
    }

    /// true = boleh lewat.
    pub fn izinkan(&self, ip: IpAddr) -> bool {
        let ip = kunci(ip);
        let kini = Instant::now();
        let mut peta = self.peta.lock().unwrap_or_else(|e| e.into_inner());
        if peta.len() >= MAKS_ENTRI && !peta.contains_key(&ip) {
            peta.retain(|_, (mulai, _)| kini.duration_since(*mulai) < self.jendela);
            if peta.len() >= MAKS_ENTRI {
                return false;
            }
        }
        let e = peta.entry(ip).or_insert((kini, 0));
        if kini.duration_since(e.0) >= self.jendela {
            *e = (kini, 0);
        }
        e.1 += 1;
        e.1 <= self.maks
    }

    /// Satu ember untuk SELURUH layanan (rem per-IP bisa diakali rotasi alamat).
    pub fn izinkan_global(&self) -> bool {
        self.izinkan(IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED))
    }
}

#[cfg(test)]
mod uji {
    use super::*;

    #[test]
    fn melewati_batas_ditolak() {
        let r = Rem::baru(3, Duration::from_secs(60));
        let ip: IpAddr = "203.0.113.7".parse().unwrap();
        assert!(r.izinkan(ip) && r.izinkan(ip) && r.izinkan(ip));
        assert!(!r.izinkan(ip));
        // IP lain punya jatah sendiri
        assert!(r.izinkan("203.0.113.8".parse().unwrap()));
    }

    #[test]
    fn ipv6_satu_ember_per_64() {
        let r = Rem::baru(2, Duration::from_secs(60));
        assert!(r.izinkan("2001:db8:1:2::1".parse().unwrap()));
        assert!(r.izinkan("2001:db8:1:2:ffff::9".parse().unwrap()));
        assert!(!r.izinkan("2001:db8:1:2:abcd::5".parse().unwrap()));
        assert!(r.izinkan("2001:db8:1:3::1".parse().unwrap()));
    }
}
