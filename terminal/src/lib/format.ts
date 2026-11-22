/* ─────────────────────────────────────────────────────────────────────────
   Pemformatan angka untuk tampilan.

   Dipisah dari komponen supaya satu token bisa muncul di beberapa layar
   dengan format identik — "$73.9K" di tabel Trenches dan di panel detail
   harus sama persis, dan itu hanya terjamin bila logikanya satu tempat.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Ringkas angka besar: 73900 → "73.9K", 1_240_000 → "1.2M".
 *
 * Satu desimal, dan `.0` dibuang: 100_000 → "100K", bukan "100.0K". Kolom
 * angka jadi lebih tenang dibaca saat berjajar puluhan baris.
 */
export function compact(n: number): string {
  const abs = Math.abs(n)
  const [div, suffix] =
    abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : [1, '']

  const v = n / div
  // Di bawah 1000 tak perlu desimal sama sekali — "213", bukan "213.0".
  if (!suffix) return String(Math.round(v))

  return `${v.toFixed(1).replace(/\.0$/, '')}${suffix}`
}

export function usd(n: number): string {
  return `$${compact(n)}`
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
/** Harga token: ≥0,01 → 4 desimal; lebih kecil → nol subskrip ala GMGN/DexScreener ("$0.0₅216").
    Dulu `toFixed(6)` → token murah tampil "$0.000000". */
export function harga(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0'
  return `$${angkaHarga(n)}`
}

/**
 * Angka harga TANPA simbol mata uang, aturan sama persis dgn `harga` ("0.0₅216", "0.0123", "1,234.5"). Dipakai utk
 * harga bersatuan bukan USD (SOL, quote BNB) dan oleh kanvas chart (A5: sumbu, penanda harga, strip OHLC) supaya
 * angka chart = angka kartu. n ≤ 0 / tak sah → "0".
 */
export function angkaHarga(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1) return n.toLocaleString('en', { maximumFractionDigits: 2 })
  if (n >= 0.01) return n.toFixed(4)
  // eksponen dari toExponential, BUKAN floor(-log10): log10 pangkat 10 persis (1e-5) & pembulatan ke atas
  // (0.0099999 → 1.000e-2) membuat jumlah nol salah 1 → sumbu chart tertulis 10× (Reviewer A5)
  const [m = '0', e = '0'] = n.toExponential(3).split('e')
  const pangkat = Number(e)
  if (pangkat >= -2) return Number(`${m}e${e}`).toFixed(4)
  const nol = -pangkat - 1 // jumlah nol sesudah "0." (0,00000292 → 5)
  const sig = m.replace('.', '').replace(/0+$/, '') || '0'
  if (nol < 4) return `0.${'0'.repeat(nol)}${sig}`
  return `0.0${String(nol).split('').map((d) => SUB[+d]).join('')}${sig}`
}

/** Harga dgn satuannya: USD → "$0.0₄4649"; lainnya → "0.0₄4649 SOL". null/≤0 → "—". */
export function hargaSatuan(v: number | null | undefined, satuan: string | null | undefined): string {
  if (!angkaSah(v) || v <= 0) return '—'
  return satuan === 'USD' ? harga(v) : `${angkaHarga(v)}${satuan ? ` ${satuan}` : ''}`
}

/** Persen bertanda: 184.2 → "+184.2%", -12.8 → "-12.8%". */
export function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

/**
 * Fee dalam ETH. Nilainya membentang dari 0.0035 sampai puluhan, jadi jumlah
 * desimal mengikuti besarannya — 4 desimal untuk nilai kecil supaya tidak
 * jadi "0.00 ETH", 2 desimal untuk nilai besar supaya tidak berisik.
 */
export function eth(n: number): string {
  return `${n < 0.01 ? n.toFixed(4) : n.toFixed(2)} ETH`
}

/** Kelas warna naik/turun. Nol dianggap netral, bukan naik. */
export function trendClass(n: number): 'is-up' | 'is-down' | 'is-flat' {
  return n > 0 ? 'is-up' : n < 0 ? 'is-down' : 'is-flat'
}

/* ── Formatter tunggal (A2, 27 Okt; DESIGN-TERMINAL §4.2) ───────────────────
   ⭐ SATU fungsi per konsep, dipakai Trenches SOL & BNB, panel, /coin, /bnb, Discovery. Dulu ada 4 fungsi umur
   ("2 min" / "5m" / "13m old" / "1h 12m") dan 3 gaya alamat (4…4, 6…4, 6…6) → dua chain terbaca beda. */

const angkaSah = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Umur / durasi: 45s · 13m · 5h 54m · 1d 6h. Tanpa "old"/"ago" (penyebut konteks yang menambahkannya, mis.
 * "Last scored 13m ago"). Nilai tak sah / negatif → "—".
 */
export function umur(detik: number | null | undefined): string {
  if (!angkaSah(detik) || detik < 0) return '—'
  const s = Math.round(detik)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
    return m ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600)
  return h ? `${d}d ${h}h` : `${d}d`
}

/** Alamat pendek: EVM `0x112b…7777` (0x + 4…4), lainnya (Solana) `GJyN…pump` (4…4). Pendek → apa adanya. */
export function alamatPendek(a: string | null | undefined): string {
  if (!a) return '—'
  const evm = /^0x[0-9a-f]+$/i.test(a)
  const depan = evm ? 6 : 4
  return a.length > depan + 5 ? `${a.slice(0, depan)}…${a.slice(-4)}` : a
}

/**
 * Uang USD ringkas. null / tak terhingga → "—" (tak terukur, BUKAN $0). `kecil: 'lt1'` (bawaan): 0 ≤ v < 1 → "<$1"
 * (terukur tapi kecil, mis. kurva terkuras). `kecil: 'kosong'`: v < 1 → "—" (dipakai bila nilai < $1 bukan data,
 * mis. likuiditas sisi quote BNB, pelajaran 1c).
 */
export function uang(v: number | null | undefined, kecil: 'lt1' | 'kosong' = 'lt1'): string {
  if (!angkaSah(v)) return '—'
  if (kecil === 'kosong' && v < 1) return '—'
  if (v >= 0 && v < 1) return '<$1'
  return usd(v)
}

/** Harga bersubskrip ($0.0₅2921); null / ≤ 0 → "—" (bukan "$0"). */
export function hargaAtau(v: number | null | undefined): string {
  return angkaSah(v) && v > 0 ? harga(v) : '—'
}

/* ── Hasil faktor skor (P-6 / T-8, §8 22 Nov): satu kosakata utk halaman token & panel Trenches ── */

/** Bobot faktor SOL (tampilan apa adanya): tanda tipografis, 0 tanpa tanda. */
export function teksBobot(b: number): string {
  return b > 0 ? `+${b}` : b < 0 ? `−${Math.abs(b)}` : '0'
}
/** Kelas warna bobot: menaikkan = up, menurunkan = down, 0 = datar (netral). */
export function kelasBobot(b: number): 'is-up' | 'is-down' | 'is-flat' {
  return b > 0 ? 'is-up' : b < 0 ? 'is-down' : 'is-flat'
}
/** Hasil sinyal tanpa bobot (BNB): "Flag" gagal, "Pass" lolos, "—" tak terukur. */
export function teksHasil(bad: boolean | null): string {
  return bad === true ? 'Flag' : bad === false ? 'Pass' : '—'
}
