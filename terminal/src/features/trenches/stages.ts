/* ─────────────────────────────────────────────────────────────────────────
   Sub-tampilan Trenches — PRODUK.md §1.2.

   Empat tampilan persis seperti dokumen visi:
     new pair   pair terbaru, sudah beraudit
     trending   yang sedang ramai
     bonding    masih di bonding curve
     graduated  sudah lulus ke AMM

   Istilahnya bukan karangan UI: synt-v10 memakai konsep yang sama —
   `graduation_pct` di pattern.rs dan flag `complete` di scorer.rs
   ("graduated: kurva lulus ke AMM", src/scorer.rs:245-257).

   ⬜ KERANGKA. Penyaringan di sini dilakukan atas data mock di klien.
   Pada integrasi nanti `view` menjadi parameter permintaan ke synt-dash —
   mengirim seluruh tabel lalu memfilter di browser tidak akan terskala
   (19.253 coin/hari terdeteksi, PRODUK.md §1.2).
   ───────────────────────────────────────────────────────────────────────── */

export type TrenchView = 'new' | 'trending' | 'bonding' | 'graduated'

export interface ViewDef {
  id: TrenchView
  label: string
  /** Tooltip — istilah ini tidak universal di luar ekosistem pump.fun. */
  hint: string
}

export const VIEWS: ViewDef[] = [
  { id: 'new', label: 'New Pair', hint: 'Newest pairs, already audited' },
  { id: 'trending', label: 'Trending', hint: 'Currently active' },
  { id: 'bonding', label: 'Bonding', hint: 'Still on the bonding curve' },
  { id: 'graduated', label: 'Graduated', hint: 'Migrated to AMM' },
]

/**
 * Umur (menit) di bawah mana sebuah pair masih dianggap "new".
 *
 * ⬜ Angka kerangka. TrenchRow belum membawa umur dari API; saat tersedia,
 * pakai timestamp asli dan hapus heuristik di bawah.
 */
export const NEW_PAIR_MAX_AGE_MIN = 60

/** Ambang pertumbuhan untuk dianggap trending. ⬜ Angka kerangka. */
export const TRENDING_MIN_GROWTH = 50

/**
 * Tampilan mana yang memuat sebuah baris.
 *
 * Perhatikan: satu token bisa muncul di lebih dari satu tampilan — token
 * baru yang ramai adalah "new pair" DAN "trending". Itu disengaja; ini
 * tampilan, bukan kategori eksklusif.
 */
export function matchesView(
  row: {
    ageMinutes?: number
    complete?: boolean
    marketCapChange: number
  },
  view: TrenchView,
): boolean {
  switch (view) {
    case 'graduated':
      return row.complete === true
    case 'bonding':
      // Belum lulus kurva = masih di bonding curve.
      return row.complete !== true
    case 'new':
      return row.ageMinutes !== undefined && row.ageMinutes <= NEW_PAIR_MAX_AGE_MIN
    case 'trending':
      return row.marketCapChange >= TRENDING_MIN_GROWTH
  }
}
