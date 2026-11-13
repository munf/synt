import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KLineChartPro, DefaultDatafeed } from '@klinecharts/pro'
import type { SymbolInfo, Period, DatafeedSubscribeCallback } from '@klinecharts/pro'
import type { Chart, KLineData } from 'klinecharts'
import type { BnbCandle } from '@/api/types'
import { kalimatSatuanChart, waktuCandle } from './bnbFormat'
import { gabungPeriode, gayakanKanvas, pasangLipatHarga, setelahFontSiap, zonaPembaca } from '@/features/token/chart/kanvas'
import { StripOhlc, useCandleTerakhir, useCrosshair } from '@/features/token/chart/ChartBits'
import { chartDiBalik } from '@/features/token/PriceChartPro'
import '@klinecharts/pro/dist/klinecharts-pro.css'
import '@/features/token/PriceChartPro.css'

/**
 * Chart candle token BNB (`/api/bnb/token/:addr` → `candles`, 1m).
 *
 * ⭐ R2 putaran 2 (DESIGN §0.1/§0.3, Reviewer): bingkai chart SAMA dgn SOL = KLineChart Pro (bilah simbol · periode ·
 * Indicator · Timezone · Setting · Screenshot · Full Screen, kolom alat gambar kiri), opsi & gaya kanvas identik dgn
 * `PriceChartPro`. Bedanya hanya data: datafeed statis di bawah menyajikan candle 1m yang SUDAH diambil halaman
 * (polling `/api/bnb/token`), tanpa SSE & tanpa pane CURVE SOL (`subIndicators: []`).
 *
 * ⛔ P3: timestamp dari DATA, bukan `Date.now()`. Kontrak B11 final: `t` = epoch unix detik → `t × 1000`
 * (`waktuCandle`). Candle ber-`t` tak sah dilewati; tak ada jam karangan.
 * ⭐ A5: gaya kanvas bersama (`gayakanKanvas`: font mono, warna token, harga subskrip), strip OHLC HTML di bawah bilah,
 * catatan data lama, alat gambar tertutup ≤760. Endpoint hanya memberi candle 1m (`?tf=` diabaikan, maks 1440 menit
 * ber-trade) → 5m/15m/1h DIGABUNG di klien dari candle 1m yang sama (`gabungPeriode`), dan catatan menyebutnya.
 */

/** Desimal harga mengikuti harga terkecil (token BNB umumnya < $0.0001): 3 digit bermakna. */
function presisi(rows: KLineData[]): number {
  const kecil = Math.min(...rows.map((r) => r.low).filter((v) => v > 0))
  if (!Number.isFinite(kecil) || kecil >= 1) return 4
  return Math.min(14, Math.max(4, Math.ceil(-Math.log10(kecil)) + 3))
}

function msPeriode(p: Period): number {
  return p.multiplier * (p.timespan === 'hour' ? 3_600_000 : 60_000)
}

/**
 * Datafeed statis utk Pro: candle 1m di memori → digabung per periode. Polling halaman → `perbarui()` → candle periode
 * aktif yang berubah dikirim lewat callback `subscribe` Pro (chart tak dibangun ulang; periode/zoom bertahan).
 */
class DatafeedBnb {
  private readonly perPeriode = new Map<number, KLineData[]>()
  private langganan: { ms: number; cb: DatafeedSubscribeCallback } | null = null
  private terakhir: KLineData | null = null

  constructor(private rows: KLineData[]) {}

  async searchSymbols(): Promise<SymbolInfo[]> {
    return []
  }

  private candle(ms: number): KLineData[] {
    const ada = this.perPeriode.get(ms)
    if (ada) return ada
    const hasil = gabungPeriode(this.rows.map((r) => ({ ...r })), ms)
    this.perPeriode.set(ms, hasil)
    return hasil
  }

  /** Muat awal (`to` ≥ candle tertua) → semua candle; loadMore (`to` < tertua) → [] = tak ada lagi (sama dgn SOL). */
  async getHistoryKLineData(_s: SymbolInfo, p: Period, _from: number, to: number) {
    const semua = this.candle(msPeriode(p))
    const tertua = semua[0]
    if (!tertua || to < tertua.timestamp) {
      if (!tertua) this.terakhir = null
      return []
    }
    this.terakhir = semua[semua.length - 1] ?? null
    return semua.map((k) => ({ ...k }))
  }

  subscribe(_s: SymbolInfo, p: Period, cb: DatafeedSubscribeCallback): void {
    this.langganan = { ms: msPeriode(p), cb }
    this.kirim()
  }

  unsubscribe(): void {
    this.langganan = null
  }

  perbarui(rows: KLineData[]): void {
    if (rows === this.rows) return
    this.rows = rows
    this.perPeriode.clear()
    this.kirim()
  }

  /** Kirim candle periode aktif mulai dari candle terakhir chart (sama timestamp → ganti, lebih baru → tambah). */
  private kirim(): void {
    const l = this.langganan
    if (!l) return
    for (const k of this.candle(l.ms)) {
      const a = this.terakhir
      if (a && k.timestamp < a.timestamp) continue
      if (a && k.timestamp === a.timestamp && k.open === a.open && k.high === a.high && k.low === a.low && k.close === a.close) continue
      this.terakhir = k
      l.cb({ ...k })
    }
  }
}

export function BnbChart({ token, symbol, candles, graduated, unit, kurs = null, satuanTakTerbaca = false }: {
  /** Alamat kontrak (ticker Pro; ganti token = chart baru). */
  token: string
  symbol: string
  candles: BnbCandle[]
  graduated: boolean
  /**
   * 14c: harga pair ini tak bisa dibaca (bnb.rs `satuan_sah`: quote tak dikenal / desimal bukan 18 → harga null &
   * candle SELALU kosong, walau sudah ada trade). Beda dgn token yang baru belum punya candle.
   */
  satuanTakTerbaca?: boolean
  /** `candle_unit` B11: 'USD' atau simbol quote. null = satuan tak diketahui → ditulis jujur di catatan. */
  unit: string | null
  /** U2: `quote_usd` (kurs USD satu quote) utk catatan satuan; null = tak diketahui. */
  kurs?: number | null
}) {
  const wadah = useRef<HTMLDivElement>(null)
  const data = useMemo<KLineData[]>(() => {
    const out: KLineData[] = []
    for (const c of candles) {
      const ts = waktuCandle(c)
      if (ts === null || !(c.o > 0 && c.h > 0 && c.l > 0 && c.c > 0)) continue
      out.push({ timestamp: Math.floor(ts / 60_000) * 60_000, open: c.o, high: c.h, low: c.l, close: c.c })
    }
    out.sort((a, b) => a.timestamp - b.timestamp)
    // menit ganda (mis. dua baris satu menit) → yang terakhir menang; klinecharts menolak timestamp mundur
    return out.filter((r, i) => i === out.length - 1 || out[i + 1]!.timestamp !== r.timestamp)
  }, [candles])
  const dataRef = useRef(data)
  dataRef.current = data
  const punyaData = data.length > 0
  const feed = useRef<DatafeedBnb | null>(null)
  const [kc, setKc] = useState<Chart | null>(null)
  const [hostStrip, setHostStrip] = useState<HTMLDivElement | null>(null)
  const tz = useRef(zonaPembaca()).current

  // Chart dibuat SEKALI per token/satuan (zoom/periode pengguna bertahan saat polling); data baru lewat datafeed.
  useEffect(() => {
    if (!wadah.current || !dataRef.current.length) return
    pasangLipatHarga()
    const sempit = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches
    const df = new DatafeedBnb(dataRef.current)
    feed.current = df
    const c = new KLineChartPro({
      container: wadah.current,
      theme: 'dark',
      locale: 'en-US',
      symbol: {
        ticker: token,
        name: symbol,
        shortName: symbol,
        exchange: 'BNB Chain',
        market: 'crypto',
        pricePrecision: presisi(dataRef.current),
        volumePrecision: 0,
        priceCurrency: (unit ?? '').toLowerCase(),
        type: 'crypto',
      },
      timezone: tz,
      period: { multiplier: 1, timespan: 'minute', text: '1m' },
      periods: [
        { multiplier: 1, timespan: 'minute', text: '1m' },
        { multiplier: 5, timespan: 'minute', text: '5m' },
        { multiplier: 15, timespan: 'minute', text: '15m' },
        { multiplier: 1, timespan: 'hour', text: '1h' },
      ],
      // tanpa pane bawah: BNB tak punya cadangan kurva per candle (bukan volume juga)
      subIndicators: [],
      datafeed: df as unknown as DefaultDatafeed,
      drawingBarVisible: !sempit,
    })

    const host = document.createElement('div')
    host.className = 'ck-ohlc-host'
    let batal = false
    let rangka = 0
    let ro: ResizeObserver | null = null
    const pasang = () => {
      if (batal) return
      const k = chartDiBalik(c)
      const bilah = wadah.current?.querySelector('.klinecharts-pro-period-bar')
      if (!k || !bilah) {
        rangka = requestAnimationFrame(pasang)
        return
      }
      const gayakan = () =>
        gayakanKanvas(
          { getStyles: () => k.getStyles(), setStyles: (s) => c.setStyles(s) },
          sempit ? { indicator: { tooltip: { showRule: 'follow_cross' as never } } } : undefined,
        )
      gayakan()
      bilah.after(host)
      setHostStrip(host)
      setKc(k)
      k.resize()
      const isi = wadah.current?.querySelector('.klinecharts-pro-content')
      if (isi && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => k.resize())
        ro.observe(isi)
      }
      setelahFontSiap(() => {
        if (batal) return
        gayakan()
        k.resize()
      })
    }
    pasang()

    return () => {
      batal = true
      cancelAnimationFrame(rangka)
      ro?.disconnect()
      setKc(null)
      setHostStrip(null)
      host.remove()
      feed.current = null
      if (wadah.current) wadah.current.innerHTML = ''
    }
  }, [token, symbol, punyaData, unit, tz])

  // Polling membawa candle baru → datafeed → callback subscribe Pro (tanpa membangun ulang chart)
  useEffect(() => {
    feed.current?.perbarui(data)
  }, [data])

  const hover = useCrosshair(kc, wadah.current)
  const terakhir = useCandleTerakhir(kc)

  if (!data.length) {
    if (satuanTakTerbaca) {
      return (
        <div className="pcp-empty bnb-chart-empty">
          <p>No chart.</p>
          <p className="pcp-empty-sub">The price unit for this pair can't be read, so there is no chart.</p>
        </div>
      )
    }
    return (
      <div className="pcp-empty bnb-chart-empty">
        <p>No candles yet.</p>
        <p className="pcp-empty-sub">Candles appear once the token has traded for a minute.</p>
      </div>
    )
  }
  return (
    <>
      <div className="pcp" ref={wadah} />
      {hostStrip &&
        createPortal(
          <>
            <StripOhlc k={hover ?? terakhir} hover={!!hover} satuan={unit} tz={kc?.getTimezone() || tz} />
          </>,
          hostStrip,
        )}
      <p className="pcp-note">
        {/* 14b: kueri candle bnb.rs `hitung_token` = trade kurva UNION harga pool `bnb_pasca` yang direkam synt (bukan
            trade DEX). Putaran 2: tanpa klaim durasi rekaman pool (dibantah data live); cukup "can have gaps". */}
        {`1 minute candles${unit ? ` in ${unit}` : ''} from bonding curve trades`}
        {graduated ? ' and, after graduation, DEX pool prices synt recorded, which can have gaps' : ''}
        {', in your time zone. 5m, 15m and 1h are combined from these 1 minute candles in your browser.'}
        {/* U2: kalimat satuan dari satu fungsi bersama kartu (bnbFormat `kalimatSatuanChart`) */}
        {unit !== 'USD' ? ` ${kalimatSatuanChart(unit, kurs)}` : ''}
      </p>
    </>
  )
}
