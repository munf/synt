/* ─────────────────────────────────────────────────────────────────────────
   Bentuk respons synt-dash.

   ⚠️ Ditulis tangan dari src/api.rs, BUKAN digenerate. Handler Rust membangun
   JSON lewat json!() inline, bukan struct ber-Serialize, jadi tak ada skema
   yang bisa diekspor. Konsekuensinya: kalau api.rs berubah, file ini TIDAK
   ikut berubah dan TypeScript tidak akan mengeluh — ia hanya berbohong dengan
   percaya diri.

   Karena itu setiap tipe menyebut handler asalnya. Saat menyentuh salah satu
   endpoint di synt-dash, perbarui pasangannya di sini.
   ───────────────────────────────────────────────────────────────────────── */

/** Klasifikasi hasil setelah jendela outcome tertutup. `null` = belum tertutup. */
export type Outcome = 'win' | 'loss' | 'neutral' | null

/** Satu baris skor. Sumber: `scores()` — src/api.rs:588 */
export interface ScoreItem {
  /** Sudah diformat "%H:%M:%S" di sisi server, bukan ISO timestamp. */
  time: string
  /** Simbol coin; fallback ke 6 karakter pertama mint bila kosong. */
  symbol: string
  /** Mint base58 penuh — dipakai untuk verifikasi di explorer. */
  mint: string
  /** Bilangan bulat 0–100 (server sudah mengalikan 100 dan membulatkan). */
  score: number
  /** Alasan dari AI. `null` bila belum ada reasoning. */
  reason: string | null
  outcome: Outcome
}

/** Sumber: `scores()` — src/api.rs:588 */
export interface ScoresResponse {
  items: ScoreItem[]
}


/* ── Feed Trenches ─────────────────────────────────────────────────────────
   Sumber: `trenches()` — synt-dash src/api.rs

   ⚠️ SEMUA angka `number | null`. Null berarti BELUM DIUKUR, bukan nol —
   membedakan keduanya adalah aturan yang ditegakkan di sisi mesin (jebakan
   #10) dan UI harus meneruskannya sebagai "—", bukan 0.

   ⛔ `skor2_rincian` & `veto_sebab` SENGAJA tak ada di sini. Keduanya menyebut
   nama sinyal & ambang; synt-dash menahannya dari jalur publik. Yang boleh
   keluar hanya HASIL. */

/**
 * Badge TOP RISK — seluruhnya dari DATA MILIK SYNT.
 *
 * ⭐ Keputusan pemilik proyek 2026-08-27: terminal berhenti menampilkan angka
 * pihak ketiga. Alasannya terukur: cakupan rate GMGN yang SAH hanya 34,2%
 * (333 dari 975) karena `holder_count <= 5` membuat nilainya artefak. Sinyal
 * milik synt terisi 100% dan memisahkan lebih tajam.
 *
 * ⚠️ GMGN tetap dipakai MESIN untuk skoring — yang dilepas hanya tampilannya.
 */
export interface TrenchRisk {
  /** Porsi supply di 10 wallet teratas, 0-100. */
  top10_pct: number | null
  /** Porsi yang dipegang creator, 0-100. */
  dev_pct: number | null
  /**
   * ⭐ Bundle sesungguhnya: berapa transaksi jatuh di SLOT yang sama.
   *
   * Presisi slot, bukan detik — 1 detik Solana ≈ 2,5 slot, jadi "satu blok"
   * tak terdeteksi dari blockTime. Terukur memisahkan tajam:
   * rug **14,2** vs winner **5,4**.
   */
  same_slot_tx: number | null
  /** Sebaran pembeli 0-1. Rendah = terkonsentrasi (rug 0,64 vs winner 0,22). */
  wallet_diversity: number | null
  /**
   * Jumlah wallet yang pernah tercatat di blacklist.
   *
   * ⚠️ HITUNGAN saja, bukan skornya. Skor blacklist berkorelasi TERBALIK
   * (winner 32 vs rug 18) karena menandai wallet infrastruktur yang hadir di
   * mana-mana — jangan pernah menampilkannya sebagai tingkat bahaya.
   */
  blacklist_hits: number | null
  /** Ketimpangan kepemilikan 0-1. Terisi ~76%. */
  gini: number | null
}

/** Satu baris feed. Sumber: `trenches()` */
export interface TrenchItem {
  mint: string
  /** Fallback ke 6 karakter pertama mint bila metadata tak ada (~25% token). */
  symbol: string
  name: string | null
  image: string | null
  /** K3 (backend sedang dibuat): URL proxy thumbnail. Boleh absen; UI mencoba ini dulu lalu `image` asli. */
  image_thumb?: string | null
  twitter: string | null

  age_secs: number
  price_usd: number | null
  /** Perubahan harga sejak sampel pertama, dalam persen. */
  change_pct: number | null
  mcap_sol: number | null
  liquidity_sol: number | null
  buys: number | null
  sells: number | null
  graduation_pct: number | null
  /**
   * ⭐ Harga sekarang relatif PUNCAK dalam jendela ukur, 0-100.
   *
   * Terukur memisahkan tajam: rug **20,5%** vs winner **91,6%**. Inilah yang
   * membedakan tab `graduated` — di sana rug puncaknya rata 8,29× lalu jatuh,
   * jadi tanpa retensi keduanya terlihat sama-sama sudah naik tinggi.
   *
   * ⚠️ Sering mendekati 100% pada pair yang baru saja lulus: puncaknya belum
   * terlewat. Itu keadaan sah, bukan kolom rusak.
   */
  retention_pct: number | null
  complete: boolean | null

  /**
   * ⭐ Skor audit 0-100 = 100 − % pair berprofil sama yang RUNTUH (server,
   * `skor_audit` di synt-dash). Sejak 2026-10-10; sebelumnya 0-6.
   * `null` = belum dinilai (skor pertama ~detik 198).
   */
  score: number | null
  /** Selalu 100 sejak 2026-10-10. */
  score_max?: number
  /** ⭐ Base rate yang WAJIB tampil di sebelah skor (PRODUK.md §0). */
  collapse_rate_pct?: number | null
  /** ⚠️ TIDAK monoton — skor memisahkan yang runtuh, bukan meramal naik. */
  rose3x_rate_pct?: number | null
  /** Mentah: skor sehat 0-6 — dasar `score`. Dipakai untuk label. */
  checks?: number | null
  checks_max?: number
  /** Asal `holders`: "gmgn_at_audit" = jumlah GMGN saat audit, bukan live. */
  holders_source?: string | null
  /** ⭐ Detik sejak trade terakhir yang dilihat synt-stream. `null` = tak terukur. */
  last_trade_secs_ago?: number | null
  /** Kategori 1-4. `null` = belum dinilai. */
  tier: number | null
  risk: TrenchRisk

  /**
   * Penjelasan AI dalam bahasa manusia.
   *
   * ⭐ Sudah melewati kamus penerjemah di sisi mesin, jadi tak menyebut satu
   * pun nama sinyal internal. Aman ditampilkan apa adanya.
   */
  /**
   * ⭐ Deret skor gate-1b, ≤11 titik — sparkline evolusi.
   *
   * ⚠️ Ditampilkan sebagai BENTUK, bukan angka. Skor gate-1b terukur TAK
   * monoton: bucket 80-99 justru rug tertinggi (56,1%) lalu anjlok ke 1,9%
   * di skor 100. Angka yang ditampilkan adalah `score` (gate-2), yang monoton
   * sempurna di kedua arah.
   */
  spark: number[] | null

  /**
   * Arah lintasan skor sepanjang jendela ukur.
   *
   * ⭐ Sinyal yang tak dimiliki terminal lain — mereka tak menilai berulang.
   * Terukur pada pair dgn skor akhir sama-sama 80+:
   * `held` **41,0%** winner vs `climbed` **15,6%**.
   *
   * ⚠️ Berlawanan dgn intuisi, dan itu justru nilainya: naik ke 80 lebih
   * buruk daripada sejak awal 80 dan bertahan.
   */
  trend: 'climbed' | 'fell' | 'held' | 'unknown'

  /**
   * ⭐ Trader unik — dari riwayat tx PENUH (`v10_tx_keluar`), bukan sampel.
   *
   * ⚠️ Tiga kandidat lain ditolak karena semuanya sampel: `wallet_unique`
   * (rata 16, wallet yang terlihat di probe), `v10_holder` (25 alamat
   * teratas), `v10_tx_awal` (25 tx pertama). Menampilkan salah satunya sbg
   * "total" akan salah besar.
   *
   * Cakupan ~80% — `null` pada pair yang riwayatnya belum diambil.
   */
  traders: number | null

  /**
   * Jumlah holder dari GMGN. Cakupan ~68-100% tergantung umur pair.
   *
   * ⛔ JANGAN diganti `holders_checked` — itu "berapa alamat yang DIPERIKSA"
   * (rata 1-19), artinya berbeda sama sekali dan akan terbaca sbg token sepi.
   */
  holders: number | null

  explanation: string | null
  /**
   * ⭐ Berapa komponen skor yang BENAR-BENAR terukur, dari `signals_total`.
   *
   * Ini kelengkapan DATA, bukan keyakinan model — dan itu lebih jujur: synt
   * tak punya angka keyakinan, tapi tahu persis berapa sinyal yang berhasil
   * diukur. Terukur: 176 pair punya 12/12, sementara 38 hanya 3/12.
   */
  signals_measured: number | null
  signals_total: number
}

export interface TrenchesResponse {
  /** ⭐ Kurs SOL→USD dari server. Sebelumnya klien memakai konstanta 190
   *  sementara kurs nyata $115 — seluruh nilai USD terlalu tinggi 65%. */
  sol_usd?: number | null
  view: string
  items: TrenchItem[]
}


/* ── Chart: harga + evolusi skor ───────────────────────────────────────────
   Sumber: `chart()` — synt-dash src/api.rs */

/** Satu titik dalam jendela ukur (detik 1-600). Harga dalam USD. */
export interface FlowPoint {
  /** Detik sejak pair terdeteksi. */
  t: number
  price: number | null
  mcap_sol: number | null
  liq_sol: number | null
  buys: number | null
  sells: number | null
}

/**
 * Titik setelah jendela ukur (detik 600+), dari synt-stream.
 *
 * ⚠️ Harga dalam **SOL**, bukan USD — sumbernya reserve on-chain langsung dan
 * tak ada kurs SOL/USD yang tersimpan bersamanya. Klien WAJIB menormalkan
 * sebelum menggambar di sumbu yang sama.
 *
 * ⚠️ Kosong berarti "tak ada yang membuka pair ini", BUKAN "harga tak
 * bergerak" — langganan bersifat atas permintaan.
 */
export interface LanjutPoint {
  t: number
  price_sol: number
  liq_sol: number | null
}

/**
 * Satu titik penilaian.
 *
 * ⭐ Dari `v10_gate1_riwayat` yang bertimestamp per evaluasi, jadi tiap titik
 * menyatakan skor PADA SAAT ITU — bukan keadaan akhir yang diproyeksikan
 * mundur (jebakan #28).
 */
export interface ScorePointApi {
  t: number
  score: number | null
  verdict: string
}

export interface ChartResponse {
  mint: string
  flow: FlowPoint[]
  lanjut: LanjutPoint[]
  skor: ScorePointApi[]
  gate2: { score: number | null; tier: number | null } | null
}

/* ── Endpoint lain: sengaja dibiarkan longgar ──────────────────────────────
   overview/calibration/monitor/changelog belum dipakai terminal. Menuliskan
   tipe rinci sekarang = menebak bentuk yang belum dibutuhkan, dan tebakan itu
   akan basi diam-diam. Persempit saat halaman yang memakainya benar-benar
   dibangun. */
export type OverviewResponse = Record<string, unknown>
export type CalibrationResponse = Record<string, unknown>
export type MonitorResponse = Record<string, unknown>


/* ── Detail satu pair (kartu terminal) ─────────────────────────────────────
   Sumber: `token()` — synt-dash src/api.rs

   ⭐ Prinsip: tampilkan APA ADANYA, termasuk yang kosong. Terukur pada 403
   pair gate-2, 28% tak punya `holders` dan 26% tak punya `gini`.

   ⛔ Menyembunyikan baris saat kosong membuat pembaca mengira metrik itu
   memang tak diukur. `null` yang ditampilkan sbg "not measured" mengakui kita
   belum tahu — dua pesan yang sangat berbeda. */

export interface TokenRisk {
  top10_pct: number | null
  dev_pct: number | null
  same_slot_tx: number | null
  wallet_diversity: number | null
  blacklist_hits: number | null
  gini: number | null
}

export interface TokenDetail {
  mint: string
  symbol: string
  name: string | null
  image: string | null
  /** K3 (backend sedang dibuat): URL proxy thumbnail. Boleh absen; UI mencoba ini dulu lalu `image` asli. */
  image_thumb?: string | null
  socials: { twitter: string | null; website: string | null; telegram: string | null }
  launchpad: string | null
  age_secs: number

  price_usd: number | null
  change_pct: number | null
  mcap_sol: number | null
  liquidity_sol: number | null
  /**
   * ⚠️ Net SOL dalam JENDELA UKUR (0-600 detik), BUKAN 24 jam.
   *
   * Tak ada data 24 jam — `v10_flow` berhenti di detik-600 sebagai keputusan
   * produk. Menampilkan "Volume 24h" berarti mengarang angka.
   */
  net_sol_window: number | null
  window_secs: number
  buys: number | null
  sells: number | null
  graduation_pct: number | null
  complete: boolean | null

  /**
   * ⭐ Skor audit 0-100 = 100 − % pair berprofil sama yang RUNTUH (server,
   * `skor_audit` di synt-dash). Sejak 2026-10-10; sebelumnya 0-6.
   * `null` = belum dinilai (skor pertama ~detik 198).
   */
  score: number | null
  /** Selalu 100 sejak 2026-10-10. */
  score_max?: number
  /** ⭐ Base rate yang WAJIB tampil di sebelah skor (PRODUK.md §0). */
  collapse_rate_pct?: number | null
  /** ⚠️ TIDAK monoton — skor memisahkan yang runtuh, bukan meramal naik. */
  rose3x_rate_pct?: number | null
  /** Mentah: skor sehat 0-6 — dasar `score`. Dipakai untuk label. */
  checks?: number | null
  checks_max?: number
  /** Asal `holders`: "gmgn_at_audit" = jumlah GMGN saat audit, bukan live. */
  holders_source?: string | null
  tier: number | null
  spark: number[]
  /**
   * ⭐ Umur pair SAAT dinilai — kapan dalam hidupnya penilaian dibuat.
   *
   * Skor synt adalah penilaian pada SATU TITIK WAKTU, bukan pemantauan
   * berkelanjutan. Menyembunyikannya membuat produk terlihat seperti sesuatu
   * yang bukan dirinya.
   */
  scored_at_age_secs: number | null
  /** Berapa lama sejak dinilai. Terukur rata **200 menit**, terlama 360. */
  scored_ago_secs: number | null

  risk: TokenRisk
  traders: number | null
  holders: number | null
  /** ⚠️ Aktivitas 100 signature terakhir — BUKAN arah beli/jual. */
  tx_sukses?: number | null
  tx_gagal?: number | null
  explanation: string | null
  /**
   * ⭐ Berapa komponen skor yang BENAR-BENAR terukur, dari `signals_total`.
   *
   * Ini kelengkapan DATA, bukan keyakinan model — dan itu lebih jujur: synt
   * tak punya angka keyakinan, tapi tahu persis berapa sinyal yang berhasil
   * diukur. Terukur: 176 pair punya 12/12, sementara 38 hanya 3/12.
   */
  signals_measured: number | null
  signals_total: number
}


/* ── Holder & swap (halaman detail pair) ───────────────────────────────────
   Sumber: `holders()` — synt-dash src/api.rs */

export interface HolderRow {
  rank: number
  /** Alamat penuh — dipendekkan di tampilan, tapi bisa disalin utuh. */
  owner: string
  /** Persen supply. `null` bila tak terhitung. */
  supply_pct: number | null
  amount: number | null
}

export interface SwapRow {
  trader: string
  /**
   * ⭐ Arah diturunkan dari TANDA `sol_delta`, bukan kolom `beli`.
   *
   * ⛔ Kolom `beli` di DB terukur tak konsisten dgn tandanya: saat
   * `beli=false`, SOL positif pada 6.860 baris dan negatif pada 7.411.
   * Logikanya sendiri benar (butuh SOL keluar DAN token masuk — ketat by
   * design), tapi untuk tampilan yang dibutuhkan hanya ARAH aliran SOL.
   */
  side: 'buy' | 'sell' | 'unknown'
  /** Besaran SOL, selalu positif. Arahnya ada di `side`. */
  sol: number | null
  /** Umur pair saat transaksi terjadi. */
  age_secs: number | null
  slot: number | null
}

export interface HoldersResponse {
  mint: string
  holders: HolderRow[]
  swaps: SwapRow[]
}


/* ── Candle OHLCV (chart) ──────────────────────────────────────────────────
   Sumber: `candles()` — synt-dash src/api.rs */

export interface CandleRow {
  /** Menit sejak pair terdeteksi — sumbu chart memakai UMUR pair. */
  t: number
  o: number
  h: number
  l: number
  c: number
  /**
   * ⚠️ Cadangan SOL kurva TERTINGGI dalam menit itu (synt-stream candle.rs: max(likuiditas)), BUKAN SOL yang bergerak & BUKAN volume perdagangan (beli + jual).
   *
   * Kita tak mengukur yang kedua; menamainya "volume" akan melabeli angka
   * dgn arti yang bukan miliknya.
   */
  vol_sol: number
  /**
   * ⭐ Berapa titik harga menyusun candle ini.
   *
   * Dipakai membedakan candle yang benar-benar terukur dari yang cuma punya
   * satu sampel — candle ber-`n=1` punya OHLC identik dan bukan pergerakan.
   */
  n: number
}

export interface CandlesResponse {
  mint: string
  timeframe_min: number
  candles: CandleRow[]
}

/* ── B1: GET /api/search (synt-dash `cari.rs`) ──
   Hanya identitas token (tanpa skor/label). `total` = SEMUA yang cocok, `results` = maks `limit` (urut tingkat
   cocok: simbol persis, awalan simbol, awalan nama, simbol memuat, nama memuat, awalan mint; terbaru dulu). */
export interface SearchHit {
  mint: string
  /** Bisa string kosong: simbol/nama tak dijamin terisi saat deteksi. */
  symbol: string
  name: string
  detected_at: string
  age_secs: number
}

export interface SearchResponse {
  q: string
  results: SearchHit[]
  total: number
  index: { coins: number; since: string | null; updated_at: string | null }
}

/* ── B3: GET /api/leaderboard/creators (synt-dash `kreator.rs`) ──
   Outcome dari `v10_outcome_v3.outcome` (synt-v10 `outcome.rs`). ⚠️ `labeled` (outcome diketahui) bisa jauh di bawah
   `launches` → persentase WAJIB berpenyebut `labeled`. Hanya creator dgn `labeled` ≥ `min_labeled`, top 200 per
   `launches`. */
export interface CreatorRow {
  creator: string
  launches: number
  labeled: number
  rug: number
  dead: number
  survive: number
  winner: number
  last_launch_at: string | null
}

export interface CreatorsResponse {
  computed_at: string
  since: string | null
  min_labeled: number
  creators: CreatorRow[]
}

/* ── B2: GET /api/wallet?addr= (synt-dash `dompet.rs`, butir 8) ──
   ⛔ BUKAN riwayat trade/PnL (tabel tx per wallet kosong di v10). Hanya yang mesin lihat: token yang diluncurkan
   wallet (`v10_coin.creator`), token tempat wallet masuk 20 holder teratas SAAT pair diaudit (`v10_holder`, potret
   pertama per pair, sejak `holders_since`), dan potret portofolio saat terakhir diaudit (`v10_sidik_wallet`).
   Maks 100 baris per bagian (`*_total` = jumlah sebenarnya). 400 `{status:"bad_address"}` · 503 `{status:"unavailable"}`.
   Wallet tak dikenal = 200 dgn daftar kosong & `wallet: null`. */
export type WalletOutcome = 'rug' | 'dead' | 'survive' | 'winner'

interface WalletTokenBase {
  mint: string
  symbol: string | null
  /** Skor audit publik 0-100 (sama dgn /api/trenches); null = pair tak sampai tahap audit. */
  score: number | null
  score_max: number
  /** Skor sehat 0-6 (`checks_max`); null bila tak diaudit. */
  checks: number | null
  checks_max: number
  /** Outcome sejak launch (`v10_outcome_v3`); null = jendela belum tutup / tak berlabel. */
  outcome: WalletOutcome | null
}

export interface WalletLaunch extends WalletTokenBase {
  launched_at: string | null
}

export interface WalletHeld extends WalletTokenBase {
  /** Peringkat holder (1-20) pada potret pertama pair itu. */
  rank: number
  supply_pct: number | null
  /** Umur pair saat potret diambil. */
  pair_age_secs: number | null
  seen_at: string | null
}

export interface WalletResponse {
  addr: string
  computed_at: string
  launched_total: number
  launched: WalletLaunch[]
  held_total: number
  held_at_audit: WalletHeld[]
  holders_since: string | null
  holders_top_n: number
  /** Potret portofolio terakhir. `age_days` = dari transaksi terlama di antara transaksi TERBARU-nya (batas bawah). */
  wallet: { age_days: number | null; tokens_seen: number | null; tokens_held: number | null; seen_at: string | null } | null
}

/* ── B11: BNB (synt-dash `/api/bnb/*`, BELUM ADA — kontrak AGEN-BUILD "Usulan backend" B11; diperbarui orkestrator
   27 Okt setelah kalibrasi v1 `bnb-sehat-v1`) ──
   Data dari engine synt-bnb (DB `synt_bnb`, Flap.sh + four.meme di BSC). Skor dihitung SEKALI di detik-120 setelah
   lahir; v1 = hitungan sinyal sehat 0..4, tapi `max` SELALU dari respons, JANGAN di-hardcode.
   ⛔ Skor mengukur RISIKO RUNTUH (rug), BUKAN peluang winner: skor rendah = risiko runtuh tinggi. Copy UI tak boleh
   menyiratkan skor tinggi = winner (kalibrasi v1: winner% praktis rata di semua skor).
   ⚠️ Seperti feed Solana: angka `null` = BELUM DIUKUR / TAK DIKETAHUI (tampil "—"), bukan nol.
   ⚠️ ±67% token ber-quote selain BNB/USDT/USD1 → nilai USD sering null; `price_quote` + `quote_symbol` selalu ada
   bila harga terukur.
   ⛔ Respons TIDAK membawa ambang/nama sinyal mentah; `signals[].text` sudah kalimat alasan publik. */

export type BnbLaunchpad = 'flap' | 'fourmeme'

/** Label outcome synt-bnb `bnb_outcome` (definisi disalin dari synt-v10 `outcome.rs`). `null` = jendela 90 mnt belum tertutup. */
export type BnbOutcome = 'rug' | 'dead' | 'survive' | 'winner' | null

/**
 * `pending` = umur < 120 dtk atau fitur belum dihitung · `quiet` = terlalu sedikit pembeli luar di menit-2 → tidak
 * dinilai · `scored` = ada `score`.
 */
export type BnbScoreStatus = 'pending' | 'quiet' | 'scored'

export interface BnbSignal {
  /** Kunci stabil utk React; bukan nama sinyal yang ditampilkan. */
  key: string
  /** 14b (bnb.rs `sinyal`): null = sinyal TAK TERUKUR ("could not be measured"), bukan gagal. */
  ok: boolean | null
  /** Kalimat alasan siap tampil (Inggris), tanpa ambang angka. */
  text: string
}

export interface BnbScore {
  /** 14b: `Option` di bnb.rs (`b.skor`) → bisa null walau status `scored`. */
  value: number | null
  /** Batas atas skala skor versi ini (v1: 4). */
  max: number
  /** Berapa sinyal yang TERUKUR (≤ max). < max → tampil "2/4 (3 measured)". */
  measured: number | null
  /** Versi skor, mis. 'bnb-sehat-v1'. */
  version: string
  signals: BnbSignal[]
  scored_at: string | null
  /** ⭐ Skor audit 0-100 (skala Solana), dipetakan synt-dash `bnb.rs` `skor_audit_bnb`; null = mentah tanpa baris kalibrasi. */
  audit?: { score: number; max: number; rug_pct: number; winner_pct: number | null; n: number } | null
}

/** Satu baris feed. Sumber: `GET /api/bnb/trenches?view=new|graduated&limit=` */
export interface BnbTrenchItem {
  /** Alamat kontrak token (0x…, 40 hex). */
  token: string
  symbol: string | null
  name: string | null
  /** K3 (metadata BNB: Flap IPFS / four.meme) sedang dibuat: boleh absen. Ada → Avatar menampilkannya. */
  image?: string | null
  /** K3 (backend sedang dibuat): URL proxy thumbnail. Boleh absen; UI mencoba ini dulu lalu `image` asli. */
  image_thumb?: string | null
  launchpad: BnbLaunchpad
  /** Quote kurva (BNB, USDT, USD1, atau token lain). */
  quote_symbol: string | null
  /** Pajak transfer token (Flap tax token), basis poin. 0 = tanpa pajak; null = tak terukur (four.meme). */
  tax_bps: number | null
  born_at: string | null
  age_secs: number
  graduated: boolean
  /** Harga dalam satuan quote (`quote_symbol`). */
  price_quote: number | null
  /**
   * 14b (bnb.rs:505, di luar kontrak awal): kapan harga di atas terekam — trade kurva terakhir atau poll pool DEX.
   * ⚠️ Bisa tertinggal jauh dari sekarang (tanpa trade / celah rekaman pool) → UI menulis "Price as of N ago"
   * (preseden P2 Solana), tanpa menebak sebabnya.
   */
  price_at: string | null
  /** null = kurs quote→USD tak diketahui (umum utk quote selain BNB/USDT/USD1). */
  price_usd: number | null
  /** kurs USD satu quote (quote BNB = harga BNB); dipakai panel trading BNB utk perkiraan sebelum kutipan */
  quote_usd?: number | null
  mcap_usd: number | null
  liquidity_usd: number | null
  buys: number | null
  sells: number | null
  buyers: number | null
  /** Fakta beku di detik-120 (saat skor dihitung). */
  holders_120: number | null
  top1_pct_120: number | null
  creator_pct_120: number | null
  score_status: BnbScoreStatus
  /** null kecuali `score_status === 'scored'`. */
  score: BnbScore | null
  outcome: BnbOutcome
}

export interface BnbTrenchesResponse {
  computed_at: string
  items: BnbTrenchItem[]
}

/**
 * Candle per menit dari `bnb_trade`, dalam satuan `candle_unit` (USD atau simbol quote).
 * `t` = epoch unix DETIK awal menit (kontrak B11 final, putaran 2) → chart memakai `t × 1000`.
 */
export interface BnbCandle {
  t: number
  o: number
  h: number
  l: number
  c: number
}

/** Sumber: `GET /api/bnb/token/:addr` → item feed + identitas & candle. */
export interface BnbTokenDetail extends BnbTrenchItem {
  creator: string | null
  tx_hash: string | null
  /** 'USD' atau simbol quote (mis. 'CAKE') — label sumbu chart mengikutinya. */
  candle_unit: string | null
  candles: BnbCandle[]
}

/** Satu baris tabel kalibrasi: token dgn skor `score` → berapa yang runtuh / menang. Persen 0-100 atas `n`. */
export interface BnbCalibrationRow {
  score: number
  n: number
  rug_pct: number | null
  winner_pct: number | null
}

/** Satu anak tangga skor audit (synt-dash `bnb.rs` `tangga`): skor mentah yang jatuh ke angka sama sudah digabung. */
export interface BnbCalibrationTier {
  score: number
  n: number
  rug_pct: number
  winner_pct: number | null
  /** Skor mentah engine (cek lolos) yang masuk tingkat ini, urut naik. */
  checks: number[]
}

export interface BnbCalibrationGroup {
  n: number
  rug_pct: number | null
  winner_pct: number | null
}

/** Uji holdout: kelompok skor rendah vs tinggi pada periode yang TAK dipakai menyusun skor. */
export interface BnbHoldoutSide {
  scores: number[]
  rug_pct: number | null
}

/** Sumber: `GET /api/bnb/calibration` */
export interface BnbCalibrationResponse {
  version: string
  provisional: boolean
  period: { from: string; to: string }
  /** Jumlah hari data kalibrasi (server). */
  days: number | null
  /** Kalimat siap tampil tentang populasi yang dinilai. */
  population_note: string | null
  base: BnbCalibrationGroup
  rows: BnbCalibrationRow[]
  /** ⭐ Tangga skor audit 0-100 dari server, skor menurun. Tanpa ini terminal tak menampilkan angka audit. */
  tiers?: BnbCalibrationTier[]
  /** Skala skor audit (100). */
  score_max?: number
  /** Plafon skor audit selama tabel sementara (v1: 97). */
  score_cap?: number | null
  /** Pair `quiet` (tidak dinilai). */
  quiet: BnbCalibrationGroup | null
  holdout: { period: { from: string; to: string }; low: BnbHoldoutSide; high: BnbHoldoutSide } | null
  launchpads: { flap?: { n: number }; fourmeme?: { n: number } }
  /** Catatan kehati-hatian; ditampilkan APA ADANYA. */
  caveats: string[]
}
