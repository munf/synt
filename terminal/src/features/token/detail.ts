import type { SumberGambar } from '@/components/Avatar'
/* ─────────────────────────────────────────────────────────────────────────
   Bentuk data halaman detail coin.

   ⚠️ Dari rancangan produk, bukan dari API. PRODUK.md §1.2: yang dijual
   synt adalah SKOR AUDIT, bukan chart — jadi halaman ini berporos pada
   evolusi skor sepanjang jendela 10 menit, dengan harga sebagai konteks.
   Itu yang membedakannya dari terminal lain: di sana chart adalah bintangnya,
   di sini chart adalah latar bagi penilaian.
   ───────────────────────────────────────────────────────────────────────── */

/** Satu titik pada kurva harga. */
export interface Candle {
  /** Menit ke-berapa sejak pair terdeteksi. */
  t: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Snapshot skor pada satu titik waktu.
 *
 * synt-v10 merekam penilaian pada menit 3/5/10/30 (README §4). Deret inilah
 * "evolusi skor" — nilai jual utama terminal, dan sesuatu yang tak dimiliki
 * terminal lain karena mereka tak melakukan audit.
 */
export interface ScorePoint {
  /** Menit ke-berapa sejak pair terdeteksi. */
  t: number
  /** Skor risiko 0–100. Angka publik, monoton (PRODUK.md §1.2). */
  score: number
  /** Label ringkas saat itu, mis. "clean" / "mixed" / "danger". */
  label: string
}

/** Satu baris pemegang token. */
export interface Holder {
  rank: number
  /** Alamat sudah dipersingkat untuk tampilan. */
  address: string
  /** Butir 8: alamat lengkap (data nyata) → tautan wallet tracker. Contoh: tak diisi. */
  owner?: string
  /** Persentase supply. */
  pct: number
  /** Nilai posisi dalam USD. null bila tak terhitung. */
  valueUsd: number | null
  /** Penanda khusus: dev, bundler, sniper, insider. */
  tag: 'dev' | 'bundler' | 'sniper' | 'insider' | null
}

/** Transaksi terakhir pada pair. */
export interface Swap {
  time: string
  side: 'buy' | 'sell'
  /** Jumlah token. */
  amount: number
  /** Nilai dalam USD. */
  valueUsd: number
  /** Alamat pelaku, dipersingkat. */
  trader: string
}

/**
 * Satu wallet yang aktif memperdagangkan pair ini.
 *
 * ⬜ BELUM ADA di synt-dash. Bentuk ini sengaja ditetapkan lebih dulu supaya
 * stream data punya acuan: begitu mesin menyediakannya, adapter tinggal
 * mengisi — tak perlu menegosiasikan ulang bentuk tampilannya.
 *
 * ⛔ TIDAK ada field PnL. Cakupan riwayat transaksi 11% (PRODUK.md §1.3),
 * jadi untung-rugi per-trader akan salah untuk 89% wallet. Yang bisa
 * dipertanggungjawabkan adalah AKTIVITAS-nya.
 */
export interface Trader {
  /** Alamat sudah dipersingkat untuk tampilan. */
  address: string
  buys: number
  sells: number
  /** Total nilai yang diperdagangkan, USD. */
  volumeUsd: number
  /** Penanda khusus, sama kosakatanya dgn Holder. */
  tag: 'dev' | 'bundler' | 'sniper' | 'insider' | null
}

/**
 * Posisi terbuka milik pengguna pada pair ini.
 *
 * ⬜ BELUM ADA — butuh wallet tersambung DAN riwayat transaksi penuh.
 *
 * ⭐ Yang ditampilkan adalah SKOR SAAT MASUK → SKOR SEKARANG, bukan
 * untung-rugi. Itu satu-satunya sudut pandang yang datanya sanggup dukung,
 * dan justru lebih relevan dgn produk: apakah audit membaik atau memburuk
 * sejak Anda masuk.
 */
export interface Position {
  /** Skor audit saat posisi dibuka. */
  scoreAtEntry: number
  /** Skor audit sekarang. */
  scoreNow: number
  /** Kapan posisi dibuka, sudah diformat. */
  openedAgo: string
  /** Ukuran posisi dalam SOL. */
  sizeSol: number
}

/**
 * Satu faktor yang menyusun skor.
 *
 * ⭐ Ini inti pembeda synt: setiap angka bisa ditelusuri ke alasannya.
 * `weight` bertanda — negatif menurunkan skor, positif menaikkan — supaya
 * UI bisa menunjukkan arah pengaruh, bukan hanya besarannya.
 */
export interface ScoreFactor {
  id: string
  label: string
  /** Kontribusi ke skor akhir; negatif = menurunkan. */
  weight: number
  /** Penjelasan satu kalimat dalam bahasa manusia (peran AI, PRODUK.md §1.2). */
  detail: string
  passed: boolean
}

export interface CoinDetail {
  mint: string
  symbol: string
  name: string
  avatar: SumberGambar
  /** Sumber likuiditas: pump.fun, raydium, dll. `null` = data tak menyebutnya (UI: "Not reported", bukan tebakan). */
  launchpad: string | null
  /** Asal nilai launchpad (tooltip). */
  launchpadTitle?: string
  createdAgo: string
  /** Alamat penuh — untuk disalin. */
  address: string
  socials: { website?: string; twitter?: string; telegram?: string }

  price: number
  /** ⭐ 1c: harga kini vs harga PERTAMA di `v10_flow` (synt-dash `harga_awal`) = sejak launch, BUKAN 24 jam.
   *  null = tak terukur. */
  changeSinceLaunch: number | null
  /** ⭐ P2: lulus, harga pasca-lulus belum dimuat synt (labels.ts `pasarPascaLulusBelumDimuat`). MC & persen sudah null. */
  marketNotLoaded: boolean
  /** null = tak bisa dihitung jujur: mesin menghitung MC = harga × supply pump.fun (1 M), salah utk token non-pump. */
  marketCap: number | null
  /** ⭐ 1c: net SOL (beli − jual) × kurs dalam jendela ukur mesin 0–`windowSecs` (maks 600 dtk), BERTANDA.
   *  BUKAN volume, BUKAN 24 jam. null = tak terukur. */
  netFlowUsd: number | null
  /** ⭐ Butir 7: hitungan perubahan cadangan kurva dalam jendela ukur 0–`windowSecs` (synt-v10 `stream/flow.rs`:
   *  vSOL naik = beli, turun = jual; satu notifikasi akun = satu hitungan, jadi beberapa trade dalam satu slot bisa
   *  terhitung satu). BUKAN jumlah wallet, BUKAN 24 jam. null = tak terukur. */
  curveBuys: number | null
  curveSells: number | null
  /** null = mesin tak punya likuiditas (pair tak dilacak: BONK/USDC datang 0 / 8e-9 SOL). */
  liquidity: number | null
  holders: number
  /** ⭐ 1c: konsentrasi top-10 SAAT AUDIT (`risk.top10_pct`, sekali), bukan live. null = tak terukur. */
  top10Pct: number | null
  /** Bukti token pump.fun dari mesin: `launchpad` menyebut pump.fun atau mint vanity `…pump`. */
  pumpBukti: boolean

  /** Progres kurva 0–100; 100 = sudah lulus ke AMM. */
  graduationPct: number
  complete: boolean
  /**
   * Status kurva MENURUT MESIN (AGEN-BUILD butir 1b, 2026-10-25):
   * 'graduated' = `complete`; 'curve' = mesin melihat pair di bonding curve (progres/MC > 0);
   * 'unknown' = mesin tak punya data kurva (mis. USDC dibuka langsung: 200, `complete:false`, semua 0).
   * ⛔ `complete === false` saja BUKAN bukti pair di kurva.
   */
  curveState: 'graduated' | 'curve' | 'unknown'
  /** Umur pair (detik) & jendela ukur mesin (`window_secs`). Selisih besar = data kurva mesin BEKU di akhir jendela
   *  (synt-stream tak lagi memegang pair), jadi progres kurva mesin tak boleh ditulis sbg keadaan sekarang. */
  ageSecs: number
  windowSecs: number

  /** Skor audit terkini 0–100 dan base rate populasinya. */
  score: number
  scoreLabel: string
  /**
   * Persen token pada skor ini yang kemudian runtuh.
   *
   * ⛔ WAJIB ditampilkan bersama skor (PRODUK.md §0): "Skor 72 TETAP 18,9%
   * rug". Menyembunyikannya mengubah skor audit jadi jaminan palsu.
   */
  baseRateRug: number
  /** Persen token pada skor ini yang naik ≥3×. */
  baseRateWinner: number
  /** A4: skor & base rate benar-benar ada (API `score` dan `collapse_rate_pct` tak null). Absen (contoh) → `score > 0`. */
  scoreKnown?: boolean
  /** A4: umur pair saat dinilai (detik), utk "scored at 10m". null/absen = tak diketahui. */
  scoredAtAgeSecs?: number | null

  scoreHistory: ScorePoint[]
  factors: ScoreFactor[]
  candles: Candle[]
  holdersList: Holder[]
  /** ⬜ Mock — lihat `Trader`. */
  tradersList: Trader[]
  /** ⬜ Mock — lihat `Position`. Kosong bila wallet tak tersambung. */
  positions: Position[]
  swaps: Swap[]

  /** Ringkasan naratif dari agent — PENJELAS, bukan penentu skor. */
  agentSummary: string
  agentConfidence: number
}
