import type { Chart, DeepPartial, KLineData, Styles } from 'klinecharts'
import { angkaHarga } from '@/lib/format'

/* ─────────────────────────────────────────────────────────────────────────
   A5 (DESIGN-TERMINAL §2 ChartFrame): SATU pembungkus gaya kanvas utk chart token SOL (KLineChart Pro) & BNB
   (klinecharts polos). Kedua chart memanggil `gayakanKanvas(chart)` → font, warna & ukuran teks kanvas sama.

   ⭐ Semua nilai dibaca dari CSS variable `tokens.css` SAAT RUNTIME (bukan literal): kanvas tak mewarisi CSS, jadi
   tanpa ini klinecharts jatuh ke font bawaannya ("Helvetica Neue" → serif bawaan browser bila tak terpasang) dan
   hijau-merahnya sendiri.
   ⭐ Harga di kanvas (sumbu-y, label crosshair, penanda harga, legenda indikator) = `angkaHarga` lib/format.ts lewat
   kait `__syntLipatDesimal` yang ditanam plugin build `klinecharts-tanpa-lipat` (vite.config.ts) ke `formatFoldDecimal`.
   ───────────────────────────────────────────────────────────────────────── */

function token(gaya: CSSStyleDeclaration, nama: string, jatuh: string): string {
  return gaya.getPropertyValue(nama).trim() || jatuh
}

function px(gaya: CSSStyleDeclaration, nama: string, jatuh: number): number {
  const v = parseFloat(gaya.getPropertyValue(nama))
  return Number.isFinite(v) && v > 0 ? v : jatuh
}

/**
 * Teks angka dari klinecharts (sudah `toFixed(presisi)`, mungkin bersekat ribuan) → format kartu.
 * Hanya angka ber-≥4 desimal (= presisi harga; indikator CURVE SOL 1 desimal tak tersentuh). null = biarkan.
 */
export function lipatHarga(teks: string): string | null {
  const bersih = teks.replace(/,/g, '')
  const m = /^(-?)\d+\.(\d+)$/.exec(bersih)
  if (!m || (m[2]?.length ?? 0) < 4) return null
  const n = Math.abs(Number(bersih))
  if (!Number.isFinite(n)) return null
  if (n === 0) return '0'
  return `${m[1]}${angkaHarga(n)}`
}

declare global {
  // eslint-disable-next-line no-var
  var __syntLipatDesimal: ((teks: string) => string | null) | undefined
}

/** Dipasang sekali sebelum chart pertama dibuat (idempoten). */
export function pasangLipatHarga(): void {
  globalThis.__syntLipatDesimal = lipatHarga
}

/** Kunci gaya klinecharts yang berisi nama font. `icons` dilewati: ikon legenda Pro memakai font ikon (icomoon). */
const KUNCI_FONT = new Set(['family', 'textFamily', 'fontFamily'])

function ganti(obj: unknown, font: string): unknown {
  if (Array.isArray(obj)) return obj.map((x) => ganti(x, font))
  if (!obj || typeof obj !== 'object') return obj
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === 'icons') continue
    if (KUNCI_FONT.has(k) && typeof v === 'string') out[k] = font
    else if (v && typeof v === 'object') out[k] = ganti(v, font)
  }
  return out
}

/** Bagian chart yang memanggil setStyles: chart klinecharts, atau KLineChartPro (meneruskannya ke chart di baliknya). */
interface PunyaGaya {
  getStyles(): Styles
  setStyles(s: DeepPartial<Styles>): void
}

/**
 * Font mono + warna token di SELURUH kanvas. `ekstra` digabung terakhir (mis. judul tooltip per chain).
 * Dipanggil ulang setelah `document.fonts.ready` supaya ukuran sumbu dihitung dgn Geist Mono yang sudah termuat.
 */
export function gayakanKanvas(c: PunyaGaya, ekstra?: DeepPartial<Styles>): void {
  const g = getComputedStyle(document.documentElement)
  const mono = token(g, '--font-mono', 'ui-monospace, monospace')
  const naik = token(g, '--up', '#8fae3e')
  const turun = token(g, '--down', '#cc5b44')
  const datar = token(g, '--mute-2', '#847c64')
  const garis = token(g, '--line', '#1e1a14')
  const garisKuat = token(g, '--line-strong', '#5f594a')
  const teks = token(g, '--mute-2', '#847c64')
  const tinta = token(g, '--ink', '#f4f2ec')
  const angkat = token(g, '--raise', '#14110b')
  const diAtasTerang = token(g, '--on-bright', '#14110b')
  const kecil = px(g, '--fs-sm', 11)

  // garis indikator (MA, BOLL, …): palet bawaan klinecharts (oranye/ungu/biru/merah muda) → token
  const paletGaris = ['--warn', '--info-2', '--accent-strong', '--dim', '--down'].map((n) => token(g, n, '#8a8268'))
  const garisIndikator = (c.getStyles().indicator?.lines ?? []).map((l, i) => ({ ...l, color: paletGaris[i % paletGaris.length]! }))

  // 1. font: setiap kunci font di gaya yang sedang berlaku (bawaan klinecharts + tema Pro)
  const font = ganti(c.getStyles(), mono) as DeepPartial<Styles>
  c.setStyles(font)

  // 2. warna & ukuran
  const teksKecil = { color: teks, size: kecil, family: mono }
  const labelSumbu = {
    color: tinta, size: kecil, family: mono,
    backgroundColor: angkat, borderColor: garisKuat, borderSize: 1,
  }
  c.setStyles({
    grid: { horizontal: { color: garis }, vertical: { color: garis } },
    candle: {
      bar: {
        upColor: naik, downColor: turun, noChangeColor: datar,
        upBorderColor: naik, downBorderColor: turun, noChangeBorderColor: datar,
        upWickColor: naik, downWickColor: turun, noChangeWickColor: datar,
      },
      priceMark: {
        high: { color: teks, textFamily: mono, textSize: kecil },
        low: { color: teks, textFamily: mono, textSize: kecil },
        last: {
          upColor: naik, downColor: turun, noChangeColor: datar,
          text: { family: mono, size: kecil, color: diAtasTerang },
        },
      },
      // ⭐ A5: OHLC TIDAK di kanvas lagi (di 390 tooltip kanvas menutupi candle) → strip HTML di atas kanvas
      tooltip: { showRule: 'none' as never },
    },
    indicator: {
      ohlc: { upColor: naik, downColor: turun, noChangeColor: datar },
      bars: [{ upColor: naik, downColor: turun, noChangeColor: datar }],
      lines: garisIndikator,
      tooltip: { text: { ...teksKecil } },
      lastValueMark: { text: { family: mono, size: kecil } },
    },
    xAxis: { axisLine: { color: garis }, tickLine: { color: garis }, tickText: { ...teksKecil } },
    yAxis: { axisLine: { color: garis }, tickLine: { color: garis }, tickText: { ...teksKecil } },
    separator: { color: garis },
    crosshair: {
      horizontal: { line: { color: garisKuat }, text: { ...labelSumbu } },
      vertical: { line: { color: garisKuat }, text: { ...labelSumbu } },
    },
  } as DeepPartial<Styles>)
  if (ekstra) c.setStyles(ekstra)
}

/**
 * ⭐ U7 (audit 7 Nov): chart yang BERHENTI di akhir data kurva (token lulus: candle hanya trade kurva). Penanda harga
 * terakhir bawaan (garis putus + label sumbu-y berwarna naik/turun, tampak lime) terbaca sbg harga KINI, padahal
 * kepala & kartu harga menulis harga pasar pasca-lulus (audit: $0.0₄3679 di chart vs $0.0001102 di kepala, ±3×).
 * Penanda dibuat NETRAL (warna batang CURVE SOL `--line-strong`, teks `--ink`); strip OHLC menulis "end of curve data"
 * alih-alih "latest" (`StripOhlc` `akhir`). Data candle tak berubah.
 */
export function gayaHargaAkhirKurva(): DeepPartial<Styles> {
  const g = getComputedStyle(document.documentElement)
  const netral = token(g, '--line-strong', '#5f594a')
  const tinta = token(g, '--ink', '#f4f2ec')
  return {
    candle: {
      priceMark: {
        last: { upColor: netral, downColor: netral, noChangeColor: netral, text: { color: tinta } },
      },
    },
  } as DeepPartial<Styles>
}

/** Gaya ulang setelah webfont siap (ukuran sumbu-y dihitung dari lebar teks). */
export function setelahFontSiap(f: () => void): void {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts?.ready) void fonts.ready.then(f)
}

export function zonaPembaca(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC'
  } catch {
    return 'Etc/UTC'
  }
}

/* ── Periode ── */

export interface Periode {
  teks: string
  ms: number
}

/** Seg periode bersama kedua chain (DESIGN §2 ChartFrame: 1m/5m/15m/1h). */
export const PERIODE: Periode[] = [
  { teks: '1m', ms: 60_000 },
  { teks: '5m', ms: 300_000 },
  { teks: '15m', ms: 900_000 },
  { teks: '1h', ms: 3_600_000 },
]

/**
 * Candle 1m → periode lebih panjang, DI KLIEN (sama dgn cara Pro/DatafeedLokal SOL): ember = awal periode jam dinding
 * (floor epoch); open pertama, high maks, low min, close terakhir. Menit tanpa trade tak dikarang: ember hanya
 * memuat menit yang ada. Masukan wajib urut naik.
 */
export function gabungPeriode(rows: KLineData[], ms: number): KLineData[] {
  if (ms <= 60_000) return rows
  const out: KLineData[] = []
  for (const r of rows) {
    const b = Math.floor(r.timestamp / ms) * ms
    const e = out[out.length - 1]
    if (e && e.timestamp === b) {
      e.high = Math.max(e.high, r.high)
      e.low = Math.min(e.low, r.low)
      e.close = r.close
    } else {
      out.push({ timestamp: b, open: r.open, high: r.high, low: r.low, close: r.close })
    }
  }
  return out
}

/** Waktu candle utk strip OHLC: "Oct 28, 14:05" di zona waktu chart. */
export function waktuStrip(ts: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
  }
}

export type { Chart }
