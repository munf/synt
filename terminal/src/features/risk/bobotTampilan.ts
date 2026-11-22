import type { Tingkat } from './ambang'

/**
 * ⭐ T-8 (§8, 22 Nov): bobot faktor SOL yang DITAMPILKAN di daftar faktor (tab Score factors halaman token & kartu
 * SYNT AUDIT panel Trenches), satu sumber utk kedua tempat agar satu faktor tak tampil dgn dua angka.
 * ⚠️ MURNI TAMPILAN, bukan kontribusi mesin ke skor (bobot asli `skor2_rincian` tak dikirim ke klien). Tingkat dari
 * tabel ambang bersama `ambang.ts` (tak diubah di sini).
 */
export function bobotTampilan(t: Tingkat): number {
  return t === 'berat' ? -10 : t === 'waspada' ? -5 : 5
}
