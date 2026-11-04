import { useEffect, useState } from 'react'
import { usePolling } from '@/lib/usePolling'

/* ─────────────────────────────────────────────────────────────────────────
   Fakta token dari RugCheck & DexScreener, diambil LEWAT synt-dash `GET /api/facts?mint=` (B5, 2026-10-25).

   | fakta | sumber hulu | bagian respons |
   |---|---|---|
   | LP burned/locked + bukti kurva | RugCheck laporan penuh | `rugcheck.markets[]` {type, liquidity_usd, lp_locked_pct}; `null` = laporan sah tanpa pool |
   | Dex paid | DexScreener orders | `dex_paid` {orders[{type,status}], boosts: jumlah} |
   | Nama/simbol (mint tak dilacak) | DexScreener tokens | `dex_token` {name, symbol}; keduanya null = DexScreener tak mengenal |
   | Perubahan harga 5m/1h/24h (B7, 26 Okt) | DexScreener token-pairs | `dex_market` {pair: null \| {dex, liquidity_usd, price_change{m5,h1,h6,h24}}} |

   Tiap bagian ber-`status` 'ok' | 'unavailable' | 'busy' (+ `checked_at` bila ok). synt-dash menyimpan jawaban sukses
   5 menit dan menjaga anggaran hulu (RugCheck `x-rate-limit-limit: 15`); `busy` = anggaran habis, TIDAK disimpan.
   ⛔ Browser TIDAK lagi memanggil api.rugcheck.xyz / api.dexscreener.com secara langsung.

   ⛔ Gagal/busy = "Unavailable", BUKAN nilai contoh. busy / `/api/facts` gagal → "Checks unavailable, try again shortly" (tanpa nama sumber).
   ⭐ 1b putaran 2 (keputusan orkestrator): RugCheck SELALU ditanya dan jadi OTORITAS kurva vs lulus (pool terbesar
   `pump_fun` = kurva; pool lain = lulus). Status kurva mesin hanya cadangan saat RugCheck gagal, dan ditulis sbg data
   mesin berumur. Alasannya: bila synt-stream tak lagi memegang pair (dibuang ±24 jam / timeout 3 dtk), synt-dash jatuh
   ke `v10_flow` yang BEKU di detik-600 → pair 135 jam yang sudah di PumpSwap tetap terbaca `complete:false`, 7,0%
   (nC3to2…pump, 2026-10-25).

   Satu permintaan per mint, respons yang SEMUA bagiannya ok di-cache 5 menit di memori tab (pindah token bolak-balik
   tanpa permintaan baru). Ada bagian gagal/busy → tak di-cache, kunjungan berikutnya mencoba lagi.
   ⭐ B7: `dex_market` (perubahan harga) basi cepat → `useDexPasar` memakai entri cache yang SAMA hanya bila umurnya
   < 60 dtk, dan mengambil ulang tiap 60 dtk selama halaman terbuka (synt-dash menyimpan `dex_market` 60 dtk, bagian
   lain 5 mnt → ambil ulang murah). Maks satu permintaan per mint per menit; tab tersembunyi = berhenti (usePolling).
   ───────────────────────────────────────────────────────────────────────── */

export type Fakta<T> =
  | { status: 'loading' }
  /** `at` = `checked_at` hulu (ISO) — kapan synt-dash terakhir menanyai sumbernya. */
  | { status: 'ok'; value: T; at: string | null }
  /** `sebab`: 'sumber' = synt-dash bertanya & sumber itu (RugCheck/DexScreener) tak menjawab (`unavailable`);
   *  'synt' = pemeriksaan synt sendiri yang tak tersedia: `/api/facts` gagal/429/bentuk tak dikenal, atau `busy`
   *  (anggaran hulu synt-dash habis, sumbernya TIDAK ditanya). ⛔ 'synt' tak boleh menyebut nama pihak ketiga. */
  | { status: 'error'; sebab: 'sumber' | 'synt' }

/** Pool acuan LP menurut RugCheck. */
export interface LpPool {
  /** Persen LP terkunci atau terbakar (0–100). */
  lockedPct: number
  /** `marketType` RugCheck mentah (pump_fun_amm, orca, meteoraDlmm, …). */
  pool: string
  /** 'pumpswap' = pool PumpSwap dipilih krn ada; 'largest' = pool terbesar (tak ada PumpSwap). */
  acuan: 'pumpswap' | 'largest'
  /** Jenis pool (1c putaran 2, keputusan orkestrator dari data RugCheck):
   *  'lp-token' = pool menerbitkan token LP (bisa dibakar/dikunci);
   *  'posisi'   = posisi likuiditas yang BISA dikunci (orca, DAMM v2, Raydium CLMM; RugCheck melaporkan 0–100%);
   *  'dlmm'     = Meteora DLMM: tak ada token LP, RugCheck selalu 0% (struktural);
   *  'lain'     = tak dikenal → angka apa adanya, tanpa klaim struktural. */
  jenis: 'lp-token' | 'posisi' | 'dlmm' | 'lain'
  /** RugCheck mencatat KURVA pump.fun (`pump_fun`) = bukti token pump.fun.
   *  ⛔ `pump_fun_amm` saja BUKAN bukti: siapa pun bisa membuka pool PumpSwap utk token apa pun (BONK punya). */
  pumpPasar: boolean
}
/** 'curve' = acuan RugCheck adalah kurva pump.fun (belum ada LP). */
export type LpFakta = Fakta<LpPool | 'no-pool' | 'curve'>

/* ⛔ 1c putaran 2: dulu orca/DAMM v2/CLMM dianggap "tak punya token LP" → 0% netral. Data RugCheck membantah:
   orca 0/1,2/27,3/100%, DAMM v2 44,7–100% (NFT posisi bisa dikunci), CLMM bisa dikunci via Burn & Earn.
   Hanya meteoraDlmm yang selalu 0%. */
const POOL_LP_TOKEN = new Set(['pump_fun_amm', 'raydium', 'raydium_cpmm', 'meteora', 'fluxbeam'])
const POOL_POSISI = new Set(['orca', 'meteora_damm_v2', 'raydium_clmm'])
function jenisPool(t: string): LpPool['jenis'] {
  if (POOL_LP_TOKEN.has(t)) return 'lp-token'
  if (POOL_POSISI.has(t)) return 'posisi'
  if (t === 'meteoraDlmm') return 'dlmm'
  return 'lain'
}

const NAMA_POOL: Record<string, string> = {
  pump_fun_amm: 'PumpSwap', pump_fun: 'pump.fun curve', raydium: 'Raydium AMM', raydium_cpmm: 'Raydium CPMM',
  raydium_clmm: 'Raydium CLMM', orca: 'Orca', meteoraDlmm: 'Meteora DLMM', meteora: 'Meteora',
  meteora_damm_v2: 'Meteora DAMM v2', fluxbeam: 'FluxBeam',
}
/** Nama pool utk UI. */
export function namaPool(t: string): string {
  return NAMA_POOL[t] ?? t
}
export type DexFakta = Fakta<{ paid: 'paid' | 'pending' | 'no'; boosted: boolean }>

/* ── Bentuk respons `/api/facts` ── */
type Status = 'ok' | 'unavailable' | 'busy'
interface Bagian { status: Status; checked_at?: string }
interface PasarFakta { type: string; liquidity_usd: number | null; lp_locked_pct: number }
export interface FactsResponse {
  rugcheck: Bagian & { markets?: PasarFakta[] | null }
  dex_paid: Bagian & { orders?: { type?: string; status?: string }[]; boosts?: number }
  dex_token: Bagian & { name?: string | null; symbol?: string | null }
  /** B7 (synt-dash fakta.rs `bentuk_dex_pasar`). ⚠️ Tak ada di server lama (sebelum restart) → "—" tanpa galat. */
  dex_market?: Bagian & { pair?: DexPair | null }
}
interface DexPair {
  dex?: string | null
  liquidity_usd?: number | null
  price_change?: { m5?: number | null; h1?: number | null; h6?: number | null; h24?: number | null } | null
}

const TTL = 5 * 60_000
const BATAS_WAKTU = 15_000
const cache = new Map<string, { t: number; p: Promise<FactsResponse> }>()

/** Empat bagian ok. `dex_market` yang TAK ADA (server sebelum B7) tak menggagalkan cache; yang ada wajib ok. */
function semuaOk(r: FactsResponse): boolean {
  return r.rugcheck?.status === 'ok' && r.dex_paid?.status === 'ok' && r.dex_token?.status === 'ok' &&
    (r.dex_market === undefined || r.dex_market?.status === 'ok')
}

/** Satu permintaan per mint, dibagi semua hook (halaman token + keadaan Not-tracked).
 *  `umurMaks`: entri cache lebih tua dari ini diambil ulang (5 mnt; perubahan harga 60 dtk). */
function ambilFakta(mint: string, umurMaks = TTL): Promise<FactsResponse> {
  const ada = cache.get(mint)
  if (ada && Date.now() - ada.t < umurMaks) return ada.p
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), BATAS_WAKTU)
  // Penyegaran 60 dtk: lewati cache HTTP browser (respons all-ok ber-`max-age=60`) supaya perubahan harga tak basi
  // dua kali lipat; synt-dash tetap menjawab dari cache servernya sendiri.
  const p = fetch(`/api/facts?mint=${encodeURIComponent(mint)}`, {
    signal: ctl.signal,
    headers: { accept: 'application/json' },
    cache: umurMaks < TTL ? 'no-cache' : 'default',
  })
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`)
      return r.json() as Promise<FactsResponse>
    })
    .finally(() => clearTimeout(timer))
  // gagal total, atau ada bagian gagal/busy → buang dari cache supaya kunjungan berikutnya mencoba lagi
  // (hanya bila entri itu masih milik permintaan ini — ambil ulang 60 dtk bisa sudah menggantinya)
  const e = { t: Date.now(), p }
  const buang = () => { if (cache.get(mint) === e) cache.delete(mint) }
  p.then((r) => { if (!semuaOk(r)) buang() }, buang)
  cache.set(mint, e)
  return p
}

/** Respons mentah utk satu mint; state dikunci ke mint (⛔ 1b: tak melukis nilai mint sebelumnya). */
function useFaktaMentah(mint: string, aktif: boolean): FactsResponse | 'loading' | 'error' {
  const [v, setV] = useState<{ k: string; r: FactsResponse | 'error' }>({ k: '', r: 'error' })
  useEffect(() => {
    if (!aktif) return
    let hidup = true
    ambilFakta(mint)
      .then((r) => { if (hidup) setV({ k: mint, r }) })
      .catch(() => { if (hidup) setV({ k: mint, r: 'error' }) })
    return () => { hidup = false }
  }, [mint, aktif])
  return v.k === mint ? v.r : 'loading'
}

function galat<T>(b: Bagian | undefined): Fakta<T> {
  return { status: 'error', sebab: b?.status === 'unavailable' ? 'sumber' : 'synt' }
}

/* ⛔ BUKAN `report/summary` (dipilih synt-dash): `lpLockedPct` ringkasan melompat 98,1% → 86,3% → 0,0% dalam beberapa
   menit utk pair yang sama (GME 2026-10-25), karena ikut menghitung pool kecil pihak ketiga. Yang dipakai: per pool. */
function lpDariRugCheck(rc: FactsResponse['rugcheck'], tokenPump: boolean): LpFakta {
  if (rc?.status !== 'ok') return galat(rc)
  const at = rc.checked_at ?? null
  // Laporan sah tanpa pool (mis. USDC: markets null) = RugCheck tak mencatat pool, BUKAN gagal menjawab
  if (rc.markets == null) return { status: 'ok', value: 'no-pool', at }
  if (!Array.isArray(rc.markets)) return { status: 'error', sebab: 'synt' }
  const angka = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  type P = { liq: number; pct: number; pool: string }
  const semua: P[] = []
  for (const m of rc.markets) {
    const pct = angka(m.lp_locked_pct)
    if (pct === null) continue
    semua.push({ liq: angka(m.liquidity_usd) ?? 0, pct, pool: m.type || 'unknown' })
  }
  const terbesarDari = (xs: P[]) => xs.reduce<P | null>((a, b) => (!a || b.liq > a.liq ? b : a), null)
  const pumpPasar = semua.some((p) => p.pool === 'pump_fun')
  /* ⭐ 1c: utk token pump.fun pool ACUAN = PumpSwap (`pump_fun_amm`, tempat LP hasil migrasi dibakar) bila ada,
     bukan sekadar pool terbesar — GME: DLMM $22,9K vs PumpSwap $27,0K, urutannya bisa berbalik kapan saja.
     synt-dash selalu menyertakan PumpSwap terbesar & `pump_fun` meski di luar 8 pool teratas. */
  // hanya utk token pump.fun (bukti mesin atau kurva di RugCheck); BONK punya pool PumpSwap kecil yang bukan acuan
  const pumpswap = tokenPump || pumpPasar ? terbesarDari(semua.filter((p) => p.pool === 'pump_fun_amm')) : null
  const acuan = pumpswap ?? terbesarDari(semua)
  if (!acuan) return { status: 'ok', value: 'no-pool', at }
  // ⭐ 1b: kurva pump.fun dilaporkan RugCheck sbg market `pump_fun` (lpLockedPct 100, bukan LP sungguhan) → kurva.
  if (acuan.pool === 'pump_fun') return { status: 'ok', value: 'curve', at }
  return {
    status: 'ok',
    at,
    value: {
      lockedPct: Math.min(100, Math.max(0, acuan.pct)),
      pool: acuan.pool,
      acuan: pumpswap ? 'pumpswap' : 'largest',
      jenis: jenisPool(acuan.pool),
      pumpPasar,
    },
  }
}

function dexDariDexScreener(dp: FactsResponse['dex_paid']): DexFakta {
  if (dp?.status !== 'ok') return galat(dp)
  if (!Array.isArray(dp.orders)) return { status: 'error', sebab: 'synt' }
  const profil = dp.orders.filter((o) => o.type === 'tokenProfile')
  const paid = profil.some((o) => o.status === 'approved') ? 'paid'
    : profil.some((o) => o.status === 'processing' || o.status === 'on-hold') ? 'pending' : 'no'
  return { status: 'ok', value: { paid, boosted: (dp.boosts ?? 0) > 0 }, at: dp.checked_at ?? null }
}

/** Nama & simbol token dari DexScreener (via synt-dash) — utk mint yang TAK dilacak mesin (1c putaran 2).
 *  null = DexScreener tak mengenal token; 'unavailable' = tak bisa ditanya sekarang (gagal/busy) — beda arti. */
export function useDexNama(mint: string): { name: string; symbol: string } | null | 'loading' | 'unavailable' {
  const r = useFaktaMentah(mint, true)
  if (r === 'loading') return 'loading'
  if (r === 'error' || r.dex_token?.status !== 'ok') return 'unavailable'
  const sym = r.dex_token.symbol?.trim()
  return sym ? { name: (r.dex_token.name ?? sym).trim() || sym, symbol: sym } : null
}

/**
 * LP & Dex paid untuk satu mint, dari `/api/facts` (cache 5 menit per mint, tanpa polling).
 * `aktif=false` (halaman contoh) → TANPA permintaan sama sekali.
 */
export function useTokenFacts(mint: string, aktif = true, tokenPump = false): { lp: LpFakta; dex: DexFakta } {
  const r = useFaktaMentah(mint, aktif)
  if (r === 'loading') return { lp: { status: 'loading' }, dex: { status: 'loading' } }
  if (r === 'error') return { lp: { status: 'error', sebab: 'synt' }, dex: { status: 'error', sebab: 'synt' } }
  return { lp: lpDariRugCheck(r.rugcheck, tokenPump), dex: dexDariDexScreener(r.dex_paid) }
}

/** "Checked just now" / "Checked 3m ago" dari `checked_at` tertua fakta yang ok (jujur soal cache server 5 menit). */
export function teksDiperiksa(...fs: Fakta<unknown>[]): string {
  const ts = fs.flatMap((f) => (f.status === 'ok' && f.at ? [Date.parse(f.at)] : [])).filter(Number.isFinite)
  if (!ts.length) return ''
  const d = Math.max(0, Math.round((Date.now() - Math.min(...ts)) / 1000))
  return d < 60 ? 'Checked just now.' : `Checked ${Math.floor(d / 60)}m ago.`
}

/* ── B7: perubahan harga pasar 5m/1h/24h ───────────────────────────────── */

/** Pair acuan DexScreener (aturan sama dgn synt-dash amm.rs: quote SOL, likuiditas terukur tertinggi). */
export interface DexPasar {
  /** `dexId` DexScreener mentah: 'pumpswap', 'pumpfun' (kurva pump.fun), 'raydium', … */
  dex: string
  liquidityUsd: number | null
  m5: number | null
  h1: number | null
  h24: number | null
}
/** ok + `null` = DexScreener tak punya pair SOL yang sah utk mint ini (BUKAN gagal). */
export type HargaFakta = Fakta<DexPasar | null>

const NAMA_DEX: Record<string, string> = {
  pumpswap: 'PumpSwap', pumpfun: 'pump.fun curve', raydium: 'Raydium', meteora: 'Meteora', orca: 'Orca',
}
/** Nama pair utk UI; dexId tak dikenal ditulis apa adanya. */
export function namaDex(d: string): string {
  return NAMA_DEX[d] ?? d
}

const angkaAtauNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** `undefined` = server lama tanpa `dex_market`. */
function pasarDariDex(dm: FactsResponse['dex_market']): HargaFakta | undefined {
  if (dm === undefined) return undefined
  if (dm?.status !== 'ok') return galat(dm)
  if (dm.pair == null) return { status: 'ok', value: null, at: dm.checked_at ?? null }
  const pc = dm.pair.price_change ?? {}
  return {
    status: 'ok',
    at: dm.checked_at ?? null,
    value: {
      dex: dm.pair.dex?.trim() || 'unknown',
      liquidityUsd: angkaAtauNull(dm.pair.liquidity_usd),
      m5: angkaAtauNull(pc.m5),
      h1: angkaAtauNull(pc.h1),
      h24: angkaAtauNull(pc.h24),
    },
  }
}

const SEGAR_PASAR = 60_000

/**
 * Perubahan harga pair acuan DexScreener (B7), disegarkan tiap 60 dtk.
 * 'absent' = server belum melayani `dex_market` (sebelum restart B7) → UI "—" seperti dulu.
 * `aktif=false` (halaman contoh) → tanpa permintaan.
 */
export function useDexPasar(mint: string, aktif = true): HargaFakta | 'absent' {
  const { data, error } = usePolling(
    async (_signal) => (aktif ? { r: await ambilFakta(mint, SEGAR_PASAR), diterima: Date.now() } : null),
    SEGAR_PASAR,
    `${mint}|${aktif}`,
  )
  /* Putaran 2: tab kembali dari tersembunyi → render ulang SEKARANG (bukan menunggu jawaban tik berikutnya), supaya
     "Checked …" dihitung ulang dan data yang terlalu tua tak tampil sbg segar. */
  const [, setDetak] = useState(0)
  useEffect(() => {
    const f = () => { if (!document.hidden) setDetak((n) => n + 1) }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])
  if (!aktif) return 'absent'
  // halaman token dipasang ulang per mint (CoinNyata key={mint}) → `data` selalu milik mint ini.
  // Tik terakhir gagal → galat synt, walau usePolling masih menahan data lama (perubahan harga basi = menyesatkan).
  if (error) return { status: 'error', sebab: 'synt' }
  // Belum ada data, atau data diterima > 2 tik lalu (tab lama tersembunyi, polling berhenti) → "—" sampai tik segar.
  if (!data || Date.now() - data.diterima > 2 * SEGAR_PASAR) return { status: 'loading' }
  return pasarDariDex(data.r.dex_market) ?? 'absent'
}
