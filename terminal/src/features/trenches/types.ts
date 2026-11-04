import type { SumberGambar } from '@/components/Avatar'
/* ─────────────────────────────────────────────────────────────────────────
   Bentuk data layar Trenches.

   ⚠️ Ditulis dari MOCKUP FIGMA, bukan dari synt-dash. Kolom di sini adalah
   apa yang desain minta ditampilkan — belum tentu apa yang API sanggup
   berikan. Saat menyambung ke synt-dash nanti, bandingkan dengan src/api.rs
   dan sesuaikan: yang tidak tersedia dijadikan opsional, bukan dipaksa ada.

   Semua angka disimpan sebagai number mentah, bukan string terformat.
   Pemformatan ("$73.9K", "+184.2%") adalah urusan tampilan — lihat format.ts.
   Menyimpan string terformat berarti kehilangan kemampuan mengurutkan.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Faktor risiko yang memengaruhi skor.
 *
 * ⭐ Ini pengganti "TOKEN INFO" lama. Bedanya bukan kosmetik: badge lama
 * hanya menyatakan angka, sedangkan ini membawa `weight` — pengaruhnya
 * terhadap skor. Itu yang membuat Trenches menjelaskan penilaian, bukan
 * sekadar memajang metrik.
 */
export interface RiskFactor {
  kind:
    | 'holders'
    | 'devHolding'
    | 'snipers'
    | 'insiders'
    | 'bundler'
    | 'authority'
    /**
     * ⭐ Jumlah wallet yang pernah tercatat di blacklist — HITUNGAN, bukan skor.
     *
     * Terukur memisahkan paling tajam dari semua badge: rug **6,42** vs winner
     * **2,01** (3,2×), mengungguli `same_slot_tx` (2,6×).
     *
     * ⛔ Yang dipakai WAJIB hitungannya. Skor blacklist berkorelasi TERBALIK
     * (winner 32 vs rug 18) karena menandai wallet infrastruktur yang hadir di
     * mana-mana — jebakan #19. Jangan pernah menampilkan skor itu.
     */
    | 'blacklist'
  /** 0–100. Ambang mana yang dianggap buruk berbeda per `kind`. */
  pct: number
  /** Kontribusi ke skor; negatif menurunkan. */
  weight: number
}

/** Alias lama — beberapa komponen masih memakainya. */
export type TokenInfoBadge = RiskFactor

export interface TrenchRow {
  /** Mint base58 — identitas sebenarnya, dipakai sebagai key & tujuan link. */
  mint: string
  rank: number
  symbol: string
  /** Handle sosial, sudah termasuk "@". Bisa null bila token tak punya. */
  handle: string | null
  /** Sumber avatar (`gambarToken`: thumbnail K3 lalu asli). null → inisial simbol. */
  avatar: SumberGambar

  /** null = mesin tak mengirim (tampil "—", bukan $0) — 2m/1d putaran 2. */
  marketCap: number | null
  /** Perubahan MC dalam persen; negatif berarti turun. */
  marketCapChange: number | null
  athMarketCap: number | null
  /** USD; null = tak ada data. > 0 tapi < $1 = kurva terkuras, tampil "<$1". */
  liquidity: number | null
  volume1m: number

  /** Total transaksi 1 menit, dipecah arah beli/jual. */
  txs1m: { buys: number; sells: number }
  holders: number | null
  /** ⭐ Trader unik dari riwayat tx penuh. `undefined` = belum diambil. */
  traders?: number
  /**
   * Biaya total dalam SOL.
   *
   * ⚠️ Sebelumnya bernama `totalFeesEth` — itu keliru. synt beroperasi di
   * Solana (synt-v10 memantau pump.fun), jadi satuannya SOL.
   */
  totalFeesSol: number

  /**
   * Synt score 0–1000. Opsional karena hanya kolom kanan frame 3:2 yang
   * menampilkannya — tabel Trenches utama tidak. `undefined` dirender
   * sebagai "—", bukan 0: belum dinilai ≠ dinilai nol.
   */
  score?: number

  /**
   * Progres menuju graduasi, 0–100. Padanan `graduation_pct` di
   * synt-v10 (pattern.rs). Opsional sampai API menyediakannya.
   */
  graduationPct?: number

  /** Umur pair dalam menit — dipakai tampilan "new pair". */
  ageMinutes?: number

  /** Umur pair dalam detik (`age_secs` server, utuh) — dipakai kolom AGE agar pair <1 menit tampil "45s", bukan "0s". */
  ageSecs?: number

  /**
   * true = likuiditas sudah pindah ke AMM. Padanan flag `complete` yang
   * dipakai scorer.rs untuk alasan "graduated". Opsional sampai API
   * menyediakannya.
   */
  complete?: boolean

  /** ⭐ P2: lulus, harga pasca-lulus belum dimuat synt (labels.ts `pasarPascaLulusBelumDimuat`). MC, persen & retensi sudah null. */
  marketNotLoaded?: boolean

  /** Faktor risiko dengan bobotnya. Menggantikan `badges`. */
  factors: RiskFactor[]

  /**
   * Riwayat skor pada menit 3/5/10/30 (README §4).
   *
   * ⭐ Deret inilah nilai jual utama terminal — tak ada terminal lain yang
   * punya karena mereka tidak melakukan audit. Dipakai menggambar sparkline
   * evolusi di tiap baris.
   */
  scoreHistory?: number[]

  /** Label skor: "Clean" / "Mixed" / "Danger". */
  scoreLabel?: string
  /** Skor sehat mentah 0-6 — dasar `score` 0-100; dipakai untuk warna & label. */
  checks?: number
  /** Detik sejak trade terakhir (synt-stream). */
  lastTradeSecsAgo?: number

  /**
   * ⭐ Arah lintasan skor. `held` terukur 2,6× lebih baik daripada `climbed`
   * pada level skor yang sama.
   */
  scoreTrend?: 'climbed' | 'fell' | 'held' | 'unknown'

  /** ⭐ Persen pair pada tier ini yang naik ≥3×. Pasangan `baseRateRug`. */
  baseRateWinner?: number

  /**
   * Persen token pada skor ini yang kemudian runtuh.
   * ⛔ PRODUK.md §0 mewajibkan angka ini tampil bersama skor.
   */
  baseRateRug?: number

  /** Retensi harga terhadap puncak, 0–100. Dipakai tampilan "graduated". */
  priceRetention?: number

  /** Mint & freeze authority sudah dicabut. */
  authoritiesRevoked?: boolean
}
