import { useEffect, useState } from 'react'
import { ActionType, type Chart, type KLineData } from 'klinecharts'
import { hargaSatuan } from '@/lib/format'
import { waktuStrip } from './kanvas'
import './chart.css'

// U1 (7 Nov): potongan TANPA klinecharts (skeleton, catatan data lama, detak) pindah ke `ChartRingan.tsx` supaya
// halaman token bisa memakainya tanpa ikut memuat pustaka chart. Diekspor ulang di sini utk pemakai lama.
export { CatatanBasi, ChartGagal, ChartSkeleton, useDetak } from './ChartRingan'

/* ─────────────────────────────────────────────────────────────────────────
   A5: potongan chart BERSAMA SOL & BNB (keduanya KLineChart Pro sejak R2): strip OHLC di atas kanvas,
   skeleton, galat, catatan data lama. Kelas `ck-*` (chart.css) sama utk kedua chain.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Strip OHLC di ATAS kanvas (pengganti tooltip kanvas yang di 390 menutupi candle). Menampilkan candle di bawah
 * crosshair, atau candle terakhir bila crosshair tak aktif. Harga = `hargaSatuan` (format kartu, nol subskrip).
 */
export function StripOhlc({ k, satuan, tz, ekstra, hover, akhir }: {
  k: KLineData | null
  satuan: string | null
  tz: string
  /** Kolom tambahan per chain, mis. SOL "SOL in curve". */
  ekstra?: (k: KLineData) => { label: string; value: string }[]
  hover: boolean
  /** U7: chart berhenti di akhir data kurva (token lulus) → candle terakhir ≠ harga kini, label bukan "latest". */
  akhir?: boolean
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
        {!hover && (
          <span className="ck-ohlc-last">
            {/* U7: strip ponsel = 2 baris tetap tanpa ruang utk label panjang (390: sisa ±12 px) → "final" ≤760 */}
            {akhir ? <><span className="ck-akhir-l"> end of curve data</span><span className="ck-akhir-s"> final</span></> : ' latest'}
          </span>
        )}
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

