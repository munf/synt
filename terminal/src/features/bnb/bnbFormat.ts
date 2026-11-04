import type { BnbCalibrationResponse, BnbCalibrationRow, BnbCandle, BnbLaunchpad, BnbOutcome, BnbTrenchItem } from '@/api/types'
import { harga, uang, umur } from '@/lib/format'

/* Label & format BNB — dipakai tabel, panel, halaman token, kartu kalibrasi (satu sumber supaya teksnya sama). */

export const LAUNCHPAD: Record<BnbLaunchpad, string> = { flap: 'Flap', fourmeme: 'four.meme' }

/**
 * ⛔ Putaran 2 (Reviewer): `rug` = "Rug", BUKAN "Collapsed". "Runtuh" (akhir < 0,6× harga detik-120) adalah sumbu LAIN
 * yang tak ada di kontrak; caveat server menyebut "rug". Definisi kualitatif, tanpa ambang; diukur 90 menit dari harga
 * menit ke-2 (caveat v1: "Rug is measured from the price at second 120").
 */
export const OUTCOME: Record<Exclude<BnbOutcome, null>, { label: string; cls: string; def: string }> = {
  rug: {
    label: 'Rug',
    cls: 'is-rug',
    def: 'Fell sharply from its peak, or sank without ever rising, within 90 minutes, measured from the price at minute 2.',
  },
  dead: { label: 'Dead', cls: 'is-dead', def: 'Never rose meaningfully above its minute 2 price.' },
  survive: { label: 'Survived', cls: 'is-survive', def: 'Rose after minute 2, but not enough, or not liquid enough, to count as a winner.' },
  winner: {
    label: 'Winner',
    cls: 'is-winner',
    def: 'Rose strongly, held the gain, and, where liquidity was measured, had enough to sell into.',
  },
}

/** Detik saat skor BNB dihitung (kontrak B11: detik-120). */
export const DETIK_SKOR = 120
/**
 * Jendela outcome synt-bnb 90 menit; baris `bnb_outcome` ditulis pelabel ±menit ke-92 (bnb.rs). 14b: chip "Open"
 * bertahan sampai outcome BENAR-BENAR ada (dulu terpotong di 90 mnt → "—" di menit 90-92). Lewat 3 jam tanpa label
 * → "—" (pelabel tertinggal / token tak dilabeli), bukan "Open" selamanya.
 */
export const DETIK_OUTCOME_MAKS = 3 * 3600

/* A2: uang/harga/umur/alamat kini dari formatter tunggal `@/lib/format` (sama dgn Solana). Alias tipis di bawah hanya
   menamai aturan BNB yang berbeda: likuiditas sisi quote < $1 bukan data (pelajaran 1c) → "—". */
export const tandaUsd = (n: number | null | undefined): string => uang(n)
export const tandaLikuiditas = (n: number | null | undefined): string => uang(n, 'kosong')

export const tandaAngka = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US')

export const tandaPersen = (n: number | null | undefined, d = 1): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(d).replace(/\.0$/, '')}%`

/** Pajak transfer (Flap tax token): 0 / null → null (tak ditampilkan). */
export function pajak(bps: number | null | undefined): string | null {
  if (!bps || bps <= 0) return null
  return `Tax ${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

/**
 * Keadaan skor satu pair, dari `score_status` (kontrak B11 v1). `pending` = belum detik-120 / fitur belum dihitung;
 * `quiet` = terlalu sedikit pembeli luar di menit-2 → tidak dinilai; `none` = status tak dikenal tanpa skor.
 */
export type KeadaanSkor =
  | { kind: 'scored'; value: number; max: number; measured: number | null }
  | { kind: 'pending' }
  | { kind: 'quiet' }
  | { kind: 'none' }

export function keadaanSkor(it: Pick<BnbTrenchItem, 'score' | 'score_status' | 'age_secs'>): KeadaanSkor {
  if (it.score_status === 'scored' && it.score) {
    const { value, max } = it.score
    // 14b: `value`/`measured` = Option di bnb.rs. Skor tanpa nilai → "—" (tak dikarang); measured null → tak ditulis.
    if (value === null || !Number.isFinite(value) || !Number.isFinite(max)) return { kind: 'none' }
    const measured = it.score.measured !== null && Number.isFinite(it.score.measured) ? it.score.measured : null
    return { kind: 'scored', value, max, measured }
  }
  if (it.score_status === 'quiet') return { kind: 'quiet' }
  if (it.score_status === 'pending') return { kind: 'pending' }
  // status absen (respons lama): jatuh ke umur
  if (!it.score && Number.isFinite(it.age_secs) && it.age_secs < DETIK_SKOR) return { kind: 'pending' }
  return { kind: 'none' }
}

/** "2/4" atau "2/4 (3 measured)" bila tak semua sinyal terukur. */
export function teksSkor(k: { value: number; max: number; measured: number | null }): { utama: string; terukur: string | null } {
  return { utama: `${k.value}/${k.max}`, terukur: k.measured !== null && k.measured < k.max ? `(${k.measured} measured)` : null }
}

/** Harga: USD bila kurs diketahui; else dalam quote ("0.0₅21 CAKE"); else "—". */
export function tandaHargaPair(it: Pick<BnbTrenchItem, 'price_usd' | 'price_quote' | 'quote_symbol'>): string {
  if (it.price_usd !== null && Number.isFinite(it.price_usd) && it.price_usd > 0) return harga(it.price_usd)
  if (it.price_quote !== null && Number.isFinite(it.price_quote) && it.price_quote > 0) {
    return `${harga(it.price_quote).slice(1)} ${it.quote_symbol ?? 'quote'}`
  }
  return '—'
}

/**
 * 14b (preseden P2 Solana): harga yang terekam lebih lama dari ini ditulis "Price as of N ago", bukan seolah live.
 * `price_at` (bnb.rs) = trade kurva terakhir atau harga pool DEX terakhir yang terekam; bisa tertinggal jauh dari
 * sekarang (tanpa trade, atau celah rekaman pool) → umurnya ditulis, sebabnya tidak.
 * 10 mnt: di atas jeda trade normal pair aktif, jauh di bawah basi berjam-jam yang dimaksud.
 */
export const DETIK_HARGA_BASI = 10 * 60

/** "Price as of 2h 10m ago" bila `price_at` lebih tua dari DETIK_HARGA_BASI; else null (segar / tak diketahui). */
export function hargaBasi(it: Pick<BnbTrenchItem, 'price_at'>, sekarangMs = Date.now()): string | null {
  const t = parseMs(it.price_at)
  if (t === null) return null
  const d = (sekarangMs - t) / 1000
  return d > DETIK_HARGA_BASI ? `Price as of ${umur(d)} ago` : null
}

/** Tooltip sel MC/likuiditas: harga basi dan/atau USD tak diketahui. */
export function judulPasar(it: Pick<BnbTrenchItem, 'quote_symbol' | 'price_at'>, nilai: number | null): string | undefined {
  const bagian = [hargaBasi(it), judulUsd(it, nilai)].filter(Boolean)
  return bagian.length ? bagian.join('. ') : undefined
}

/** Judul (title) utk sel USD yang kosong karena kurs quote tak diketahui. */
export function judulUsd(it: Pick<BnbTrenchItem, 'quote_symbol'>, nilai: number | null): string | undefined {
  if (nilai !== null) return undefined
  const q = it.quote_symbol
  // kontrak v1: kurs USD dikenal hanya utk quote BNB/USDT/USD1
  return q && !['BNB', 'WBNB', 'USDT', 'USD1'].includes(q.toUpperCase())
    ? `USD value unknown: this pair is quoted in ${q}`
    : 'Not measured yet'
}

/**
 * ⛔ Skor SELALU disertai base rate (PRODUK.md §0): baris kalibrasi utk nilai skor yang sama, atau null.
 * ⚠️ Dicocokkan per `value` saja: kontrak B11 tak membawa versi skala di item feed; tabel & feed datang dari
 * engine yang sama (synt-dash wajib menyajikan kalibrasi versi skor yang berjalan).
 */
export function barisKalibrasi(cal: BnbCalibrationResponse | null, value: number): BnbCalibrationRow | null {
  if (!cal) return null
  return cal.rows.find((r) => r.score === value) ?? null
}

/**
 * ⭐ Skor audit BNB 0-100 (pemilik 28 Okt: "format seperti solana agar sama pembacaannya"). Sejak 29 Okt dipetakan
 * DI SERVER seperti Solana (synt-dash `bnb.rs` `tangga`, `/api/bnb/calibration` `tiers`): `100 − % rug` baris
 * kalibrasinya, plafon `score_cap` (97) selama tabel sementara, skor mentah yang jatuh ke angka sama sudah digabung.
 * Skor mentah engine (cek lolos 0-max) tetap kunci pencocokan; hanya ANGKA TAMPILAN yang 0-100.
 * ⛔ Tak dihitung ulang di klien: tanpa `tiers` → tangga kosong (tak ada angka audit), bukan tebakan dari `rows`.
 */
export interface TingkatBnb {
  skor: number
  n: number
  rug_pct: number
  winner_pct: number | null
  /** Skor mentah engine yang masuk tingkat ini (urut naik). */
  mentah: number[]
}

const tanggaCache = new WeakMap<BnbCalibrationResponse, TingkatBnb[]>()

/** Tangga skor audit BNB, skor menurun (91 → 50 seperti SOL). */
export function tanggaBnb(cal: BnbCalibrationResponse | null): TingkatBnb[] {
  if (!cal) return []
  const ada = tanggaCache.get(cal)
  if (ada) return ada
  const hasil = (cal.tiers ?? [])
    .filter((t) => Number.isFinite(t.score) && Number.isFinite(t.rug_pct))
    .map((t) => ({ skor: t.score, n: t.n, rug_pct: t.rug_pct, winner_pct: t.winner_pct, mentah: [...t.checks].sort((x, y) => x - y) }))
    .sort((x, y) => y.skor - x.skor)
  tanggaCache.set(cal, hasil)
  return hasil
}

/** Kalimat plafon utk teks penjelasan skor; '' bila server tak mengirim plafon. */
export function kalimatPlafon(cal: BnbCalibrationResponse | null): string {
  return cal?.score_cap != null ? ` Scores are capped at ${cal.score_cap} while the table is provisional.` : ''
}

/** Tingkat audit utk skor mentah `value`; null = kalibrasi belum ada / baris tanpa rug_pct. */
export function tingkatBnb(cal: BnbCalibrationResponse | null, value: number): TingkatBnb | null {
  return tanggaBnb(cal).find((t) => t.mentah.includes(value)) ?? null
}

/** Skor mentah → angka audit ("67 to 75"); mentah tanpa tingkat → null. */
export function rentangAuditBnb(cal: BnbCalibrationResponse | null, mentah: number[]): string | null {
  const xs = [...new Set(mentah.map((m) => tingkatBnb(cal, m)?.skor ?? null))]
  if (!xs.length || xs.some((x) => x === null)) return null
  const ys = (xs as number[]).sort((a, b) => a - b)
  return ys.length > 1 ? `${ys[0]} to ${ys[ys.length - 1]}` : String(ys[0])
}

/** Jumlah hari data kalibrasi: `days` server; tanpa itu dari periode (dibulatkan ke atas, min 1); else null. */
export function hariKalibrasi(cal: BnbCalibrationResponse): number | null {
  if (typeof cal.days === 'number' && Number.isFinite(cal.days) && cal.days > 0) return Math.round(cal.days)
  const a = Date.parse(cal.period?.from ?? '')
  const b = Date.parse(cal.period?.to ?? '')
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.max(1, Math.ceil((b - a) / 86_400_000))
}

/** Persen base rate: selalu satu desimal (1.2%, 24.6%), sama dgn tabel publik SOL. */
export function persenBase(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—'
  // 28 Okt: selalu satu desimal, seperti tabel publik SOL (20.5%, 49.7%) → satu cara membaca di dua chain
  return `${p.toFixed(1)}%`
}

/* A2: teks pendek base rate sel tabel ("4.6% rug") kini dirakit `modelSkorBnb` (BnbParts) utk `ScoreCell` bersama. */

/**
 * ⛔ P3: waktu candle dari DATA, bukan `Date.now()`. Kontrak B11 final (putaran 2): `t` = epoch unix DETIK awal menit
 * → `t × 1000`. Nilai tak sah → null (candle dilewati).
 */
export function waktuCandle(c: BnbCandle): number | null {
  return Number.isFinite(c.t) && c.t > 0 ? c.t * 1000 : null
}

export function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

