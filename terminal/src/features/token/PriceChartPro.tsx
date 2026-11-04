import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KLineChartPro, DefaultDatafeed } from '@klinecharts/pro'
import type { SymbolInfo, Period, DatafeedSubscribeCallback } from '@klinecharts/pro'
import { registerIndicator } from 'klinecharts'
import type { Chart, KLineData } from 'klinecharts'
import { gayakanKanvas, pasangLipatHarga, setelahFontSiap, zonaPembaca } from './chart/kanvas'
import { CatatanBasi, ChartGagal, ChartSkeleton, StripOhlc, useCandleTerakhir, useCrosshair } from './chart/ChartBits'
import '@klinecharts/pro/dist/klinecharts-pro.css'
import type { CandleRow } from '@/api/types'
import './PriceChartPro.css'

/* ─────────────────────────────────────────────────────────────────────────
   Chart harga — @klinecharts/pro.

   ⚠️ Pro dibangun dengan **Solid.js**, bukan React. Ia dipasang secara
   imperatif ke sebuah <div> dan mengurus DOM-nya sendiri; React hanya
   menyediakan wadah dan membersihkannya saat unmount. Karena itu seluruh
   interaksinya ada di `useEffect`, bukan di JSX.

   ⭐ Keputusan pemilik proyek 2026-09-04: *"pakai klinecharts/pro penuh,
   tidak perlu override banyak cukup feed data saja"* — tema bawaan `dark`
   dibiarkan bekerja apa adanya. Penyesuaian visual menyusul setelah chart
   terbukti jalan, bukan sekaligus.

   ⛔ Data datang dari `/api/candles` yang SUDAH diambil komponen induk.
   Datafeed di sini hanya menyajikan ulang array itu — ia tidak memanggil
   jaringan sendiri, supaya tak ada dua sumber kebenaran untuk satu pair.
   ───────────────────────────────────────────────────────────────────────── */

/** Satu titik harga hidup dari SSE synt-stream `/live/stream/:mint` (struct `Tik`, langganan.rs). */
export interface TikHidup {
  /** `pair_age_secs`: detik sejak pair terdeteksi (peta.rs `cari`, definisi sama dgn `t` candle × 60). */
  detik: number
  /** `harga_sol`: harga kurva (vSOL / vToken), SOL. */
  harga: number
  /** `real_sol`: cadangan SOL kurva — yang diserap candle.rs ke `vol_sol` (max per menit). */
  liq: number
}

/** Langganan titik hidup: dipanggil saat chart dibuat, mengembalikan fungsi pelepas. */
export type LanggananTik = (cb: (t: TikHidup) => void, sambung: () => void) => () => void

/**
 * Datafeed yang menyajikan candle yang sudah ada di memori, plus pembaruan HIDUP.
 *
 * `DefaultDatafeed` bawaan Pro menembak API-nya sendiri (Polygon); di sini
 * kita menggantinya sepenuhnya. Bentuk kelasnya mengikuti antarmuka yang
 * sama supaya Pro tak tahu bedanya.
 *
 * ⭐ P4 (AGEN-BUILD): dulu chart BEKU di candle saat halaman dibuka. Kini dua jalur memperbarui chart yang SAMA,
 * lewat callback `subscribe` Pro (→ klinecharts `updateData`: timestamp = candle terakhir → diganti, lebih baru →
 * ditambahkan, lebih lama → diabaikan). Chart tak dibangun ulang → periode, zona waktu, indikator tetap.
 *  1. Polling `/api/candles` (induk, 20 dtk) → `perbarui(rows)`.
 *  2. Titik SSE `/live/stream/:mint` → `tik()`: menggerakkan candle menit berjalan di antara dua polling.
 * Keduanya dari aliran yang sama: synt-stream wss.rs menyiarkan tiap notifikasi kurva DAN menyerapnya ke candle.rs
 * (`v10_candle`, menit = `pair_age_secs / 60`, di-flush tiap 20 dtk). Jadi titik SSE = bagian dari candle server;
 * candle server menang begitu menitnya final.
 * Aliran berhenti sendiri saat kurva lulus (curve.rs `parse` → None) atau pair > 24 jam (peta.rs) → tak ada titik,
 * tak ada polling baru → chart diam. Tak ada candle karangan.
 */
// diekspor hanya utk uji simulasi (scratchpad); tak diimpor kode lain
export class DatafeedLokal {
  /* ⛔ P3 (AGEN-BUILD): dulu candle TERAKHIR dipatok ke `Date.now()` — candle launch 14 jam lalu tampil di jam
     sekarang, di SEMUA halaman token. Kini `t` (menit sejak pair terdeteksi, synt-dash `candles`) ditambahkan ke
     WAKTU TERDETEKSI (`mulaiMs` = waktu respons − `age_secs` /api/token, yang juga dihitung dari `detected_at`).
     Acuan tetap SEKALI (konstruktor): Pro memanggil `getHistoryKLineData()` berulang. */
  /** Candle per panjang periode (ms); dikosongkan tiap data berubah. */
  private readonly perPeriode = new Map<number, KLineData[]>()
  /** Candle 1m yang dibentuk dari titik SSE (menit → OHLC SOL), hanya utk menit yang belum final di server. */
  private readonly hidup = new Map<number, CandleRow>()
  /** Menit terbaru yang ada di `/api/candles`. Menit di bawahnya FINAL (lihat `perbarui`). */
  private menitPoll: number
  /** Menit (umur pair) saat aliran SSE (kembali) tersambung. Menit sesudahnya teramati SSE sejak detik pertamanya. */
  private menitSambung: number
  /** Titik pertama sejak (kembali) tersambung belum tiba → `menitSambung` dikoreksi dgn jam synt-stream sendiri. */
  private tungguTikPertama = true
  /** Menit khusus-SSE terbesar yang SUDAH masuk chart. Tak pernah disembunyikan lagi (sambung ulang tak boleh
   *  membuat candle mundur). */
  private menitDiterima = -1
  /** Callback Pro utk periode aktif (null = belum/tak berlangganan). */
  private langganan: { ms: number; cb: DatafeedSubscribeCallback } | null = null
  /** Candle terakhir yang dimiliki chart utk periode aktif — tak ada yang dikirim di belakangnya. */
  private terakhir: KLineData | null = null

  /**
   * @param kali kurs SOL→USD saat chart dibuat (1 = tetap SOL). Dipatok sekali: candle riwayat & candle hidup
   *   memakai kurs yang SAMA, jadi candle terakhir tak melompat karena kurs bergeser.
   */
  constructor(private rows: CandleRow[], private readonly mulaiMs: number, private readonly kali: number) {
    this.menitPoll = maksMenit(rows)
    this.menitSambung = this.menitKini()
  }

  /** Menit umur pair sekarang, dibulatkan ke ATAS 3 dtk (acuan `mulaiMs` meleset ±1-2 dtk) → menit tersambung
   *  tak pernah terlalu kecil, jadi menit yang SSE lihat sebagian tak dianggap utuh. */
  private menitKini(): number {
    return Math.floor((Date.now() + 3_000 - this.mulaiMs) / 60_000)
  }

  /** Pencarian simbol tak dipakai — pair sudah ditentukan halamannya. */
  async searchSymbols(): Promise<SymbolInfo[]> {
    return []
  }

  /**
   * Baris 1m efektif = `/api/candles` + candle hidup utk menit yang belum final.
   * Menit = menit terbaru polling: open dari server (ia melihat menit itu sejak awal), high/low digabung, close dari
   * SSE (titik terbaru yang diketahui). Menit sesudahnya hanya ada di SSE → candle dari titik SSE saja.
   *
   * ⚠️ Terukur 25 Okt: `/api/candles` TERTINGGAL 2-3 menit dari SSE (pair 17 mnt: candle terakhir t=15). Menit di
   * antara candle polling terakhir dan saat SSE tersambung tak dilihat SSE; bila candle hidup sudah digambar di
   * depannya, candle server utk menit itu datang belakangan dan klinecharts menolaknya (lebih lama dari candle
   * terakhir) → lubang permanen. Maka candle KHUSUS-SSE baru dipakai setelah polling menyusul menit tersambung;
   * sebelum itu titik SSE hanya disimpan (dan menggerakkan menit terbaru polling).
   */
  private baris(): CandleRow[] {
    if (!this.hidup.size) return this.rows
    const peta = new Map(this.rows.map((r) => [r.t, r]))
    const batas = this.menitPoll >= this.menitSambung ? Infinity : this.menitPoll
    for (const [t, h] of this.hidup) {
      if (t < this.menitPoll) continue
      const p = peta.get(t)
      // Putaran 2: menit yang sudah diterima chart TETAP tampil walau sambung ulang menaikkan `menitSambung`
      // (dulu disembunyikan lagi → ember 5m/15m/1H berjalan sempat mundur). Hanya menit sesudahnya yang ditahan.
      const diterima = !p && t <= this.menitDiterima
      if (!diterima) {
        if (t > batas) continue
        // menit yang SSE lihat sebagian (sebelum/saat tersambung) tak pernah jadi candle tanpa versi server
        if (!p && t <= this.menitSambung) continue
      }
      // `baris()` hanya dihitung utk chart (muat riwayat / kirim) → menit khusus-SSE di sini = tergambar
      if (!p && t > this.menitDiterima) this.menitDiterima = t
      peta.set(
        t,
        p
          ? {
              t,
              o: p.o,
              h: Math.max(p.h, h.h),
              l: Math.min(p.l, h.l),
              c: h.c,
              vol_sol: Math.max(p.vol_sol, h.vol_sol),
              n: Math.max(p.n, h.n),
            }
          : h,
      )
    }
    return [...peta.values()]
  }

  /**
   * ⭐ P3 putaran 2: candle DIGABUNG per periode yang dipilih di Pro (1m/5m/15m/1H). Dulu Period diabaikan →
   * tombol 5m/15m/1H menampilkan candle 1m di bawah label itu.
   * Baris sumber = candle 1m `/api/candles` (PriceChartLive selalu meminta tf=1). Ember = awal periode jam dinding
   * (floor epoch, sama dgn cara Pro menghitung jendela). OHLC: open pertama, high maks, low min, close terakhir.
   * Volume = MAKS, bukan jumlah: `vol_sol` BUKAN SOL yang bergerak — synt-stream `candle.rs` serap() menulis
   * `vol_sol = max(likuiditas)` = cadangan SOL kurva tertinggi dalam menit itu (sebuah LEVEL; komentar migrasi 039
   * keliru). Menjumlahkannya mengarang volume (1H ≈ 60× cadangan). Sama dgn synt-dash `candles` tf>1 (`max`).
   */
  private candle(ms: number): KLineData[] {
    const ada = this.perPeriode.get(ms)
    if (ada) return ada
    const ember = new Map<number, KLineData>()
    const k = this.kali
    /* ⛔ Candle ber-`n === 1` DIBUANG — OHLC-nya identik karena hanya satu sampel; menggambarnya menyiratkan
       pergerakan yang tak pernah terukur. Berlaku sama utk candle hidup (muncul begitu menitnya punya 2 titik).
       Urut menurut `t` supaya open/close = pertama/terakhir. */
    for (const c of this.baris().filter((c) => c.n > 1 && c.o > 0).sort((x, y) => x.t - y.t)) {
      const ts = this.mulaiMs + c.t * 60_000
      const b = Math.floor(ts / ms) * ms
      const e = ember.get(b)
      if (!e) {
        // ⚠️ `volume` = cadangan SOL kurva (lihat di atas), bukan volume beli+jual; nama slotnya milik Pro.
        ember.set(b, { timestamp: b, open: c.o * k, high: c.h * k, low: c.l * k, close: c.c * k, volume: c.vol_sol })
      } else {
        e.high = Math.max(e.high, c.h * k)
        e.low = Math.min(e.low, c.l * k)
        e.close = c.c * k
        e.volume = Math.max(e.volume ?? 0, c.vol_sol)
      }
    }
    const hasil = [...ember.values()].sort((x, y) => x.timestamp - y.timestamp)
    this.perPeriode.set(ms, hasil)
    return hasil
  }

  /**
   * ⭐ P3 putaran 2: muat awal vs loadMore dikenali dari DATA, bukan jam.
   * Muat awal Pro: `to` = sekarang dibulatkan ke periode (≥ candle tertua, karena semua candle ≤ sekarang) →
   * kembalikan SEMUA candle, termasuk candle di menit berjalan (dulu `ts < to` membuangnya pada pair hidup) dan
   * candle yang lebih tua dari jendela 500 periode (pair 14 jam pada 1m).
   * loadMore Pro: `to` = candle tertua − 1 periode (< candle tertua) → semua sudah terkirim → [] = "tak ada lagi".
   * Tak ada data ganda, dan tak bergantung pada batas menit jam dinding.
   * P4: muat awal mencatat candle terakhir yang kini dimiliki chart — pembaruan hidup hanya menyentuh candle itu
   * atau yang lebih baru (`kirim`).
   */
  async getHistoryKLineData(_s: SymbolInfo, p: Period, _from: number, to: number) {
    const semua = this.candle(msPeriode(p))
    const tertua = semua[0]
    if (!tertua || to < tertua.timestamp) {
      // muat awal tanpa candle (semua n = 1): chart kosong, candle hidup pertama boleh masuk
      if (!tertua) this.terakhir = null
      return []
    }
    this.terakhir = semua[semua.length - 1] ?? null
    return semua.map((k) => ({ ...k }))
  }

  /** Pro memanggil ini setelah muat awal tiap periode (dan `unsubscribe` sebelum ganti periode). */
  subscribe(_s: SymbolInfo, p: Period, cb: DatafeedSubscribeCallback): void {
    this.langganan = { ms: msPeriode(p), cb }
    // data yang tiba saat Pro sedang memuat riwayat langsung menyusul
    this.kirim()
  }

  unsubscribe(): void {
    this.langganan = null
  }

  /** Polling `/api/candles` pulang (induk). */
  perbarui(rows: CandleRow[]): void {
    if (rows === this.rows) return
    this.rows = rows
    this.menitPoll = maksMenit(rows)
    /* Menit < menit terbaru polling sudah FINAL: candle.rs `flush` menulis menit lama untuk TERAKHIR kalinya pada
       flush yang sama yang pertama kali menulis menit sesudahnya, lalu membuangnya dari peta. Candle hidupnya
       tak diperlukan lagi. */
    for (const t of this.hidup.keys()) if (t < this.menitPoll) this.hidup.delete(t)
    this.perPeriode.clear()
    this.kirim()
  }

  /** Aliran SSE (kembali) tersambung — EventSource menyambung ulang sendiri setelah gangguan; titik selama putus
   *  hilang, jadi menit itu menunggu server lagi. */
  sambung(): void {
    this.menitSambung = this.menitKini()
    this.tungguTikPertama = true
  }

  /** Satu titik SSE. */
  tik({ detik, harga, liq }: TikHidup): void {
    // harga 0 = kurva dikosongkan saat lulus (candle.rs menolaknya juga)
    if (!(harga > 0) || !Number.isFinite(harga) || !Number.isFinite(detik) || detik < 0) return
    const t = Math.floor(detik / 60)
    /* Putaran 2: `mulaiMs` = jam browser − `age_secs` /api/token yang bisa basi ±5 dtk → `menitKini()` bisa satu
       menit terlalu kecil, dan menit yang SSE lihat sebagian lolos jadi candle khusus-SSE berOHLC tak lengkap.
       Titik pertama membawa umur dari jam synt-stream sendiri (`pair_age_secs`): menit tersambung ≥ menitnya. */
    if (this.tungguTikPertama) {
      this.tungguTikPertama = false
      if (t > this.menitSambung) this.menitSambung = t
    }
    if (t < this.menitPoll) return
    const v = Number.isFinite(liq) ? liq : 0
    const e = this.hidup.get(t)
    if (!e) {
      this.hidup.set(t, { t, o: harga, h: harga, l: harga, c: harga, vol_sol: v, n: 1 })
    } else {
      e.h = Math.max(e.h, harga)
      e.l = Math.min(e.l, harga)
      e.c = harga
      e.vol_sol = Math.max(e.vol_sol, v)
      e.n += 1
    }
    this.perPeriode.clear()
    this.kirim()
  }

  /**
   * Kirim ke Pro candle periode aktif yang BERUBAH, mulai dari candle terakhir chart: yang sama timestamp-nya
   * menggantikan, yang lebih baru ditambahkan berurutan. Candle lebih lama tak pernah dikirim (klinecharts akan
   * mengabaikannya) → tanpa candle ganda, tanpa lompatan waktu. Candle identik tak dikirim ulang.
   * ⚠️ Akibatnya: versi server sebuah menit yang tiba SETELAH candle hidup sesudahnya tergambar tak lagi mengubah
   * chart (selisihnya hanya titik yang SSE lewatkan, mis. siaran tertinggal); ganti periode / muat ulang memakainya.
   */
  private kirim(): void {
    const l = this.langganan
    if (!l) return
    for (const k of this.candle(l.ms)) {
      const a = this.terakhir
      if (a && k.timestamp < a.timestamp) continue
      if (
        a &&
        k.timestamp === a.timestamp &&
        k.open === a.open &&
        k.high === a.high &&
        k.low === a.low &&
        k.close === a.close &&
        k.volume === a.volume
      ) {
        continue
      }
      this.terakhir = k
      l.cb({ ...k })
    }
  }
}

function msPeriode(p: Period): number {
  return p.multiplier * (p.timespan === 'hour' ? 3_600_000 : 60_000)
}

function maksMenit(rows: CandleRow[]): number {
  let m = -1
  for (const r of rows) if (r.t > m) m = r.t
  return m
}

/* ⛔ P5 (AGEN-BUILD): `vol_sol` BUKAN volume perdagangan — synt-stream `candle.rs` menulis `max(likuiditas)` =
   cadangan SOL kurva TERTINGGI dalam menit itu (sebuah LEVEL). Pane bawah memakai indikator SENDIRI `CURVE_SOL`
   (putaran 2: dulu menimpa 'VOL', tapi modal gear Pro tetap berjudul "VOL" dgn 5 parameter MA mati). Menu Pro
   (CURVE_SOL ganti VOL, OBV/VR/PVT/EMV dibuang, gear tanpa modal) ditambal plugin `klinecharts-pro-kurva`
   (vite.config.ts). `VOL` bawaan klinecharts tetap terdaftar tapi tak terjangkau dari UI. */
function daftarIndikatorKurva(warna: string) {
  registerIndicator({
    name: 'CURVE_SOL',
    shortName: 'CURVE SOL',
    precision: 1,
    minValue: 0,
    calcParams: [],
    figures: [{ key: 'kurva', title: 'SOL in curve: ', type: 'bar', baseValue: 0, styles: () => ({ color: warna }) }],
    calc: (list: KLineData[]) => list.map((k) => ({ kurva: k.volume ?? 0 })),
  })
}

/**
 * A5: instance klinecharts di balik Pro. Pro 0.1.1 tak memaparkannya; plugin build `klinecharts-pro-kurva`
 * (vite.config.ts, gagal-keras) menambahkan `getChart()` ke API internalnya. Chart Pro dibuat saat Solid memasang
 * komponennya → bisa belum ada tepat setelah konstruktor.
 */
export function chartDiBalik(pro: KLineChartPro): Chart | null {
  const api = (pro as unknown as { _chartApi?: { getChart?: () => Chart | null | undefined } | null })._chartApi
  return api?.getChart?.() ?? null
}

export function PriceChartPro({
  mint,
  symbol,
  candles,
  kurs,
  mulaiMs,
  langganTik,
  memuat = false,
  gagal = false,
  basiSejak,
}: {
  mint: string
  symbol: string
  /** Candle 1m `/api/candles`, harga dlm SOL (mentah). */
  candles: CandleRow[] | null
  /** Kurs SOL→USD asli dari API, atau null → chart tetap SOL & berlabel SOL. */
  kurs: number | null
  /** P3: waktu pair terdeteksi (epoch ms). null = tak diketahui → chart TIDAK digambar (tak ada jam palsu). */
  mulaiMs: number | null
  /** P4: titik harga hidup (SSE). Dibuka saat chart dibuat, dilepas saat chart dibongkar. */
  langganTik?: LanggananTik
  /** A5: `/api/candles` belum menjawab sama sekali → skeleton (bukan "Waiting for the first candles"). */
  memuat?: boolean
  /** A5: polling gagal. Tanpa data → "Couldn't load"; dgn data → data terakhir tetap + catatan. */
  gagal?: boolean
  /** Epoch ms jawaban candle sukses terakhir. */
  basiSejak?: number | null
}) {
  const wadah = useRef<HTMLDivElement>(null)
  const chart = useRef<KLineChartPro | null>(null)
  /* Candle disimpan di ref supaya efek pembangunan chart TIDAK bergantung
     padanya: `usePolling` mengganti array tiap 20 detik, dan membangun ulang
     chart tiap kali membuat sumbu waktu tampak mengulang serta menumpuk
     instance Pro yang lama. */
  const dataRef = useRef(candles)
  dataRef.current = candles
  // dibaca saat chart dibuat; `age_secs` berubah tiap polling (±1 dtk) dan tak boleh membangun ulang chart
  const mulaiRef = useRef(mulaiMs)
  mulaiRef.current = mulaiMs
  const punyaMulai = mulaiMs !== null
  const mataUang: 'usd' | 'sol' = kurs ? 'usd' : 'sol'
  const kursRef = useRef(kurs)
  kursRef.current = kurs
  const langganRef = useRef(langganTik)
  langganRef.current = langganTik
  const feed = useRef<DatafeedLokal | null>(null)
  /** Instance klinecharts di balik Pro (strip OHLC) & wadah strip yang disisipkan di antara bilah Pro dan kanvas. */
  const [kc, setKc] = useState<Chart | null>(null)
  const [hostStrip, setHostStrip] = useState<HTMLDivElement | null>(null)
  const tz = useRef(zonaPembaca()).current

  const punyaData = !!candles?.length

  useEffect(() => {
    if (!wadah.current || !dataRef.current?.length || mulaiRef.current === null) return

    const gaya = getComputedStyle(document.documentElement)
    const t = (n: string, jatuh: string) => gaya.getPropertyValue(n).trim() || jatuh
    // sebelum Pro membuat pane default `CURVE_SOL`
    daftarIndikatorKurva(t('--line-strong', '#5f594a'))
    pasangLipatHarga()

    // A5: ponsel → bilah alat gambar Pro tertutup di awal (52px plot kembali); tombol menu Pro tetap membukanya
    const sempit = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches
    const df = new DatafeedLokal(dataRef.current, mulaiRef.current, kursRef.current ?? 1)
    feed.current = df
    const c = new KLineChartPro({
      container: wadah.current,
      theme: 'dark',
      locale: 'en-US',
      symbol: {
        ticker: mint,
        name: symbol,
        shortName: symbol,
        exchange: 'pump.fun',
        market: 'crypto',
        pricePrecision: 9,
        volumePrecision: 1,
        // ⛔ dulu selalu 'usd' padahal /api/candles berisi SOL (salah ±100×). Kini mengikuti satuan yang dikirim induk.
        priceCurrency: mataUang,
        type: 'crypto',
      },
      /* ⛔ P3: tanpa ini Pro memakai default 'Asia/Shanghai' (UTC+8) → jam chart 1 jam lebih maju dari WIB pembaca.
         Zona waktu PEMBACA (browser); pilihan Timezone di toolbar tetap bisa menggantinya. */
      timezone: tz,
      period: { multiplier: 1, timespan: 'minute', text: '1m' },
      periods: [
        { multiplier: 1, timespan: 'minute', text: '1m' },
        { multiplier: 5, timespan: 'minute', text: '5m' },
        { multiplier: 15, timespan: 'minute', text: '15m' },
        { multiplier: 1, timespan: 'hour', text: '1h' },
      ],
      // P5: pane bawah = cadangan kurva berlabel jujur, bukan VOL bawaan Pro
      subIndicators: ['CURVE_SOL'],
      datafeed: df as unknown as DefaultDatafeed,
      drawingBarVisible: !sempit,
    })

    chart.current = c
    // P4: titik hidup masuk ke datafeed, Pro meneruskannya lewat callback subscribe (tanpa membangun ulang chart)
    const lepas = langganRef.current?.((t) => df.tik(t), () => df.sambung())

    /* ⛔ Lipatan desimal klinecharts ("0.0{5}2160" tampil MENTAH di sumbu & OHLC) dimatikan saat BUILD — plugin
       `klinecharts-tanpa-lipat` di vite.config.ts (Pro tak meneruskan opsi decimalFoldThreshold ke init()). */

    /* ⭐ A5: gaya kanvas BERSAMA chart BNB (`gayakanKanvas`, chart/kanvas.ts): font mono di SELURUH kanvas (dulu serif
       bawaan), warna --up/--down/--mute-2/--line dari tokens.css saat runtime, harga subskrip, tooltip kanvas mati
       (OHLC pindah ke strip HTML). Gaya ditulis lewat Pro (`c.setStyles`, supaya modal Setting Pro ikut tahu),
       font dibaca dari chart di baliknya. Struktur, toolbar & indikator Pro tetap bekerja. */
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
      // pane CURVE SOL (P5) mewarnai batangnya sendiri (`daftarIndikatorKurva`, --line-strong netral)
      /* ≤760: legenda indikator (MA…, CURVE SOL) hanya saat crosshair aktif — selalu-tampil ia membungkus 2 baris dan
         menutupi candle teratas di layar sempit. Ikonnya (mata/gear/tutup) tetap terjangkau saat crosshair aktif;
         indikator juga tetap diatur dari menu Indicator. */
      const gayakan = () =>
        gayakanKanvas(
          { getStyles: () => k.getStyles(), setStyles: (s) => c.setStyles(s) },
          sempit ? { indicator: { tooltip: { showRule: 'follow_cross' as never } } } : undefined,
        )
      gayakan()
      // strip OHLC di antara bilah periode Pro & kanvas (bukan di atas candle)
      bilah.after(host)
      setHostStrip(host)
      setKc(k)
      k.resize()
      // tinggi isi berubah saat catatan data lama muncul/hilang di bawah strip → kanvas diukur ulang
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
      lepas?.()
      feed.current = null
      /* Pro tak memaparkan `destroy()` publik di 0.1.1; wadahnya dikosongkan
         supaya instance lama tak menumpuk saat pair berganti. */
      chart.current = null
      if (wadah.current) wadah.current.innerHTML = ''
    }
    /* ⚠️ Hanya `mint` & `punyaData`. Menambahkan `candles` di sini adalah
       penyebab sumbu berulang: tiap polling melahirkan chart baru.
       `mataUang` ikut: kurs SOL bisa tiba SESUDAH chart dibuat → angka berubah ke USD, label harus ikut (dibuat ulang SEKALI). */
  }, [mint, symbol, punyaData, mataUang, punyaMulai])

  /* ⭐ P4: polling `/api/candles` yang pulang diteruskan ke chart yang SUDAH ada (datafeed → callback subscribe Pro),
     bukan membangun ulang. Saat chart baru dibuat, datafeed sudah memegang baris yang sama → tak ada yang dikirim. */
  useEffect(() => {
    if (candles) feed.current?.perbarui(candles)
  }, [candles])

  const hover = useCrosshair(kc, wadah.current)
  const terakhir = useCandleTerakhir(kc)

  if (!candles?.length) {
    if (memuat) return <ChartSkeleton />
    if (gagal) return <ChartGagal />
    return (
      <div className="pcp-empty">
        <p>Waiting for the first candles.</p>
        <p className="pcp-empty-sub">
          A pair needs a few minutes of trades before a chart means anything.
        </p>
      </div>
    )
  }

  /* ⭐ P3: tanpa waktu terdeteksi, sumbu waktu Pro hanya bisa menulis jam dinding (format tanggal Pro tak bisa
     diganti dari luar: customApi.formatDate dipasang internal) → jam itu pasti karangan. Chart tak digambar. */
  if (mulaiMs === null) {
    return (
      <div className="pcp-empty">
        <p>Chart unavailable.</p>
        <p className="pcp-empty-sub">The launch time of this pair is unknown, so candle times can't be placed.</p>
      </div>
    )
  }

  return (
    <>
      <div className="pcp" ref={wadah} />
      {hostStrip &&
        createPortal(
          <>
            <StripOhlc
              k={hover ?? terakhir}
              hover={!!hover}
              satuan={mataUang === 'usd' ? 'USD' : 'SOL'}
              tz={kc?.getTimezone() || tz}
              ekstra={(k) => [{ label: 'SOL in curve', value: k.volume != null ? k.volume.toFixed(1) : '—' }]}
            />
            {gagal && <CatatanBasi sejak={basiSejak ?? null} />}
          </>,
          hostStrip,
        )}
      <p className="pcp-note">
        Lower pane: SOL held in the bonding curve, at its highest in each candle. It is not traded volume.
      </p>
    </>
  )
}
