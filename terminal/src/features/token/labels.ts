import { usd } from '@/lib/format'
import type { TokenDetail as ApiToken } from '@/api/types'

/* ─────────────────────────────────────────────────────────────────────────
   Label & nilai-kosong angka mesin — dipakai BERSAMA halaman token (CoinDetailView/adaptDetail) dan panel kanan
   Trenches (TokenPanel/adapt), supaya angka yang sama punya nama yang sama di kedua tempat (butir 1d AGEN-BUILD).

   Arti angka (dicek di synt-dash `src/api.rs`, fungsi token):
     change_pct     = harga kini vs harga PERTAMA `v10_flow` → "Since launch" (bukan 24 jam)
     net_sol_window = net SOL 0-`window_secs` (maks 600 dtk), bertanda → "Net flow, first N min" (bukan "Volume")
     buys / sells   = jendela ukur yang sama 0-`window_secs` → "first N min"
     risk.top10_pct = sekali saat audit → "(at audit)"; null → "Not tracked", bukan 0
     liquidity null/0 = bukan data → "—"; > 0 tapi < $1 = kurva terkuras → "<$1" (bukan "$0")
   ───────────────────────────────────────────────────────────────────────── */

/** Panjang jendela ukur dalam menit (min 1). */
export function menitJendela(windowSecs: number): number {
  return Math.max(1, Math.round(windowSecs / 60))
}

export function labelNetFlow(windowSecs: number): string {
  return `Net flow, first ${menitJendela(windowSecs)} min`
}

export function teksNetFlow(v: number | null): string {
  if (v === null) return '—'
  return `${v < 0 ? '-' : '+'}${usd(Math.abs(v))}`
}

export function teksTop10(v: number | null): string {
  return v === null ? 'Not tracked' : `${v.toFixed(1)}%`
}

/** Likuiditas USD; null/0 = tak ada data (null). ⭐ Putaran 2 (keputusan orkestrator): > 0 tapi < $1 TETAP angka —
 *  kurva yang terkuras (KOLSHI liquidity_sol 0,0098) bukan "data hilang"; UI menulisnya "<$1" (`uang()` di lib/format). */
export function likuiditasUsd(liqSol: number | null | undefined, kurs: number): number | null {
  const v = (liqSol ?? 0) * kurs
  return v > 0 ? v : null
}

/* ⭐ U22 (audit 7 Nov): likuiditas SOL = `liquidity_sol` × kurs = SISI SOL SAJA (dicek synt-dash api.rs `token`/`trenches`
   + amm.rs): pair di kurva → `real_sol` (SOL di bonding curve, synt-stream/`v10_flow`); pair lulus → `liquidity.quote`
   pair DexScreener ber-quote SOL yang memegang SOL terbanyak (`amm.rs lebih_baik`). Token di kurva/pool tak dihitung,
   jadi angka `liquidity.usd` DexScreener (dua sisi) & pool RugCheck lebih besar. Angka TIDAK diubah, hanya label &
   penjelas sumbernya (padanan BNB: "Curve funds (one side)"). */
export const LABEL_LIKUIDITAS_SOL = 'Liquidity (SOL side)'

export function infoLikuiditasSol(lulus: boolean): string {
  return lulus
    ? 'SOL in the pool, in USD, from DexScreener (the SOL pool holding the most SOL). One side only: the tokens in the pool are not counted. DexScreener’s own liquidity figure counts both sides, so it is higher.'
    : 'SOL held in the pump.fun bonding curve, in USD. One side only: the tokens on the curve are not counted.'
}

/** Data kurva mesin masih mengikuti pair (bukan beku di akhir jendela ukur). */
export function mesinSegar(ageSecs: number, windowSecs: number): boolean {
  return ageSecs - windowSecs < 120
}

/** Bukti pump.fun dari data MESIN saja (launchpad, sufiks mint, atau mesin sudah mengaudit). */
export function buktiPumpMesin(a: ApiToken): boolean {
  return /pump/i.test(a.launchpad ?? '') || a.mint.endsWith('pump') || a.checks != null
}

/**
 * Launchpad utk tampilan. Nilai mesin yang terlihat: 'https://pump.fun', 'pump', 'pump_v2', 'otc', null.
 * ⛔ Tanpa default 'pump.fun' utk semua mint: kosong → 'pump.fun' hanya bila mesin melihat pair-nya (bukan 'unknown')
 * DAN ada bukti pump.fun; selain itu null ("Not reported").
 */
export function launchpadTampil(a: ApiToken): string | null {
  const mentah = rapikanLaunchpad(a.launchpad)
  if (mentah) return mentah
  const dilihat = a.complete === true || (a.graduation_pct ?? 0) > 0 || (a.mcap_sol ?? 0) > 0
  return dilihat && buktiPumpMesin(a) ? 'pump.fun' : null
}

/* ⭐ Sisa kecil review (AGEN-BUILD 25 Okt): nilai `launchpad` = synt-dash api.rs `created_on` = field metadata token
   `createdOn` (synt-v10 meta.rs), teks BEBAS yang ditulis alat deploy. Yang terlihat: 'https://pump.fun', 'pump',
   'pump_v2', 'otc', 'notrandom.fun'. Dirapikan HANYA yang jelas: URL → nama domainnya (tanpa skema/www/path), kode
   pump.fun ('pump', 'pump_vN') → 'pump.fun'. Selain itu (mis. 'otc') ditulis apa adanya — tak ada nama karangan;
   tooltip `judulLaunchpad` menyebut asalnya supaya nilai mentah tak terbaca sbg salah tampil. */
function rapikanLaunchpad(v: string | null | undefined): string | null {
  const t = v?.trim()
  if (!t) return null
  if (/^pump(_v\d+)?$/i.test(t)) return 'pump.fun'
  /* Putaran 2: path dibuang HANYA dari URL (ada skema) atau teks yang segmen pertamanya nama domain
     ('notrandom.fun/x'); teks bebas seperti 'AI/Agent' tetap utuh (dulu jadi 'AI'). */
  const skema = /^https?:\/\//i.test(t)
  const tanpaSkema = t.replace(/^https?:\/\//i, '')
  const segmen = tanpaSkema.split(/[/?#]/)[0] ?? ''
  if (!skema && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(segmen)) return t
  const domain = segmen.replace(/^www\./i, '')
  if (/^pump(_v\d+)?$/i.test(domain)) return 'pump.fun'
  return domain || t
}

/** Tooltip baris Launchpad: dari metadata (nilai mentah disebut) atau disimpulkan mesin; tanpa nilai → undefined. */
export function judulLaunchpad(a: ApiToken): string | undefined {
  const t = a.launchpad?.trim()
  if (t) return `From the token metadata ("createdOn": "${t}"), as written by the tool that deployed it.`
  return launchpadTampil(a) ? 'Not in the token metadata. Inferred from pump.fun data seen by the synt engine.' : undefined
}

/* A2: `teksLikuiditas` & `usdAtau` dihapus → `uang()` di `@/lib/format` (null → "—", 0 ≤ v < 1 → "<$1": kurva terkuras
   itu DATA, bukan ketiadaan data). */

/* ─────────────────────────────────────────────────────────────────────────
   ⭐ P2: pair lulus yang harga PASCA-lulusnya BELUM dimuat synt ("Post-graduation market not loaded").

   Gejala (25 Okt: SWAT, PUMPGOBLIN, PLOOMY, CHIKO, POWERPONS, WingStop, PUMP2): MC $41.9K kembar, retention ±99%,
   move ±1,36×. Itu angka KELULUSAN yang beku, bukan pasar.

   Asal angka (dicek synt-dash `api.rs` trenches/token + `amm.rs timpa`): utk pair `complete`, synt-dash menimpa harga
   & likuiditas dgn pair DexScreener ber-quote SOL dari endpoint BATCH `tokens/v1/solana/<mint,...>`; pair dgn
   likuiditas terlapor selalu menang. Bila endpoint itu hanya mengembalikan pair `pumpfun` (kurva, tanpa likuiditas)
   → `liq_tak_diketahui` → API mengirim `liquidity_sol: null` dan harga = harga AKHIR kurva (`priceNative`
   0.0000004108 → `mcap_sol` 410,8 = 1 M × harga).

   ⛔ Putaran 1 SALAH menyimpulkan "tak ada trade": Reviewer & orkestrator (25 Okt) mendapati SWAT ramai di PumpSwap
   (`token-pairs/v1/solana/<mint>`: pumpswap ±$2,2K likuiditas, 2121 beli / 1899 jual per 24 jam, harga ±20× di bawah
   harga kelulusan) — hanya endpoint batch yang dipakai synt-dash yang tak mengembalikannya. Jadi sinyal ini berarti
   "synt belum memuat pasar pasca-lulus", BUKAN apa pun tentang aktivitas trading. Perbaikan sumbernya: usulan B6.

   Sinyal (KEDUANYA wajib):
     1. `complete === true` dan `liquidity_sol === null` (tak ada harga pasca-lulus berlikuiditas di data synt);
     2. `mcap_sol` ≈ MC akhir kurva pump.fun (410,8 SOL, toleransi 1%) → harga yang dipakai memang harga kelulusan.
   ⛔ `last_trade_secs_ago` TIDAK dipakai: synt-stream berhenti mengikuti pair di kelulusan, jadi ia ≈ waktu lulus utk
   SEMUA pair lulus — bukan pembeda.
   Bila pump.fun mengubah kurvanya, sinyal 2 gagal → label tak muncul (salah-negatif), bukan salah-positif.
   ───────────────────────────────────────────────────────────────────────── */
const MC_AKHIR_KURVA_SOL = 410.8

export function pasarPascaLulusBelumDimuat(a: {
  complete?: boolean | null
  liquidity_sol?: number | null
  mcap_sol?: number | null
}): boolean {
  if (a.complete !== true || a.liquidity_sol != null || a.mcap_sol == null) return false
  return Math.abs(a.mcap_sol / MC_AKHIR_KURVA_SOL - 1) < 0.01
}

export const LABEL_PASAR_BELUM = 'Post-graduation market not loaded'

/**
 * ⭐ U16 (audit 7 Nov): `change_pct` (synt-dash api.rs) = harga kini / `harga_awal` − 1, dgn `harga_awal` = `price_usd`
 * baris `v10_flow` PERTAMA (sec terkecil) dan syarat `harga_awal > 0`. Perekam synt-v10 (`recorder.rs`) menulis harga
 * yang belum terbaca sbg 0 (`px.unwrap_or(0.0)`), bukan NULL, dgn `INSERT … ON CONFLICT (mint, sec) DO NOTHING` dan
 * `sample_secs` menaik → baris pertama tak pernah ditimpa. Baris pertama berharga 0 = persen null SELAMANYA, berapa pun
 * umur pair (bukan soal umur lewat jendela). 8 Nov 03.20 UTC null di 1/4 new, 27/50 trending, 10/31 bonding, 8/25
 * graduated, semuanya BERHARGA; bukan khas token lulus.
 *
 * U16h (Reviewer 8 Nov): kelas ini hanya pasti bila pair SUDAH punya baris `v10_flow` (`adaBarisFlow`):
 *   · `/api/token`: `window_secs` = `sec` baris `v10_flow` TERAKHIR (bukan panjang jendela), 0 bila belum ada baris
 *     (±1 dtk pertama pair) → pemanggil mengirim `window_secs > 0`;
 *   · `/api/trenches`: SETIAP item dibangun dari `v10_flow` (CTE `akhir … FROM v10_flow`) → selalu true.
 * Harga null/0 = belum terukur (bisa terisi), bukan kelas ini.
 */
export function sejakLaunchTakTercatat(a: { change_pct?: number | null; price_usd?: number | null }, adaBarisFlow: boolean): boolean {
  return adaBarisFlow && a.change_pct == null && typeof a.price_usd === 'number' && a.price_usd > 0
}
export const SEBAB_SEJAK_TAK_TERCATAT =
  'The engine recorded no first price for this pair, so its change since launch cannot be computed and will stay empty.'
export const JUDUL_PASAR_BELUM =
  'synt has not loaded the post-graduation price for this pair. The price, market cap and other market figures it would show are graduation figures, so they are hidden.'
