import { impor } from '@/lib/potongan'

/* U1 putaran 2: SATU pemuat per komponen chart malas (klinecharts + Pro + CSS Pro). Dipakai `lazy()` di
   PriceChartLive & adaptBnb, dan dipanggil lebih awal (`pramuatChart*`) saat modul rute Coin/BnbToken dievaluasi →
   potongan chart diunduh paralel dgn `/api/token` alih-alih menunggu chart dirender (hemat satu round trip). */
// Janji DISIMPAN: pramuat & `lazy()` berbagi hasil yang sama. Tanpa ini, CSS Pro yang gagal saat pramuat ditandai
// "sudah dimuat" oleh Vite → impor kedua (lazy) lolos dan chart tergambar tanpa CSS Pro, bukan `ChartGagal`.
let janjiSol: ReturnType<typeof muatSol> | undefined
let janjiBnb: ReturnType<typeof muatBnb> | undefined
const muatSol = () => impor(() => import('../PriceChartPro'))
const muatBnb = () => impor(() => import('@/features/bnb/BnbChart'))
export const muatChartSol = () => (janjiSol ??= muatSol())
export const muatChartBnb = () => (janjiBnb ??= muatBnb())

/** Unduh lebih awal; galat diabaikan di sini (penjaga `vite:preloadError` & BatasGalat chart yang menanganinya). */
export function pramuat(muat: () => Promise<unknown>) {
  muat().catch(() => {})
}

/** Teks bawah `ChartGagal` bila potongan chart tak terunduh (tak ada coba-ulang otomatis). */
export const SUB_GAGAL_UNDUH = 'Part of the chart could not be downloaded. Reload the page to try again.'
