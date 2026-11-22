import { gambarToken } from '@/components/Avatar'
import type { TrenchItem } from '@/api/types'
import type { TrenchRow, RiskFactor } from './types'
import { likuiditasUsd, pasarPascaLulusBelumDimuat } from '@/features/token/labels'
import { tingkat, type Tingkat } from '@/features/risk/ambang'

/* ─────────────────────────────────────────────────────────────────────────
   Jembatan API → bentuk yang dipakai tabel.

   Dipisah jadi berkas sendiri, bukan ditanam di komponen, karena di sinilah
   seluruh ketidakcocokan antara "apa yang mesin ukur" dan "apa yang desain
   minta" harus diselesaikan secara eksplisit. Menanamnya di komponen membuat
   kompromi-kompromi itu tersebar dan tak terlihat saat ditinjau.

   ⚠️ Aturan yang ditegakkan di sini: **null diteruskan sebagai undefined,
   bukan 0**. Mesin membedakan "belum diukur" dari "diukur nol" (jebakan #10);
   membuang perbedaan itu di lapisan tampilan akan menampilkan jaminan palsu —
   "Bundle 0%" pada token yang bundler-nya tak pernah dihitung.
   ───────────────────────────────────────────────────────────────────────── */

/** Harga SOL perkiraan — hanya untuk mengubah mcap SOL → USD di tampilan. */
/** Kurs cadangan, HANYA dipakai bila API tak mengirim `sol_usd`.
 *
 * ⛔ Nilai ini dulu dikode keras sebagai satu-satunya sumber, dan terukur
 * 2026-09-24 kurs nyata **$115,05** — jadi seluruh nilai USD di kartu
 * terlalu tinggi **65%** sekaligus: likuiditas, market cap, volume.
 *
 * ⚠️ Angka yang salah secara konsisten lebih berbahaya daripada angka yang
 * hilang: ia terlihat wajar dan tak ada yang memeriksanya. Kurs sekarang
 * datang dari respons API; konstanta ini hanya jaring pengaman. */
const SOL_USD_CADANGAN = 190
let SOL_USD = SOL_USD_CADANGAN

/** Dipanggil adapter saat respons API memuat `sol_usd`. */
export function setSolUsd(v: number | null | undefined) {
  if (typeof v === 'number' && v > 1 && v < 10_000) SOL_USD = v
}

/**
 * Bobot faktor risiko.
 *
 * ⚠️ Angka ini MURNI TAMPILAN — ia tidak berasal dari skor mesin dan tidak
 * boleh dibaca sebagai kontribusi sebenarnya terhadap skor. Bobot asli ada di
 * `skor2_rincian`, yang sengaja tak dikirim ke klien karena menyebut nama
 * sinyal & ambang.
 *
 * Arahnya (positif/negatif) mengikuti temuan terukur, jadi ia tak menyesatkan
 * meski besarannya bukan angka mesin.
 */
// ⭐ 22 Nov: ambang dari tabel bersama `features/risk/ambang.ts`; besaran bobot tetap di sini (tampilan saja).
const BOBOT_DEV: Record<Tingkat, number> = { aman: 0, waspada: -4, berat: -10 }
const BOBOT_TANDAI: Record<Tingkat, number> = { aman: 0, waspada: -5, berat: -10 }
const BOBOT_KONSENTRASI: Record<Tingkat, number> = { aman: 0, waspada: -4, berat: -8 }

function bobot(kind: RiskFactor['kind'], pct: number): number {
  switch (kind) {
    // ⛔ Terukur: top10 TINGGI justru lebih sering pada winner (29,18 vs rug
    // 20,32 — jebakan #29). Jadi tak ditandai buruk hanya karena tinggi;
    // hanya ekstremnya yang berarti.
    case 'holders':
      return tingkat('top10', pct) === 'berat' ? -8 : 0

    // Rata terukur: rug 0,93 · winner 0,44 · survive 0,23.
    case 'devHolding':
      return BOBOT_DEV[tingkat('dev', pct)]

    // ⭐⭐ `same_slot_tx` — HITUNGAN transaksi dalam satu slot, bukan persen.
    //
    // ⛔ Ambang sebelumnya (30/50) warisan dari `gmgn_bundler_rate` yang
    // berupa PERSEN. Setelah badge diganti ke data synt, nilainya berkisar
    // 4-31 dan ambang 30 praktis tak pernah tercapai — itu sebabnya kolom
    // TOP RISK menulis "No major flags" pada baris yang jelas berisiko.
    //
    // Rata terukur: rug **11,6** · dead 6,2 · survive 6,1 · winner **5,6**.
    case 'bundler':
      return pct >= 20 ? -10 : pct >= 12 ? -5 : 0

    // ⭐⭐ `blacklist_hits` — pemisah TERKUAT dari semua badge (3,2×).
    // Rata terukur: rug **7,33** · dead 5,16 · survive 3,42 · winner **2,46**.
    //
    // ⛔ Sebelumnya tak punya `case` sama sekali sehingga jatuh ke `default:
    // return 0` — badge dihitung tapi bobotnya nol, jadi tak pernah muncul.
    // ⚠️ HITUNGAN wallet, bukan skornya: skor blacklist berkorelasi TERBALIK
    // (winner 32 vs rug 18) karena menandai wallet infrastruktur (jebakan #19).
    case 'blacklist':
      return BOBOT_TANDAI[tingkat('tandai', pct)]

    // Keragaman wallet 0-100. ⚠️ Arahnya TERBALIK dari namanya: tinggi =
    // terkonsentrasi. Rata terukur: rug 0,641 · winner 0,243.
    case 'insiders':
      return BOBOT_KONSENTRASI[tingkat('konsentrasi', pct)]

    default:
      return 0
  }
}

/**
 * Faktor risiko yang BENAR-BENAR terukur.
 *
 * ⛔ Yang null dilewati sepenuhnya, bukan dirender sebagai 0. Badge yang
 * hilang jujur; badge "0%" adalah klaim.
 */
function faktor(r: TrenchItem['risk']): RiskFactor[] {
  const out: RiskFactor[] = []
  const tambah = (kind: RiskFactor['kind'], v: number | null) => {
    if (v === null || Number.isNaN(v)) return
    out.push({ kind, pct: v, weight: bobot(kind, v) })
  }
  tambah('holders', r.top10_pct)
  tambah('devHolding', r.dev_pct)
  // ⭐ `same_slot_tx` adalah HITUNGAN transaksi, bukan persen — dipetakan ke
  // slot 'bundler' karena itulah yang diukurnya (banyak wallet dalam SATU
  // slot = bundle). UI menampilkannya dgn satuannya sendiri, bukan "%".
  // ⛔ DISEMBUNYIKAN 2026-10-22: `same_slot_tx` SELALU 0 (2.000 audit terakhir) — pengukurnya (tahap-2 `v10_tx_awal`)
  // dicabut 2026-09-02, jadi "Slot 0" di tiap baris adalah artefak KETIADAAN data, bukan hasil ukur (jebakan #10 synt-v10).
  // Hidupkan lagi hanya bila engine kembali mengisinya.
  // tambah('bundler', r.same_slot_tx)
  // Keragaman 0-1 → 0-100 untuk tampilan.
  if (r.wallet_diversity !== null) tambah('insiders', r.wallet_diversity * 100)
  // ⚠️ HITUNGAN wallet, bukan persen — UI menampilkannya dgn satuannya sendiri.
  tambah('blacklist', r.blacklist_hits)
  return out
}

/** Label dari `skor_sehat` 0-6. Ambangnya terukur, bukan karangan tampilan.
 *
 * ⛔ Menggantikan `labelSkor(tier)` 2026-10-04. Tier lama terukur TERBALIK
 * pada sumbu yang penting: tier 1 ("Clean") memuat 56,1% rug sementara
 * tier 4 ("Danger") hanya 13,8% — label itu menyesatkan pembaca.
 *
 * ⭐ Diukur pada n=10.570, patokan publikasi:
 *   skor_sehat >= 5 → rug 11,9% (base 22,8%), winner praktis sama
 *   skor_sehat <= 2 → rug jauh di atas base
 *
 * ⚠️ Kata-katanya sengaja TIDAK menjanjikan keamanan. `skor_sehat` mengukur
 * identitas pelaku (siapa dev & holder-nya), bukan ramalan harga — dan 11,9%
 * rug pada tingkat tertinggi tetap angka yang besar.
 */
function labelSehat(skor: number | null): string | undefined {
  if (skor === null || skor === undefined) return undefined
  if (skor >= 5) return 'Few flags'
  if (skor >= 3) return 'Some flags'
  return 'Many flags'
}

/**
 * ⛔ Base rate rug per tier — WAJIB tampil bersama skor (PRODUK.md §0).
 *
 * Terukur pada 966 token berlabel bersih (cohort g2-1.1, 2026-08-27).
 * Tanpa angka ini skor berubah jadi jaminan palsu: "skor 82" terbaca sebagai
 * aman, padahal tier 1 pun 10,1% berakhir rug.
 */
const BASE_RATE_RUG: Record<number, number> = { 1: 10.1, 2: 24.4, 3: 56.0, 4: 63.8 }
const BASE_RATE_WINNER: Record<number, number> = { 1: 58.2, 2: 24.0, 3: 9.1, 4: 9.4 }

export function adaptTrench(it: TrenchItem, rank: number): TrenchRow {
  // ⛔ putaran 2: data hilang = null → tabel menulis "—", bukan $0 / +0.0% / 0 (sama dgn TokenPanel & halaman token)
  // ⭐ P2: pair lulus, harga pasca-lulus belum dimuat synt → MC/persen/ATH/retensi = angka kelulusan beku → null ("—") + label
  const beku = pasarPascaLulusBelumDimuat(it)
  const mcapUsd = !beku && (it.mcap_sol ?? 0) > 0 ? (it.mcap_sol as number) * SOL_USD : null
  const txs = { buys: it.buys ?? 0, sells: it.sells ?? 0 }

  return {
    mint: it.mint,
    rank,
    symbol: it.symbol,
    // Handle sosial: hanya bila token benar-benar punya Twitter.
    handle: it.twitter ? `@${it.twitter.replace(/^.*\//, '')}` : null,
    avatar: gambarToken(it),

    marketCap: mcapUsd,
    // harga kini vs harga pertama mesin ("since launch"); null → "—"
    marketCapChange: beku ? null : it.change_pct ?? null,
    // ⚠️ ATH belum diukur mesin untuk feed ini. Dipakai mcap saat ini supaya
    // kolom tak menampilkan angka karangan; nilainya jadi "belum melampaui".
    athMarketCap: mcapUsd,
    // null/0 → "—"; > 0 & < $1 → "<$1" (helper bersama labels.ts)
    liquidity: likuiditasUsd(it.liquidity_sol, SOL_USD),
    // ⬜ Volume 1 menit belum tersedia — v10_flow menyimpan kumulatif, bukan
    // jendela bergerak. Nol di sini berarti "belum dihitung".
    volume1m: 0,

    txs1m: txs,
    traders: it.traders ?? undefined,
    // ⭐ Dari GMGN — satu-satunya hitungan holder yang sah. `holders_checked`
    // TIDAK dipakai: itu "berapa alamat yang DIPERIKSA" (rata 1-19), dan
    // menampilkannya sbg jumlah holder membuat token ramai terlihat sepi.
    holders: it.holders ? it.holders : null,
    totalFeesSol: 0,

    // ⭐ Skor audit 0-100 dari server (sejak 2026-10-10). Label & warna tetap
    // dari skor sehat mentah 0-6 (`checks`) — ambangnya terukur di skala itu.
    score: it.score ?? undefined,
    checks: it.checks ?? undefined,
    scoreLabel: labelSehat(it.checks ?? null),
    scoreTrend: it.trend,
    // ⛔ WAJIB tampil bersama skor (PRODUK.md §0). Tanpa penyebutnya, "82"
    // terbaca sebagai jaminan — padahal tier 1 pun 10,1% berakhir rug.
    //
    // ⛔ Versi lama mencari lewat `it.tier`, padahal API mengirim `tier_lama`
    // sejak 2026-10-04 — base rate TAK PERNAH tampil di tabel ini. Kini dari
    // server, tabel yang SAMA dgn sumber skornya (synt-dash `skor_audit`).
    baseRateRug: it.collapse_rate_pct ?? undefined,
    baseRateWinner: it.rose3x_rate_pct ?? undefined,
    lastTradeSecsAgo: it.last_trade_secs_ago ?? undefined,

    graduationPct: it.graduation_pct ?? undefined,
    // Dibulatkan di sini — server mengirim float penuh (99.6815874480849).
    priceRetention: beku || it.retention_pct == null ? undefined : Math.round(it.retention_pct),
    marketNotLoaded: beku,
    complete: it.complete ?? undefined,
    ageMinutes: Math.floor(it.age_secs / 60),
    ageSecs: it.age_secs,

    factors: faktor(it.risk),
    // ⭐ Deret skor gate-1b, ≤11 titik. Inilah yang tak dimiliki terminal
    // lain: mereka menampilkan KEADAAN, synt menampilkan LINTASAN.
    scoreHistory: it.spark ?? undefined,
  }
}

export { BASE_RATE_RUG, BASE_RATE_WINNER }
