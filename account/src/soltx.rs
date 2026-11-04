//! Penyusun transaksi Solana **v0** — tanpa solana-sdk (2 Nov, trading terminal lab).
//!
//! Kenapa ditulis tangan: solana-sdk menarik ratusan crate + provider kripto sendiri
//! (jebakan #43), padahal yang dibutuhkan hanya SATU hal — menyusun byte pesan dari
//! instruksi Jupiter `/build`. Formatnya kecil dan stabil:
//!
//! ```text
//! transaksi = shortvec(tanda tangan 64 B) ‖ pesan
//! pesan v0  = 0x80 ‖ header[3] ‖ shortvec(kunci statis 32 B) ‖ blockhash 32 B
//!             ‖ shortvec(instruksi) ‖ shortvec(lookup ALT)
//! instruksi = indeks program u8 ‖ shortvec(indeks akun u8) ‖ shortvec(data)
//! lookup    = kunci tabel 32 B ‖ shortvec(indeks writable) ‖ shortvec(indeks readonly)
//! ```
//!
//! ⚠️ Layanan ini TAK PERNAH menandatangani. Slot tanda tangan diisi nol; wallet pengguna
//! yang mengisinya. Kebenaran susunan diuji lewat `simulateTransaction` ke mainnet
//! (`sigVerify: false`) — validator menolak pesan yang cacat sebelum menjalankan apa pun.

use anyhow::{anyhow, bail, Result};

pub type Kunci = [u8; 32];

pub fn kunci(s: &str) -> Result<Kunci> {
    let b = bs58::decode(s).into_vec().map_err(|_| anyhow!("kunci bukan base58: {s}"))?;
    b.try_into().map_err(|_| anyhow!("kunci bukan 32 byte: {s}"))
}

pub fn teks(k: &Kunci) -> String {
    bs58::encode(k).into_string()
}

#[derive(Clone, Debug)]
pub struct Meta {
    pub kunci: Kunci,
    pub penanda: bool,
    pub tulis: bool,
}

#[derive(Clone, Debug)]
pub struct Instruksi {
    pub program: Kunci,
    pub akun: Vec<Meta>,
    pub data: Vec<u8>,
}

pub const COMPUTE_BUDGET: &str = "ComputeBudget111111111111111111111111111111";

/// `SetComputeUnitLimit` (diskriminator 2, u32 LE)
pub fn batas_cu(unit: u32) -> Instruksi {
    let mut data = vec![2u8];
    data.extend_from_slice(&unit.to_le_bytes());
    Instruksi { program: kunci(COMPUTE_BUDGET).expect("konstanta"), akun: vec![], data }
}

/// SPL Token `CloseAccount` (diskriminator 9; sama di Token & Token-2022): akun token bersaldo 0 ditutup,
/// sewanya (~0,002 SOL) kembali ke `pemilik`. Gagal bila saldo ≠ 0 → seluruh transaksi batal (tak ada yang hilang).
pub fn tutup_akun_token(program: Kunci, akun: Kunci, pemilik: Kunci) -> Instruksi {
    Instruksi {
        program,
        akun: vec![
            Meta { kunci: akun, penanda: false, tulis: true },
            Meta { kunci: pemilik, penanda: false, tulis: true },
            Meta { kunci: pemilik, penanda: true, tulis: false },
        ],
        data: vec![9],
    }
}

/// `SetComputeUnitPrice` (diskriminator 3, u64 LE, micro-lamport per CU)
pub fn harga_cu(mikro_lamport: u64) -> Instruksi {
    let mut data = vec![3u8];
    data.extend_from_slice(&mikro_lamport.to_le_bytes());
    Instruksi { program: kunci(COMPUTE_BUDGET).expect("konstanta"), akun: vec![], data }
}

fn shortvec(n: usize, out: &mut Vec<u8>) {
    let mut v = n as u32;
    loop {
        let mut b = (v & 0x7f) as u8;
        v >>= 7;
        if v == 0 {
            out.push(b);
            return;
        }
        b |= 0x80;
        out.push(b);
    }
}

fn baca_shortvec(b: &[u8], i: &mut usize) -> Result<usize> {
    let mut n: usize = 0;
    for geser in 0..3 {
        let x = *b.get(*i).ok_or_else(|| anyhow!("shortvec terpotong"))?;
        *i += 1;
        n |= ((x & 0x7f) as usize) << (7 * geser);
        if x & 0x80 == 0 {
            return Ok(n);
        }
    }
    bail!("shortvec terlalu panjang")
}

/// Susun pesan v0. `alt` = tabel lookup (alamat tabel, isi tabel PERSIS urut on-chain —
/// indeks yang ditulis menunjuk posisi di sana).
///
/// Aturan (sama dgn `v0::Message::try_compile` di solana-sdk):
/// - payer selalu kunci statis pertama (penanda + writable);
/// - program yang DIPANGGIL wajib statis (runtime tak memuat program dari ALT);
/// - penanda wajib statis; akun lain diambil dari tabel pertama yang memuatnya;
/// - urutan statis: penanda-writable, penanda-readonly, writable, readonly;
/// - indeks akun: statis, lalu SEMUA writable dari ALT (urut tabel), lalu SEMUA readonly.
pub fn susun_v0(payer: &Kunci, ixs: &[Instruksi], blockhash: &Kunci, alt: &[(Kunci, Vec<Kunci>)]) -> Result<Vec<u8>> {
    // (kunci, penanda, tulis, dipanggil) — urut kemunculan
    let mut meta: Vec<(Kunci, bool, bool, bool)> = vec![(*payer, true, true, false)];
    let mut tandai = |k: &Kunci, penanda: bool, tulis: bool, dipanggil: bool| {
        if let Some(m) = meta.iter_mut().find(|m| &m.0 == k) {
            m.1 |= penanda;
            m.2 |= tulis;
            m.3 |= dipanggil;
        } else {
            meta.push((*k, penanda, tulis, dipanggil));
        }
    };
    for ix in ixs {
        for a in &ix.akun {
            tandai(&a.kunci, a.penanda, a.tulis, false);
        }
        tandai(&ix.program, false, false, true);
    }

    // akun yang boleh dimuat dari ALT
    let mut lookups: Vec<(Kunci, Vec<u8>, Vec<u8>)> = Vec::new();
    let mut dari_alt: Vec<(Kunci, bool)> = Vec::new(); // (kunci, tulis)
    let mut termuat = vec![false; meta.len()];
    for (alamat, isi) in alt {
        let (mut w, mut r) = (Vec::new(), Vec::new());
        let (mut kw, mut kr) = (Vec::new(), Vec::new());
        for (j, m) in meta.iter().enumerate() {
            if termuat[j] || m.1 || m.3 || &m.0 == payer {
                continue;
            }
            if let Some(pos) = isi.iter().position(|x| x == &m.0) {
                if pos > u8::MAX as usize {
                    continue;
                }
                termuat[j] = true;
                if m.2 {
                    w.push(pos as u8);
                    kw.push(m.0);
                } else {
                    r.push(pos as u8);
                    kr.push(m.0);
                }
            }
        }
        if !w.is_empty() || !r.is_empty() {
            dari_alt.extend(kw.into_iter().map(|k| (k, true)));
            dari_alt.extend(kr.into_iter().map(|k| (k, false)));
            lookups.push((*alamat, w, r));
        }
    }

    let statis: Vec<&(Kunci, bool, bool, bool)> = meta.iter().enumerate().filter(|(j, _)| !termuat[*j]).map(|(_, m)| m).collect();
    let kelompok = |p: bool, t: bool| statis.iter().filter(move |m| m.1 == p && m.2 == t).map(|m| m.0);
    let mut kunci_statis: Vec<Kunci> = Vec::new();
    kunci_statis.extend(kelompok(true, true));
    kunci_statis.extend(kelompok(true, false));
    kunci_statis.extend(kelompok(false, true));
    kunci_statis.extend(kelompok(false, false));
    if kunci_statis.first() != Some(payer) {
        bail!("payer harus kunci pertama");
    }
    let n_penanda = statis.iter().filter(|m| m.1).count();
    let n_penanda_ro = statis.iter().filter(|m| m.1 && !m.2).count();
    let n_ro = statis.iter().filter(|m| !m.1 && !m.2).count();

    // indeks global: statis, lalu writable ALT (urut lookup), lalu readonly ALT
    let mut urutan: Vec<Kunci> = kunci_statis.clone();
    let tulis_alt: Vec<Kunci> = {
        let mut v = Vec::new();
        for (alamat, w, _) in &lookups {
            let isi = &alt.iter().find(|t| &t.0 == alamat).expect("tabel ada").1;
            v.extend(w.iter().map(|&i| isi[i as usize]));
        }
        v
    };
    let baca_alt: Vec<Kunci> = {
        let mut v = Vec::new();
        for (alamat, _, r) in &lookups {
            let isi = &alt.iter().find(|t| &t.0 == alamat).expect("tabel ada").1;
            v.extend(r.iter().map(|&i| isi[i as usize]));
        }
        v
    };
    debug_assert_eq!(tulis_alt.len() + baca_alt.len(), dari_alt.len());
    urutan.extend(tulis_alt);
    urutan.extend(baca_alt);
    if urutan.len() > 256 {
        bail!("terlalu banyak akun: {}", urutan.len());
    }
    let indeks = |k: &Kunci| -> Result<u8> {
        urutan.iter().position(|x| x == k).map(|p| p as u8).ok_or_else(|| anyhow!("akun hilang dari pesan"))
    };

    let mut out = vec![0x80u8, n_penanda as u8, n_penanda_ro as u8, n_ro as u8];
    shortvec(kunci_statis.len(), &mut out);
    for k in &kunci_statis {
        out.extend_from_slice(k);
    }
    out.extend_from_slice(blockhash);
    shortvec(ixs.len(), &mut out);
    for ix in ixs {
        out.push(indeks(&ix.program)?);
        shortvec(ix.akun.len(), &mut out);
        for a in &ix.akun {
            out.push(indeks(&a.kunci)?);
        }
        shortvec(ix.data.len(), &mut out);
        out.extend_from_slice(&ix.data);
    }
    shortvec(lookups.len(), &mut out);
    for (alamat, w, r) in &lookups {
        out.extend_from_slice(alamat);
        shortvec(w.len(), &mut out);
        out.extend_from_slice(w);
        shortvec(r.len(), &mut out);
        out.extend_from_slice(r);
    }
    Ok(out)
}

/// Bungkus pesan jadi transaksi tak bertanda (slot tanda tangan nol).
pub fn transaksi_kosong(pesan: &[u8]) -> Vec<u8> {
    let n = pesan.get(1).copied().unwrap_or(1) as usize;
    let mut out = Vec::with_capacity(1 + 64 * n + pesan.len());
    shortvec(n, &mut out);
    out.extend(std::iter::repeat(0u8).take(64 * n));
    out.extend_from_slice(pesan);
    out
}

/// Pecah transaksi bertanda → (tanda tangan, byte pesan). Untuk memeriksa kiriman wallet.
pub fn pecah(tx: &[u8]) -> Result<(Vec<[u8; 64]>, &[u8])> {
    let mut i = 0;
    let n = baca_shortvec(tx, &mut i)?;
    if n == 0 || n > 8 {
        bail!("jumlah tanda tangan tak wajar: {n}");
    }
    let mut ttd = Vec::with_capacity(n);
    for _ in 0..n {
        let s: [u8; 64] = tx.get(i..i + 64).ok_or_else(|| anyhow!("tanda tangan terpotong"))?.try_into()?;
        ttd.push(s);
        i += 64;
    }
    Ok((ttd, &tx[i..]))
}

/// Payer (kunci statis pertama) dari byte pesan, legacy maupun v0.
pub fn payer_pesan(pesan: &[u8]) -> Result<Kunci> {
    let mut i = if pesan.first().is_some_and(|b| b & 0x80 != 0) { 1 } else { 0 };
    i += 3;
    let n = baca_shortvec(pesan, &mut i)?;
    if n == 0 {
        bail!("pesan tanpa akun");
    }
    Ok(pesan.get(i..i + 32).ok_or_else(|| anyhow!("pesan terpotong"))?.try_into()?)
}

#[cfg(test)]
mod uji {
    use super::*;

    fn k(n: u8) -> Kunci {
        [n; 32]
    }

    #[test]
    fn shortvec_bolak_balik() {
        for n in [0usize, 1, 127, 128, 255, 16_383, 16_384, 65_535] {
            let mut b = Vec::new();
            shortvec(n, &mut b);
            let mut i = 0;
            assert_eq!(baca_shortvec(&b, &mut i).unwrap(), n);
            assert_eq!(i, b.len());
        }
        let mut b = Vec::new();
        shortvec(128, &mut b);
        assert_eq!(b, [0x80, 0x01]);
    }

    #[test]
    fn susunan_dan_indeks() {
        let payer = k(1);
        let prog = k(9);
        let ix = Instruksi {
            program: prog,
            akun: vec![
                Meta { kunci: payer, penanda: true, tulis: true },
                Meta { kunci: k(2), penanda: false, tulis: true }, // dari ALT, writable
                Meta { kunci: k(3), penanda: false, tulis: false }, // dari ALT, readonly
                Meta { kunci: k(4), penanda: false, tulis: true }, // statis
            ],
            data: vec![7, 7],
        };
        let alt = vec![(k(50), vec![k(3), k(2), k(9)])]; // program k(9) di tabel tapi wajib statis
        let p = susun_v0(&payer, &[ix], &k(0xbb), &alt).unwrap();
        assert_eq!(&p[..4], &[0x80, 1, 0, 1]); // 1 penanda, 0 penanda-ro, 1 readonly (program)
        assert_eq!(p[4], 3); // payer, k4, prog
        assert_eq!(&p[5..37], &payer);
        assert_eq!(&p[37..69], &k(4));
        assert_eq!(&p[69..101], &prog);
        assert_eq!(&p[101..133], &k(0xbb));
        // 1 instruksi: program idx 2, 4 akun [payer 0, k2 → 3 (writable ALT), k3 → 4 (readonly ALT), k4 → 1]
        assert_eq!(&p[133..143], &[1, 2, 4, 0, 3, 4, 1, 2, 7, 7]);
        // lookup: tabel k50, writable [1], readonly [0]
        assert_eq!(p[143], 1);
        assert_eq!(&p[144..176], &k(50));
        assert_eq!(&p[176..], &[1, 1, 1, 0]);
        assert_eq!(payer_pesan(&p).unwrap(), payer);

        let tx = transaksi_kosong(&p);
        let (ttd, pesan) = pecah(&tx).unwrap();
        assert_eq!(ttd.len(), 1);
        assert_eq!(pesan, &p[..]);
    }

    /// Jalur `kirim`: wallet mengisi slot tanda tangan → pecah → payer = wallet → verify_strict lolos;
    /// pesan diubah satu byte → gagal.
    #[test]
    fn tanda_tangan_wallet_diperiksa() {
        use ed25519_dalek::{Signer, SigningKey};
        let sk = SigningKey::from_bytes(&[7u8; 32]);
        let payer: Kunci = sk.verifying_key().to_bytes();
        let ix = Instruksi { program: k(9), akun: vec![Meta { kunci: payer, penanda: true, tulis: true }], data: vec![1] };
        let pesan = susun_v0(&payer, &[batas_cu(1000), ix], &k(3), &[]).unwrap();
        let mut tx = transaksi_kosong(&pesan);
        let ttd = sk.sign(&pesan).to_bytes();
        tx[1..65].copy_from_slice(&ttd);

        let (t, m) = pecah(&tx).unwrap();
        assert_eq!(payer_pesan(m).unwrap(), payer);
        let vk = ed25519_dalek::VerifyingKey::from_bytes(&payer).unwrap();
        assert!(vk.verify_strict(m, &ed25519_dalek::Signature::from_bytes(&t[0])).is_ok());
        let mut ubah = m.to_vec();
        *ubah.last_mut().unwrap() ^= 1;
        assert!(vk.verify_strict(&ubah, &ed25519_dalek::Signature::from_bytes(&t[0])).is_err());
        assert!(pecah(&tx[..40]).is_err());
    }
}
