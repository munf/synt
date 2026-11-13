import { useEffect, useState } from 'react'
import { umur } from '@/lib/format'
import './chart.css'

/* ─────────────────────────────────────────────────────────────────────────
   U1 (7 Nov): potongan chart yang TIDAK butuh klinecharts. Dipisah dari `ChartBits.tsx` (yang mengimpor klinecharts)
   supaya halaman token (`TokenView`, `CoinDetailView`) & fallback Suspense/galat chart bisa memakainya, sementara
   klinecharts + Pro dimuat malas bersama komponen chart (`PriceChartPro`, `BnbChart`, lihat `muat.ts`).
   ───────────────────────────────────────────────────────────────────────── */

/** Kerangka saat chart memuat (blok `--raise`, tanpa shimmer; DESIGN §2 SkeletonCard). */
export function ChartSkeleton() {
  return (
    <div className="ck-skel" role="status" aria-label="Loading chart">
      <div className="ck-skel-bar" />
      <div className="ck-skel-plot">
        {[38, 52, 44, 61, 57, 70, 64, 48, 55, 66, 72, 59].map((h, i) => (
          <i key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

/**
 * Chart gagal dimuat dan belum ada data sama sekali. `sub` = kalimat kedua; bawaan = polling candle masih mencoba
 * (PriceChartPro). U1 putaran 2: potongan chart tak terunduh → tak ada coba-ulang otomatis, jadi teksnya lain.
 */
export function ChartGagal({ sub = 'Retrying automatically.' }: { sub?: string }) {
  return (
    <div className="pcp-empty ck-fail" role="status">
      <p>Couldn&rsquo;t load the chart.</p>
      <p className="pcp-empty-sub">{sub}</p>
    </div>
  )
}

/** Detak ulang tiap `ms` supaya teks "N ago" ikut bergerak tanpa menunggu polling berikutnya. */
export function useDetak(ms: number, aktif = true): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    if (!aktif) return
    const id = setInterval(() => setT(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms, aktif])
  return t
}

/**
 * ⭐ A5: polling gagal tapi data lama masih ada → data itu TETAP tampil + catatan kecil ini. `sejak` = epoch ms jawaban
 * sukses terakhir; null → catatan tanpa umur.
 */
export function CatatanBasi({ sejak, className = '' }: { sejak: number | null; className?: string }) {
  const kini = useDetak(15_000)
  const umurTeks = sejak !== null ? umur(Math.max(0, (kini - sejak) / 1000)) : null
  return (
    <p className={`ck-stale ${className}`} role="status">
      {umurTeks ? `Couldn’t refresh, showing data from ${umurTeks} ago.` : 'Couldn’t refresh, showing the last data.'}
    </p>
  )
}
