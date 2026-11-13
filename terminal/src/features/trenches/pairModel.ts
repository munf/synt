import type { BnbCalibrationResponse, BnbTrenchItem, TokenDetail as ApiToken, TrenchItem } from '@/api/types'
import { gambarToken, type SumberGambar } from '@/components/Avatar'
import { nadaDariBase } from '@/components/ScoreCell'
import { harga, umur } from '@/lib/format'
import { adaptTrench } from './adapt'
import type { RiskFactor, TrenchRow } from './types'
import { JUDUL_PASAR_BELUM, LABEL_PASAR_BELUM, SEBAB_SEJAK_TAK_TERCATAT, infoLikuiditasSol, menitJendela, mesinSegar, sejakLaunchTakTercatat } from '@/features/token/labels'
import {
  DETIK_OUTCOME_MAKS,
  DETIK_SKOR,
  LAUNCHPAD,
  OUTCOME,
  hargaBasi,
  keadaanSkor,
  pajak,
  tingkatBnb,
} from '@/features/bnb/bnbFormat'

/* ─────────────────────────────────────────────────────────────────────────
   ⭐ A3 (DESIGN-TERMINAL §2): SATU model baris/panel Trenches utk kedua chain. Adapter per chain (`adaptSol`,
   `adaptBnb`) menyelesaikan semua beda sumber di sini; `PairTable` & `PairPanel` tak pernah membaca respons API.

   Aturan yang ditegakkan adapter:
   · tak terukur = `{ v: null, why }` → UI menulis "—" yang bisa diketuk, TIDAK PERNAH 0;
   · skor selalu membawa base rate (PRODUK.md §0); nada dari base rate RUNTUH (§1.2, sama utk SOL & BNB);
   · angka skor, `checks`, base rate Solana diteruskan APA ADANYA (tabel publik beku), hanya tampilannya bersama.
   ───────────────────────────────────────────────────────────────────────── */

export type Chain = 'sol' | 'bnb'

/** Nilai yang bisa tak terukur; `why` = sebab "—" (popover ketuk). */
export interface Num {
  v: number | null
  why?: string
  /** U22: sumber/arti nilai yang ADA (popover ketuk di panel), mis. likuiditas SOL = sisi SOL saja. */
  info?: string
}

export type NadaTag = 'warn' | 'neutral'

export interface Tag {
  label: string
  tone: NadaTag
  info?: string
}

export interface Reason {
  /** Label chip pendek (tabel). */
  short: string
  /** Kalimat lengkap (popover & daftar alasan panel). */
  full: string
  /** true = menurunkan skor / sinyal gagal; null = tak terukur. */
  bad: boolean | null
}

export type Tone = 0 | 1 | 2 | 3 | 4

export type PairScore =
  | {
      kind: 'value'
      value: number
      max: number
      /** Base rate runtuh (%), dari tabel publik (SOL) / baris kalibrasi (BNB). null = belum ada. */
      rate: number | null
      /** SOL: porsi yang naik 3× pada skor ini (%, tabel publik), utk baris status kartu audit. null = tak ada. */
      rose: number | null
      /** Penyebut baris kalibrasi (BNB). */
      n: number | null
      tone: Tone
      spark?: number[]
      /** BNB: berapa sinyal terukur bila tak semua (tampil "(3 measured)"); null = semua / tak relevan. */
      measured: number | null
      /** BNB: jumlah sinyal (penyebut `measured`); skor tampil 0-100 sehingga `max` ≠ jumlah sinyal. */
      checksMax?: number
      /** Kalimat base rate SESUDAH angka persen ("of tokens at this score collapsed …"). */
      sentence: string
      /** "scored at 7m" (aside ScoreCard); null = tak diketahui. */
      scoredAt: string | null
      provisional: boolean
    }
  | { kind: 'quiet' | 'pending' | 'none'; title: string; sub: string; info: string }

export interface PairStatus {
  label: string
  tone: 'ok' | 'bad' | 'warn' | 'neutral' | 'muted' | 'open'
  prefix?: string
  info: string
}

export interface PairModel {
  chain: Chain
  id: string
  symbol: string
  name: string | null
  image: SumberGambar
  address: string
  href: string
  explorer: { name: 'Solscan' | 'BscScan'; url: string }
  launchpad: string | null
  /** Tag baris-2 identitas (urut: peringatan → quote non-BNB → pajak → launchpad). SOL: hanya label P2. */
  tags: Tag[]
  /** T1: tag yang ikut tampil di BARIS tabel (BNB: peringatan + quote non-BNB; pajak biasa & launchpad hanya di
      panel, spt baris SOL yang hanya membawa alamat). Tanpa field ini = `tags`. */
  rowTags?: Tag[]
  ageSecs: number | null
  price: Num & { text: string }
  /** "Price as of 2h 10m ago" (BNB) bila harga lama. */
  priceStale: string | null
  change: Num & { label: string }
  mcap: Num
  /** Likuiditas pool (SOL: kurva/AMM, BNB: pool DEX dua sisi). */
  liq: Num
  /** BNB belum lulus: dana quote di kurva (satu sisi, BUKAN likuiditas). */
  curveFunds: Num | null
  buys: number | null
  sells: number | null
  /** Catatan rentang buys/sells ("first 10 min" / "on the curve"). */
  bsNote: string
  holders: Num & { label: 'Holders' | 'Buyers'; note: string }
  curve: Num & { note?: string }
  score: PairScore
  /** Chip tabel (≤2): SOL faktor terberat, BNB sinyal gagal. */
  reasons: Reason[]
  /** Tak ada alasan gagal → teks netral ("No flag raised"); null → "—". */
  reasonsEmpty: string | null
  /** Sebab "—" di kolom alasan (popover ketuk). */
  reasonsWhy: string | null
  /** Daftar alasan lengkap panel. */
  reasonsFull: Reason[]
  /** BNB outcome 90 mnt; null = tak ditampilkan. */
  status: PairStatus | null
  /** T1: sebab "—" di slot outcome (BNB) bila `status` null. */
  statusWhy?: string
  /** SOL Trending: lintasan skor. */
  trend: PairStatus | null
  /** SOL Graduated: retensi harga 0-100. */
  retention: Num
  /** T1: perubahan harga SEJAK LAUNCH (%) utk kolom MOVE. SOL = `change`; BNB tak punya harga awal → null + sebab. */
  move: Num
  /** Catatan quote BNB ("Quoted in BNCB. …"). */
  quoteNote: string | null
  /** SOL: bisa dibeli lewat Quick buy (contoh). */
  buy: boolean
  /** SOL: penjelasan agen saat penilaian (sudah lewat kamus penerjemah mesin). null = tak ada. */
  explanation: string | null
  /** SOL: status jendela skor ("Final. Last scored 3h ago." / "… can still change for about 2m."). */
  scoreWindow: string | null
  /** A6 (filter "Tax ≤ 5%"): pajak transfer BNB dlm basis poin; null = tak terukur (four.meme); SOL tak ada. */
  taxBps?: number | null
}

/* ── format bersama ─────────────────────────────────────────────────────── */

/** Base rate: 1 desimal < 10% (1.2% vs 4.6% berbeda arti); ≥ 10% tetap 1 desimal bila nilainya berdesimal (skala
    publik 20.5%, 24.9%). Satu fungsi utk kedua chain → "collapsed" tampil sama. */
export function rate(v: number): string {
  if (v < 10) return `${v.toFixed(1)}%`
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`
}

/** Δ harga: tanda tipografis, 1 desimal < 10%, bulat ≥ 10% (DESIGN §4.2). |Δ| < 0,05 = datar. */
export function delta(v: number): { text: string; cls: 'is-up' | 'is-down' | 'is-flat' } {
  const a = Math.abs(v)
  if (a < 0.05) return { text: '0.0%', cls: 'is-flat' }
  const t = a < 10 ? a.toFixed(1) : Math.round(a).toLocaleString('en-US')
  return v > 0 ? { text: `+${t}%`, cls: 'is-up' } : { text: `−${t}%`, cls: 'is-down' }
}

/** Hitungan ringkas utk buys/sells/pembeli: 2400 → "2.4K". */
export function hitung(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n < 1000) return String(Math.round(n))
  if (n < 1e6) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
}

/**
 * Simbol/quote utk tampilan: buang spasi lebar-nol & spasi rambut (feed BNB memuat mis. "X\u200aT\u200aO") lalu trim.
 * Teks asli tetap dipakai sbg `title`.
 */
export function rapiSimbol(s: string | null | undefined): string {
  return (s ?? '').replace(/[\u2000-\u200f\u2028-\u202f\u205f-\u206f\ufeff]/g, '').trim()
}

/* ── Solana ─────────────────────────────────────────────────────────────── */

/** Label faktor (sama dgn kolom TOP RISK lama, kini chip ≤2). */
const FAKTOR: Record<RiskFactor['kind'], { short: (v: number) => string; full: (v: number) => string }> = {
  holders: { short: (v) => `Top10 ${Math.round(v)}%`, full: (v) => `Top 10 holders own ${v.toFixed(1)}% of supply` },
  devHolding: { short: (v) => `Dev ${Math.round(Math.max(0, v))}%`, full: (v) => `Creator holds ${Math.max(0, v).toFixed(1)}% of supply` },
  snipers: { short: (v) => `Snipe ${Math.round(v)}%`, full: (v) => `Snipers hold ${v.toFixed(1)}% of supply` },
  insiders: { short: (v) => `Conc ${Math.round(v)}%`, full: (v) => `Buyer concentration ${Math.round(v)} on a 0 to 100 scale` },
  bundler: { short: (v) => `Slot ${Math.round(v)}`, full: (v) => `${Math.round(v)} buys in the same slot` },
  authority: { short: () => 'Auth', full: () => 'Mint or freeze authority still active' },
  blacklist: {
    short: (v) => `Flagged ${Math.round(v)}`,
    full: (v) => `${Math.round(v)} ${Math.round(v) === 1 ? 'wallet' : 'wallets'} that appeared in earlier collapses`,
  },
}

const TREND: Record<string, PairStatus> = {
  held: { label: 'Held', tone: 'ok', info: 'Audit score held during scoring. Not a price move.' },
  // R1: amber seperti preview (`.tt-flag.is-warn`): naik ke skor itu terukur lebih buruk daripada bertahan di sana
  climbed: { label: 'Climbed', tone: 'warn', info: 'Audit score climbed during scoring. Not a price move.' },
  fell: { label: 'Fell', tone: 'bad', info: 'Audit score fell during scoring. Not a price move.' },
}

/** Data tambahan dari `/api/token` (panel): waktu skor & jendela ukur. Boleh absen. */
export type SolDetail = Pick<ApiToken, 'mint' | 'name'> & {
  scored_at_age_secs?: number | null
  scored_ago_secs?: number | null
  window_secs?: number | null
  explanation?: string | null
}

/** Batas jendela penilaian SOL (detik umur): skor bergerak di 60-500, sesudahnya final (= token/adapt.ts `scoring`). */
const JENDELA_AKHIR = 500

/** Kalimat status jendela skor, sama dgn panel lama (`ScoringWindow`): final / masih bisa berubah. */
function statusJendela(d: SolDetail | null): string | null {
  if (!d || d.scored_at_age_secs == null || d.scored_ago_secs == null) return null
  const pada = Math.max(60, Math.min(JENDELA_AKHIR, d.scored_at_age_secs))
  const kini = pada + d.scored_ago_secs
  if (pada >= JENDELA_AKHIR || kini >= JENDELA_AKHIR) return `Final. Last scored ${umur(d.scored_ago_secs)} ago.`
  return `Last scored ${umur(d.scored_ago_secs)} ago. It can still change for about ${umur(JENDELA_AKHIR - kini)}.`
}

/**
 * Item `/api/trenches` (+ detail `/api/token` opsional) → model. Faktor risiko, P2 (pasar pasca-lulus belum dimuat),
 * likuiditas & kurs SOL tetap dari `adaptTrench` (satu sumber aturan; kurs disetel pemanggil lewat `setSolUsd`).
 */
export function adaptSol(it: TrenchItem, detail?: SolDetail | null, row?: TrenchRow): PairModel {
  const r = row ?? adaptTrench(it, 0)
  const d = detail && detail.mint === it.mint ? detail : null
  const menit = menitJendela(d?.window_secs ?? 600)
  const beku = r.marketNotLoaded === true

  const urut = [...r.factors].sort((a, b) => a.weight - b.weight)
  /* R1: kolom TOP RISK = preview (TrenchesTable `RiskCell`): yang menurunkan skor dulu (terberat di depan), lalu sisanya
     sbg konteks netral dlm urutan asal, maksimal TIGA chip (lima chip melipat & membengkakkan baris). */
  const tampil = [...r.factors.filter((f) => f.weight < 0).sort((a, b) => a.weight - b.weight), ...r.factors.filter((f) => f.weight >= 0)]
  const reasons: Reason[] = tampil.slice(0, 3).map((f) => ({
    short: FAKTOR[f.kind].short(f.pct),
    full: `${FAKTOR[f.kind].full(f.pct)}${f.weight < 0 ? ', lowering the score' : ''}.`,
    bad: f.weight < 0,
  }))
  const reasonsFull: Reason[] = urut.map((f) => ({ short: FAKTOR[f.kind].short(f.pct), full: FAKTOR[f.kind].full(f.pct), bad: f.weight < 0 }))
  // Sebaran kepemilikan (gini) = konteks, tak pernah ditandai buruk di sini (ambangnya bukan ambang mesin)
  if (it.risk.gini !== null && it.risk.gini !== undefined && Number.isFinite(it.risk.gini)) {
    reasonsFull.push({ short: `Spread ${it.risk.gini.toFixed(2)}`, full: `Ownership inequality ${it.risk.gini.toFixed(2)} on a 0 to 1 scale`, bad: false })
  }

  const score: PairScore =
    it.score === null || it.score === undefined
      ? { kind: 'pending', title: 'Not scored yet', sub: 'first score ~3m', info: 'Pairs get their first audit score a few minutes after launch.' }
      : {
          kind: 'value',
          value: it.score,
          max: it.score_max ?? 100,
          rate: it.collapse_rate_pct ?? null,
          rose: it.rose3x_rate_pct ?? null,
          n: null,
          tone: nadaDariBase(it.collapse_rate_pct),
          spark: it.spark ?? undefined,
          measured: null,
          sentence:
            `of tokens at this score collapsed` +
            (it.rose3x_rate_pct !== null && it.rose3x_rate_pct !== undefined ? ` · ${rate(it.rose3x_rate_pct)} rose 3×` : ''),
          scoredAt: d?.scored_at_age_secs != null ? `scored at ${umur(d.scored_at_age_secs)}` : null,
          provisional: false,
        }

  const lulus = it.complete === true
  const curvePct = lulus ? 100 : r.graduationPct ?? null
  return {
    chain: 'sol',
    id: it.mint,
    symbol: rapiSimbol(it.symbol) || it.mint.slice(0, 6),
    name: d?.name ?? it.name ?? null,
    image: r.avatar,
    address: it.mint,
    href: `/coin/${it.mint}`,
    explorer: { name: 'Solscan', url: `https://solscan.io/token/${it.mint}` },
    launchpad: 'pump.fun',
    tags: beku ? [{ label: LABEL_PASAR_BELUM, tone: 'warn', info: JUDUL_PASAR_BELUM }] : [],
    ageSecs: it.age_secs ?? null,
    price: {
      v: beku ? null : it.price_usd,
      text: !beku && it.price_usd && it.price_usd > 0 ? harga(it.price_usd) : '—',
      why: beku ? JUDUL_PASAR_BELUM : 'The engine has no price for this pair yet.',
    },
    priceStale: null,
    // U16: persen null permanen (harga pertama mesin tak tercatat) → sebabnya di popover "—" kolom MC
    change: {
      v: r.marketCapChange,
      label: 'since launch',
      // U16h: item feed SELALU punya baris v10_flow (labels.ts) → tak lagi bergantung `window_secs` baris terpilih
      why: beku ? JUDUL_PASAR_BELUM : sejakLaunchTakTercatat(it, true) ? SEBAB_SEJAK_TAK_TERCATAT : 'Not measured yet.',
    },
    mcap: { v: r.marketCap, why: beku ? JUDUL_PASAR_BELUM : 'The engine has no market cap for this pair yet.' },
    liq: { v: r.liquidity, why: beku ? JUDUL_PASAR_BELUM : 'The engine did not report liquidity for this pair.', info: infoLikuiditasSol(lulus) },
    curveFunds: null,
    buys: it.buys,
    sells: it.sells,
    bsNote: `first ${menit} min`,
    holders: {
      v: r.holders,
      label: 'Holders',
      note: 'at audit',
      why: 'No holder count was recorded when this pair was audited.',
    },
    curve: {
      v: curvePct,
      note: lulus ? undefined : !mesinSegar(it.age_secs, d?.window_secs ?? 600) ? `at ${menit} min` : undefined,
      why: 'The engine has no curve progress for this pair.',
    },
    score,
    reasons,
    reasonsEmpty: r.factors.length ? null : 'Not measured',
    reasonsWhy: null,
    reasonsFull,
    status: null,
    trend: it.trend ? TREND[it.trend] ?? null : null,
    retention: { v: r.priceRetention ?? null, why: beku ? JUDUL_PASAR_BELUM : 'Not measured yet.' },
    move: { v: r.marketCapChange, why: beku ? JUDUL_PASAR_BELUM : 'Not measured yet.' },
    quoteNote: null,
    buy: true,
    explanation: (d?.explanation ?? it.explanation ?? null) || null,
    scoreWindow: statusJendela(d),
  }
}

/* ── BNB ────────────────────────────────────────────────────────────────── */

/** Field K1-K5 yang sudah ada di `/api/bnb/trenches` (synt-dash bnb.rs `item`) tapi belum di `api/types.ts`. */
export type BnbItemK = BnbTrenchItem & {
  price_change?: { m5: number | null; h1: number | null; h24: number | null } | null
  /** K4: persen 0-100 menuju graduasi (100 bila lulus); null = parameter kurva tak terekam. */
  curve_progress?: number | null
  /** Hanya harga dari kurva: quote terkumpul di kurva (satu sisi, BUKAN likuiditas). */
  curve_funds_usd?: number | null
  /** Subset `self_graduated`, `clone`. */
  flags?: string[] | null
  /** Urutan launch bersimbol sama dlm 24 jam s/d kelahiran token ini, termasuk dirinya (1 = pertama). */
  clone_count?: number | null
  usd_null_reason?: string | null
  price_source?: 'pool' | 'curve' | null
}

/** Judul pendek sinyal (bnb.rs `sinyal`): gagal / lolos. Kunci tak dikenal → teks engine apa adanya. */
const SINYAL_GAGAL: Record<string, string> = {
  price_not_pumped: 'Pumped by 2m',
  holders_not_thin: 'Thin holders',
  not_a_clone: 'Clone name',
  creator_not_serial: 'Serial creator',
}
const SINYAL_LOLOS: Record<string, string> = {
  price_not_pumped: 'Price not pumped',
  holders_not_thin: 'Holders not thin',
  not_a_clone: 'Original name',
  creator_not_serial: 'First launch today',
}
const SINYAL_BELUM: Record<string, string> = {
  price_not_pumped: 'Price run',
  holders_not_thin: 'Holder spread',
  not_a_clone: 'Name copy',
  creator_not_serial: 'Creator history',
}

const STABIL = ['BNB', 'WBNB', 'USDT', 'USD1']

/** Sebab USD kosong (bnb.rs `usd_null_reason`), sbg kalimat. */
function sebabUsd(it: BnbItemK, q: string): string {
  switch (it.usd_null_reason) {
    case 'no_price':
      return 'No trade price has been recorded for this pair yet.'
    case 'quote_decimals':
      return `Quoted in ${q}, whose units synt cannot read reliably yet, so no USD value is shown.`
    case 'bnb_rate_stale':
      return 'The BNB to USD rate is out of date, so USD values are left blank for now.'
    case 'quote_unpriced':
      return `Quoted in ${q}. synt has no USD rate for ${q} yet.`
    case 'quote_unknown':
      return 'The quote token of this pair is unknown, so USD values are left blank.'
    default:
      return q && !STABIL.includes(q.toUpperCase()) ? `Quoted in ${q}. synt has no USD rate for ${q} yet.` : 'Not measured yet.'
  }
}

const NADA_OUTCOME = { rug: 'bad', dead: 'muted', survive: 'neutral', winner: 'ok' } as const

export function adaptBnb(it: BnbItemK, cal: BnbCalibrationResponse | null): PairModel {
  const sym = rapiSimbol(it.symbol)
  const q = rapiSimbol(it.quote_symbol) || 'an unknown token'
  const flags = it.flags ?? []
  const why = sebabUsd(it, q)

  /* Tag: peringatan → quote non-BNB → pajak → launchpad (DESIGN §2 TokenIdentity) */
  const tags: Tag[] = []
  if (flags.includes('self_graduated')) {
    tags.push({
      label: 'Creator-filled',
      tone: 'warn',
      info: 'Graduated with at most one buyer other than the creator on the whole curve, so the creator filled the curve.',
    })
  }
  if (flags.includes('clone') && it.clone_count && it.clone_count > 1) {
    const sebelum = it.clone_count - 1
    tags.push({
      label: `Name reused ×${sebelum}`,
      tone: 'warn',
      info: `${sebelum} earlier ${sebelum === 1 ? 'launch' : 'launches'} in the 24 hours before this one used the symbol ${sym || 'of this token'}. Copies of a popular name often follow it, so this may be a copy, not the original.`,
    })
  }
  if (it.quote_symbol && !['BNB', 'WBNB'].includes(q.toUpperCase())) {
    tags.push({ label: q, tone: 'neutral', info: `Paired with ${q}, not BNB.` })
  }
  const tax = pajak(it.tax_bps)
  if (tax) tags.push({ label: tax, tone: (it.tax_bps ?? 0) >= 500 ? 'warn' : 'neutral', info: 'Transfer tax set by the token contract.' })
  else if (it.tax_bps === null && it.launchpad === 'fourmeme') {
    tags.push({ label: 'Tax ?', tone: 'neutral', info: 'four.meme does not report a tax event, so the transfer tax is unknown.' })
  }
  tags.push({ label: LAUNCHPAD[it.launchpad] ?? it.launchpad, tone: 'neutral' })
  // peringatan dulu (urutan stabil): Creator-filled, Name reused, Tax ≥ 5% → lalu quote, pajak biasa, launchpad
  tags.sort((a, b) => (a.tone === 'warn' ? 0 : 1) - (b.tone === 'warn' ? 0 : 1))
  // T1 (pemilik 7 Nov): baris BNB = baris SOL → hanya peringatan & quote non-BNB (tanpa Buy, USD bisa kosong)
  const rowTags = tags.filter((t) => t.tone === 'warn' || t.label === q)

  /* Skor + base rate dari baris kalibrasi skor yang sama */
  const k = keadaanSkor(it)
  let score: PairScore
  if (k.kind === 'scored') {
    // ⭐ 28 Okt: angka 0-100 = 100 − % rug tingkatnya (rumus SOL `skor_audit`); tanpa kalibrasi → tak ada angka
    const t = tingkatBnb(cal, k.value)
    score = t
      ? {
          kind: 'value',
          value: t.skor,
          max: 100,
          rate: t.rug_pct,
          rose: null,
          n: t.n,
          tone: nadaDariBase(t.rug_pct),
          measured: k.measured !== null && k.measured < k.max ? k.measured : null,
          checksMax: k.max,
          sentence: `of ${t.n.toLocaleString('en-US')} scored BNB tokens at this score collapsed${cal?.provisional ? ' (provisional)' : ''}`,
          scoredAt: 'scored at 2m',
          provisional: cal?.provisional ?? true,
        }
      : {
          kind: 'none',
          title: cal ? 'No base rate' : 'Calibrating',
          sub: '',
          info: cal
            ? 'This pair was scored, but the calibration has no row for its score yet, so no number is shown.'
            : 'The score appears once the BNB calibration has loaded: each score is read from it.',
        }
  } else if (k.kind === 'pending') {
    const sisa = Number.isFinite(it.age_secs) ? DETIK_SKOR - it.age_secs : null
    score = {
      kind: 'pending',
      title: 'Scoring at 2m',
      sub: sisa !== null && sisa > 0 ? `in ${Math.ceil(sisa)}s` : 'shortly',
      info: 'BNB pairs are scored once, two minutes after launch.',
    }
  } else if (k.kind === 'quiet') {
    score = {
      kind: 'quiet',
      title: 'Quiet',
      sub: 'not scored',
      info: 'Fewer than 10 outside buyers in the first 2 minutes, so this launch is not scored.',
    }
  } else {
    score = {
      kind: 'none',
      title: 'Not scored',
      sub: '',
      info: it.score_status === 'scored' ? 'This pair was scored, but its score value was not reported.' : 'This pair was not scored.',
    }
  }

  const sig = it.score?.signals ?? []
  const judul = (s: { key: string; ok: boolean | null; text: string }) =>
    (s.ok === false ? SINYAL_GAGAL : s.ok === true ? SINYAL_LOLOS : SINYAL_BELUM)[s.key] ?? s.text
  const reasons: Reason[] = sig.filter((s) => s.ok === false).slice(0, 2).map((s) => ({ short: judul(s), full: s.text, bad: true }))
  const reasonsFull: Reason[] = [
    ...sig.filter((s) => s.ok === false),
    ...sig.filter((s) => s.ok === null),
    ...sig.filter((s) => s.ok === true),
  ].map((s) => ({ short: judul(s), full: s.text, bad: s.ok === null ? null : !s.ok }))

  /* Outcome 90 mnt: label tetap "Rug" dst (DESIGN §6.1.3) */
  let status: PairStatus | null = null
  if (it.outcome && OUTCOME[it.outcome]) {
    status = { label: OUTCOME[it.outcome].label, tone: NADA_OUTCOME[it.outcome], prefix: '90m', info: OUTCOME[it.outcome].def }
  } else if (k.kind === 'scored' && Number.isFinite(it.age_secs) && it.age_secs < DETIK_OUTCOME_MAKS) {
    status = { label: 'Open', tone: 'open', info: 'No outcome yet. It is labelled shortly after the 90 minute window that starts at minute 2 closes.' }
  }

  /* Harga: USD bila kurs ada; else dalam quote; else "—" */
  const pUsd = it.price_usd !== null && Number.isFinite(it.price_usd) && it.price_usd > 0 ? it.price_usd : null
  const pQ = it.price_quote !== null && Number.isFinite(it.price_quote) && it.price_quote > 0 ? it.price_quote : null
  const priceText = pUsd !== null ? harga(pUsd) : pQ !== null ? `${harga(pQ).slice(1)} ${q}` : '—'

  /* Δ: jendela terpanjang yang terisi di antara 1h & 5m (24h jarang terisi) — jendelanya selalu ditulis */
  const pc = it.price_change ?? null
  const [dv, dl] = pc?.h24 != null ? [pc.h24, '24h'] : pc?.h1 != null ? [pc.h1, '1h'] : pc?.m5 != null ? [pc.m5, '5m'] : [null, '1h']

  const lulus = it.graduated
  return {
    chain: 'bnb',
    id: it.token,
    symbol: sym || `${it.token.slice(0, 6)}…${it.token.slice(-4)}`,
    name: it.name ? rapiSimbol(it.name) || it.name : null,
    image: gambarToken(it),
    address: it.token,
    href: `/bnb/${it.token}`,
    explorer: { name: 'BscScan', url: `https://bscscan.com/token/${it.token}` },
    launchpad: LAUNCHPAD[it.launchpad] ?? it.launchpad,
    tags,
    rowTags,
    ageSecs: Number.isFinite(it.age_secs) ? it.age_secs : null,
    price: { v: pUsd ?? pQ, text: priceText, why },
    priceStale: hargaBasi(it),
    change: { v: dv, label: dl, why: 'No price change recorded for this window yet.' },
    mcap: { v: it.mcap_usd, why },
    liq: {
      v: it.liquidity_usd !== null && it.liquidity_usd >= 1 ? it.liquidity_usd : null,
      why: lulus
        ? it.liquidity_usd !== null && it.liquidity_usd < 1 ? 'Liquidity is under $1, so it is not shown as a figure.' : why
        : 'Still on the bonding curve, so there is no DEX pool yet.',
    },
    curveFunds: lulus ? null : { v: it.curve_funds_usd ?? null, why: it.price_source === 'curve' ? why : 'No curve trade has been recorded yet.' },
    buys: it.buys,
    sells: it.sells,
    bsNote: 'on the curve',
    holders: { v: it.buyers, label: 'Buyers', note: 'on the curve', why: 'Distinct buying wallets were not measured yet.' },
    curve: {
      v: lulus ? 100 : it.curve_progress ?? null,
      note: lulus ? undefined : 'to DEX',
      why: 'The curve settings of this launch were not recorded, so progress is unknown.',
    },
    score,
    reasons,
    reasonsEmpty: sig.length ? (reasons.length ? null : 'No flag raised') : null,
    reasonsWhy:
      k.kind === 'pending' ? 'Reasons come with the score, two minutes after launch.'
        : k.kind === 'quiet' ? 'Quiet launches are not scored, so there are no reasons.'
        : 'No reasons were returned with this score.',
    reasonsFull,
    status,
    statusWhy:
      Number.isFinite(it.age_secs) && it.age_secs < DETIK_OUTCOME_MAKS
        ? 'No outcome yet. It is labelled shortly after the 90 minute window that starts at minute 2 closes.'
        : 'No 90 minute outcome was recorded for this pair.',
    trend: null,
    // T1: feed BNB belum membawa harga awal (`harga_awal` ada di engine, usulan B13) maupun retensi → tak ada kolomnya
    retention: { v: null, why: 'The BNB feed does not report price retention yet.' },
    move: { v: null, why: 'The BNB feed does not report the launch price yet, so the move since launch is not shown.' },
    quoteNote:
      pUsd === null && pQ !== null
        ? `Quoted in ${q}. Its USD rate is unknown, so price is shown in ${q} and USD values are left blank.`
        : pUsd === null ? `Quoted in ${q}.` : `Quoted in ${q}. Values in USD.`,
    // 3 Nov: trading BNB nyata — tombol Buy hanya utk pair ber-quote BNB (four.meme ber-quote lain tak didukung server)
    buy: it.quote_symbol === 'BNB',
    explanation: null,
    scoreWindow: null,
    taxBps: it.tax_bps ?? null,
  }
}
