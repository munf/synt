/**
 * ⭐ SATU tabel ambang tampilan risiko Solana (22 Nov 2026) — dipakai Trenches (`trenches/adapt.ts` bobot), faktor skor
 * halaman token (`token/adaptDetail.ts`) dan Token facts (`token/adapt.ts`). Dulu tiga aturan berbeda: dev 8% merah di
 * Trenches, lolos di daftar faktor, kuning di Token facts; gini ditandai di halaman token tapi tidak di Trenches.
 *
 * Angka = yang sudah dipakai Trenches, karena hanya itu yang punya rata-rata terukur per outcome (lihat komentar di
 * `trenches/adapt.ts`). ⚠️ TAMPILAN saja: bukan bobot/ambang mesin (`skor2_rincian` tak dikirim ke klien), skor & tabel
 * skor publik tak berubah. Gini (sebaran kepemilikan) SENGAJA tak punya ambang: tak ada data terukur → konteks saja.
 *
 * BNB tidak memakai tabel ini: sinyalnya datang dari server dengan aturan chain BNB sendiri.
 */

export type Sinyal = 'top10' | 'dev' | 'konsentrasi' | 'tandai'
export type Tingkat = 'aman' | 'waspada' | 'berat'

/** `waspada` null = sinyal hanya punya satu tingkat buruk. Nilai ≥ ambang = tingkat itu. */
export const AMBANG: Record<Sinyal, { waspada: number | null; berat: number }> = {
  // persen supply di 10 wallet terbesar. ⛔ Terukur: top10 TINGGI justru lebih sering pada winner → hanya ekstremnya.
  top10: { waspada: null, berat: 95 },
  // persen supply di wallet kreator. Rata terukur: rug 0,93 · winner 0,44 · survive 0,23.
  dev: { waspada: 5, berat: 20 },
  // keragaman wallet × 100 (tinggi = terkonsentrasi). Rata terukur: rug 64,1 · winner 24,3.
  konsentrasi: { waspada: 45, berat: 60 },
  // HITUNGAN wallet bertanda (bukan skor blacklist). Rata terukur: rug 7,33 · winner 2,46.
  tandai: { waspada: 5, berat: 8 },
}

export function tingkat(s: Sinyal, v: number): Tingkat {
  const a = AMBANG[s]
  if (v >= a.berat) return 'berat'
  if (a.waspada !== null && v >= a.waspada) return 'waspada'
  return 'aman'
}
