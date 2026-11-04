import { useEffect, useState } from 'react'
import { ActionType, type Chart, type KLineData } from 'klinecharts'
import { hargaSatuan, umur } from '@/lib/format'
import { waktuStrip } from './kanvas'
import './chart.css'

/* ─────────────────────────────────────────────────────────────────────────
   A5: potongan chart BERSAMA SOL & BNB (keduanya KLineChart Pro sejak R2): strip OHLC di atas kanvas,
   skeleton, galat, catatan data lama. Kelas `ck-*` (chart.css) sama utk kedua chain.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Strip OHLC di ATAS kanvas (pengganti tooltip kanvas yang di 390 menutupi candle). Menampilkan candle di bawah
 * crosshair, atau candle terakhir bila crosshair tak aktif. Harga = `hargaSatuan` (format kartu, nol subskrip).
 */
export function StripOhlc({ k, satuan, tz, ekstra, hover }: {
  k: KLineData | null
  satuan: string | null
  tz: string
  /** Kolom tambahan per chain, mis. SOL "SOL in curve". */
  ekstra?: (k: KLineData) => { label: string; value: string }[]
  hover: boolean
}) {
  if (!k) return <div className="ck-ohlc" aria-hidden="true" />
  const naik = k.close > k.open ? 'is-up' : k.close < k.open ? 'is-down' : ''
  const sel = [
    { label: 'O', value: hargaSatuan(k.open, satuan) },
    { label: 'H', value: hargaSatuan(k.high, satuan) },
    { label: 'L', value: hargaSatuan(k.low, satuan) },
    { label: 'C', value: hargaSatuan(k.close, satuan), kelas: naik },
    ...(ekstra ? ekstra(k) : []),
  ]
  return (
    <div className="ck-ohlc" aria-live="off">
      <span className="ck-ohlc-t">
        {waktuStrip(k.timestamp, tz)}
        {!hover && <span className="ck-ohlc-last"> latest</span>}
      </span>
      {sel.map((s) => (
        <span key={s.label} className="ck-ohlc-i">
          <span className="ck-ohlc-k">{s.label}</span>
          <span className={`ck-ohlc-v ${'kelas' in s ? s.kelas ?? '' : ''}`}>{s.value}</span>
        </span>
      ))}
    </div>
  )
}

/** Candle di bawah crosshair (null saat crosshair tak aktif / penunjuk keluar dari wadah). */
export function useCrosshair(chart: Chart | null, wadah: HTMLElement | null): KLineData | null {
  const [k, setK] = useState<KLineData | null>(null)
  useEffect(() => {
    if (!chart) return
    const cb = (d?: unknown) => {
      const x = (d as { kLineData?: KLineData } | undefined)?.kLineData
      setK(x ?? null)
    }
    chart.subscribeAction(ActionType.OnCrosshairChange, cb)
    // klinecharts tak memanggil callback saat penunjuk keluar (paneId kosong) → strip kembali ke candle terakhir
    const keluar = () => setK(null)
    wadah?.addEventListener('pointerleave', keluar)
    return () => {
      chart.unsubscribeAction(ActionType.OnCrosshairChange, cb)
      wadah?.removeEventListener('pointerleave', keluar)
    }
  }, [chart, wadah])
  return k
}

/** Candle terakhir di chart, diperbarui tiap data masuk (`OnDataReady`: muat awal, ganti periode, pembaruan hidup). */
export function useCandleTerakhir(chart: Chart | null): KLineData | null {
  const [k, setK] = useState<KLineData | null>(null)
  useEffect(() => {
    if (!chart) return
    const baca = () => {
      const l = chart.getDataList()
      const x = l[l.length - 1]
      setK(x ? { ...x } : null)
    }
    baca()
    chart.subscribeAction(ActionType.OnDataReady, baca)
    return () => chart.unsubscribeAction(ActionType.OnDataReady, baca)
  }, [chart])
  return k
}

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

/** Chart gagal dimuat dan belum ada data sama sekali. */
export function ChartGagal() {
  return (
    <div className="pcp-empty ck-fail" role="status">
      <p>Couldn&rsquo;t load the chart.</p>
      <p className="pcp-empty-sub">Retrying automatically.</p>
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
