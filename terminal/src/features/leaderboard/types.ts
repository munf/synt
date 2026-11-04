/* Bentuk data Leaderboard — frame Figma 3:16, disesuaikan dgn PRODUK.md §1.3.

   ⛔ PENTING — PnL per trader BELUM BISA DIHITUNG.

   PRODUK.md §1.3 mengukurnya: dari 37.260 pasangan wallet-coin, hanya
   4.186 (11%) yang punya beli DAN jual terekam. Sebabnya struktural —
   `v10_tx_awal` hanya merekam 25 transaksi pertama, sedangkan penjualan
   terjadi belakangan.

   Karena itu `winRate` dan `totalProfit` di bawah bertipe OPSIONAL, bukan
   number. Kolomnya tetap ada di kerangka supaya bentuk akhirnya terlihat,
   tapi `undefined` HARUS dirender sebagai "—" dengan penjelasan, bukan 0
   atau angka karangan. Menampilkan "+$1.2M" sebagai angka jadi adalah
   persis janji yang datanya tak bisa dukung (BRAND.md §3).
   ───────────────────────────────────────────────────────────────────────── */

export type LeaderboardMode = 'trader' | 'creator'

/** Tiga teratas ditampilkan sebagai kartu podium, bukan baris tabel. */
export interface PodiumEntry {
  id: string
  rank: number
  name: string
  handle: string
  avatar: string | null
  timeAgo: string
  followers: number
  /** Skor dampak — turunan reputasi creator, bukan PnL. */
  impactScore: number
  growth24h: number
  /** Titik sparkline ternormalisasi 0–1. Kosong = grafik tidak dirender. */
  spark: number[]
}

export interface LeaderboardRow {
  id: string
  rank: number
  name: string
  avatar: string | null
  followers: number

  /**
   * ⬜ Angka kerangka. Butuh riwayat transaksi penuh sebelum bisa dihitung
   * sungguhan (PRODUK.md §3) — sekarang cakupannya 11%.
   */
  winRate: number

  /** ⬜ Angka kerangka — alasan sama dengan winRate. */
  totalProfit: number
}
