import { gambarToken } from '@/components/Avatar'
import type {
  ChartResponse,
  HoldersResponse,
  TokenDetail as ApiToken,
} from '@/api/types'
import type { CoinDetail, Candle, Holder, ScoreFactor, ScorePoint, Swap } from './detail'
import { alamatPendek, umur } from '@/lib/format'
import { buktiPumpMesin, judulLaunchpad, launchpadTampil, likuiditasUsd, pasarPascaLulusBelumDimuat, sejakLaunchTakTercatat } from './labels'

/* ─────────────────────────────────────────────────────────────────────────
   Jembatan API → `CoinDetail` (halaman /coin/:mint).

   ⛔ BENTUK HALAMAN TIDAK DISENTUH — pelajaran dari kartu: menulis komponen
   baru membuang tombol, ikon, dan tata letak yang sudah dirancang. Berkas ini
   hanya MENGISI struktur yang ada.

   ⚠️ Tiga field `CoinDetail` tak punya padanan di mesin dan diisi apa adanya
   (kosong/nol), bukan dikarang — komentar `detail.ts` sudah memperingatkan:
   *"panel kosong lebih jujur daripada angka karangan."*
   ───────────────────────────────────────────────────────────────────────── */

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
let KURS_ASLI = false
export function setSolUsd(v: number | null | undefined) {
  if (typeof v === 'number' && v > 1 && v < 10_000) { SOL_USD = v; KURS_ASLI = true }
}
/** Kurs SOL→USD dari API, atau null bila belum ada (JANGAN memakai cadangan utk chart — lebih baik tampil dlm SOL). */
export function kursSolUsd(): number | null {
  return KURS_ASLI ? SOL_USD : null
}

/* Base rate per skor kini dikirim server (synt-dash `skor_audit`).
   ⛔ Tabel tier lama di sini (58,2% rose tier-1) sudah TERBANTAH — jebakan #45. */

/**
 * Faktor skor — dari BADGE RISIKO, bukan `skor2_rincian`.
 *
 * ⛔ `skor2_rincian` menyebut nama sinyal internal: `pendana_bersama`,
 * `dev_hold`, `sniper_hold`, `entrapment`, `rat_trader`, `creator_tanpa_jejak`.
 * Itu metodologi yang sengaja ditahan dari jalur publik — mengirimkannya
 * menyerahkan enam bulan kalibrasi ke siapa pun yang membuka DevTools.
 *
 * ⭐ Yang dipakai: enam sinyal yang SAMA dengan tabel & kartu, dgn ambang dari
 * rata-rata terukur per outcome. Konsisten, dan tak membocorkan apa pun.
 */
function faktor(r: ApiToken['risk']): ScoreFactor[] {
  const out: ScoreFactor[] = []

  const tambah = (
    id: string,
    label: string,
    nilai: number | null,
    burukDi: number,
    kalimat: (v: number) => string,
  ) => {
    if (nilai === null) return
    const buruk = nilai >= burukDi
    out.push({
      id,
      label,
      // ⚠️ Bobot ini TAMPILAN, bukan kontribusi sebenarnya ke skor. Arahnya
      // mengikuti temuan terukur, jadi tak menyesatkan meski besarannya bukan
      // angka mesin.
      weight: buruk ? -10 : 5,
      detail: kalimat(nilai),
      passed: !buruk,
    })
  }

  tambah('top10', 'Top 10 concentration', r.top10_pct, 95, (v) =>
    `The ten largest wallets hold ${v.toFixed(1)}% of supply.`)
  tambah('dev', 'Creator holding', r.dev_pct === null ? null : Math.max(0, r.dev_pct), 20, (v) =>
    `The creator holds ${v.toFixed(1)}% of supply.`)
  // Rata terukur: rug 11,6 · winner 5,6.
  // ⛔ DISEMBUNYIKAN 2026-10-22: same_slot_tx SELALU 0 sejak pengukurnya dicabut 2026-09-02 → "0 purchases landed in the
  // same block" adalah artefak ketiadaan data (sama dgn "Slot 0" di Trenches). Hidupkan lagi bila engine mengisinya.
  // tambah('slot', 'Same-slot buys', r.same_slot_tx, 12, (v) => `${v} purchases landed in the same block, a sign of coordinated entry.`)
  // Rata terukur: rug 0,641 · winner 0,243. Arah TERBALIK dari namanya.
  tambah(
    'conc',
    'Buyer concentration',
    r.wallet_diversity === null ? null : r.wallet_diversity * 100,
    45,
    (v) => `Buying is ${v.toFixed(0)}% concentrated among repeat wallets.`,
  )
  // Rata terukur: rug 7,33 · winner 2,46. ⚠️ HITUNGAN, bukan skor blacklist.
  tambah('flag', 'Flagged wallets', r.blacklist_hits, 5, (v) =>
    `${v} participating wallets appeared in earlier collapses.`)
  tambah('gini', 'Ownership spread', r.gini === null ? null : r.gini * 100, 60, (v) =>
    `Ownership inequality measures ${(v / 100).toFixed(2)} on a 0–1 scale.`)

  return out
}

export function adaptCoinDetail(
  a: ApiToken,
  chart: ChartResponse | null,
  hs: HoldersResponse | null,
): CoinDetail {
  /* ── Chart: titik harga → candle ──────────────────────────────────────
     ⚠️ `v10_flow` menyimpan TITIK harga, bukan OHLC. Open/high/low diisi
     nilai close yang sama — jujur, karena kita memang tak mengukur rentang
     dalam satu sampel. Komponen chart menggambar area dari `close`, jadi
     tampilannya tak terpengaruh. */
  const candles: Candle[] = (chart?.flow ?? [])
    .filter((p) => p.price !== null && p.price > 0)
    .map((p) => ({
      t: Math.round(p.t / 60),
      open: p.price as number,
      high: p.price as number,
      low: p.price as number,
      close: p.price as number,
      volume: 0,
    }))

  const scoreHistory: ScorePoint[] = (chart?.skor ?? [])
    .filter((sk) => sk.score !== null)
    .map((sk) => ({
      t: Math.round(sk.t / 60),
      score: sk.score as number,
      label: sk.verdict,
    }))

  const holdersList: Holder[] = (hs?.holders ?? []).map((h) => ({
    rank: h.rank,
    address: alamatPendek(h.owner),
    owner: h.owner,
    pct: h.supply_pct ?? 0,
    // ⛔ Nilai USD per holder TAK dihitung: butuh harga × jumlah token, dan
    // `ui_amount` sering null. `null` dirender "—", bukan $0.
    valueUsd: null,
    tag: null,
  }))

  const swaps: Swap[] = (hs?.swaps ?? []).map((s) => ({
    // ⭐ Waktu = UMUR PAIR, bukan jam dinding. Yang relevan di sini "menit
    // keberapa dalam hidup token", bukan pukul berapa di zona waktu mana.
    time: umur(s.age_secs),
    side: s.side === 'sell' ? 'sell' : 'buy',
    /* ⭐ Kolom "Amount" diisi besaran SOL, bukan jumlah token.
       `v10_tx_keluar.token_delta` ada tapi satuannya mentah (belum dibagi
       desimal), dan angka token yang salah skala jauh lebih menyesatkan
       daripada satuan yang berbeda dari judul kolomnya.

       ⚠️ SOL juga yang benar-benar dibandingkan trader antar-baris — "0,2
       SOL" langsung berarti, sedangkan "1.036.716.250 token" tidak. */
    amount: s.sol ?? 0,
    valueUsd: (s.sol ?? 0) * SOL_USD,
    trader: alamatPendek(s.trader),
  }))

  /* ⭐ Kurva hanya diklaim bila mesin benar-benar melihatnya. Mint yang hampir tak dikenal mesin (USDC dibuka langsung)
     datang dgn `complete:false` + progres/MC 0 → 'unknown', bukan "Bonding curve".
     ⛔ 1c: DAN hanya utk token pump.fun. BONK datang `complete:false`, graduation_pct 9e-9, mcap 91K SOL → dulu
     terbaca "di kurva". Tanpa bukti pump.fun (launchpad / mint `…pump`) → 'unknown'. */
  /* ⭐ 1c putaran 2: nilai `launchpad` mesin yang terlihat: 'https://pump.fun', 'pump', 'pump_v2', 'otc', null.
     Bukti tambahan: mesin SUDAH mengaudit pair ini (`checks` ada) — mesin hanya mengaudit launch pump.fun.
     Bukti RugCheck (market kurva `pump_fun`) ditambahkan di CoinDetailView (asinkron). */
  const pumpBukti = buktiPumpMesin(a)
  const beku = pasarPascaLulusBelumDimuat(a)
  // Status kurva MENTAH mesin; halaman penuh hanya dirender bila ada bukti pump.fun (lihat CoinDetailView)
  const curveState: CoinDetail['curveState'] =
    a.complete === true ? 'graduated'
      : (a.graduation_pct ?? 0) > 0 || (a.mcap_sol ?? 0) > 0 ? 'curve' : 'unknown'

  return {
    mint: a.mint,
    symbol: a.symbol,
    name: a.name ?? a.symbol,
    avatar: gambarToken(a),
    /* ⛔ DULU default 'pump.fun' utk SEMUA mint (termasuk USDC). Kini: nilai mesin; bila kosong, 'pump.fun' hanya utk
       pair yang dilihat mesin DAN berbukti pump.fun (`pumpBukti`); selain itu null → "Not reported". */
    // 'pump' / 'pump_v2' (nilai mesin) = pump.fun
    // 1d: logika dipindah ke labels.ts (dipakai juga panel Trenches)
    launchpad: launchpadTampil(a),
    launchpadTitle: judulLaunchpad(a),
    // fakta: "Created 17m ago" (DESIGN §4.2: "ago" hanya di fakta)
    createdAgo: `${umur(a.age_secs)} ago`,
    address: a.mint,
    socials: {
      website: a.socials.website ?? undefined,
      twitter: a.socials.twitter ?? undefined,
      telegram: a.socials.telegram ?? undefined,
    },

    price: a.price_usd ?? 0,
    // ⭐ 1c: `change_pct` = harga kini / harga pertama `v10_flow` − 1 (synt-dash api.rs) → "since launch"
    // ⭐ P2: lulus, harga pasca-lulus belum dimuat synt → persen & MC = angka kelulusan beku → null ("—") + catatan di halaman
    changeSinceLaunch: beku ? null : a.change_pct ?? null,
    sinceLaunchNever: !beku && sejakLaunchTakTercatat(a, (a.window_secs ?? 0) > 0),
    marketNotLoaded: beku,
    // ⛔ 1c: synt-dash menghitung MC = harga × SUPPLY_PUMPFUN → hanya bermakna utk token pump.fun; token tanpa bukti
    // pump.fun tak sampai ke halaman penuh (CoinDetailView → TakDilacak)
    marketCap: !beku && (a.mcap_sol ?? 0) > 0 ? (a.mcap_sol as number) * SOL_USD : null,
    // ⚠️ Tak ada volume 24 jam — `v10_flow` berhenti di detik-600. ⛔ 1c: dulu |net| berlabel "Volume"; kini net
    // flow BERTANDA dan UI menyebut jendelanya ("Net flow, first 10 min").
    netFlowUsd: a.net_sol_window == null ? null : a.net_sol_window * SOL_USD,
    // butir 7: buys/sells `v10_flow` baris terakhir jendela ukur (synt-dash api.rs `token`), lihat detail.ts
    curveBuys: a.buys ?? null,
    curveSells: a.sells ?? null,
    // ⛔ 1c: < $1 = bukan data (pair tak dilacak), bukan "likuiditas $0" yang memicu peringatan
    liquidity: likuiditasUsd(a.liquidity_sol, SOL_USD),
    /* ⚠️ `gmgn_holder_count` sering `null` (cakupan ~68%). Bila kosong,
       dipakai jumlah baris `v10_holder` yang benar-benar terambil — itu
       BUKAN total holder, melainkan berapa alamat teratas yang diperiksa,
       jadi ia batas bawah yang jujur, bukan tebakan ke atas. */
    /* ⛔ Tak lagi jatuh ke `hs.holders.length`: daftar itu dari
       getTokenLargestAccounts yang MENTOK 20 — "19" terbaca sbg 19 pemegang
       padahal artinya 19 akun teratas yang diperiksa. 0 → UI menulis "—". */
    holders: a.holders ?? 0,
    top10Pct: a.risk.top10_pct ?? null,
    pumpBukti,

    graduationPct: a.graduation_pct ?? 0,
    complete: a.complete ?? false,
    curveState,
    ageSecs: a.age_secs,
    windowSecs: a.window_secs ?? 600,

    score: a.score ?? 0,
    /* ⛔ "Danger" TIDAK boleh jadi default.
       Terukur pada pair tanpa gate-2, seluruh field skor `null` — dan versi
       sebelumnya menampilkan **skor 0 berlabel "Danger"**. Itu vonis atas
       token yang belum pernah dinilai, dan justru kebalikan dari prinsip
       synt: belum diukur ≠ berbahaya. */
    //
    // ⛔ Versi lama membaca `a.tier`, padahal API mengirim `tier_lama` sejak
    // 2026-10-04 — SETIAP token tampil "Not scored yet" + "0% collapsed".
    scoreLabel:
      a.checks == null ? 'Not scored yet'
        : a.checks >= 5 ? 'Few flags' : a.checks >= 3 ? 'Some flags' : 'Many flags',
    // ⛔ Base rate WAJIB menempel pada skor (PRODUK.md §0) — tapi hanya bila
    // skornya ADA. Menampilkan "0% collapsed" pada token tak berskor
    // membacakan jaminan yang tak pernah dihitung.
    // Dari server — tabel yang SAMA dgn sumber skornya (synt-dash `skor_audit`).
    baseRateRug: a.collapse_rate_pct ?? 0,
    baseRateWinner: a.rose3x_rate_pct ?? 0,
    scoreKnown: a.score != null && a.collapse_rate_pct != null,
    scoredAtAgeSecs: a.scored_at_age_secs ?? null,

    scoreHistory,
    factors: faktor(a.risk),
    candles,
    holdersList,

    /* ⬜ BELUM ADA di synt-dash. Dikirim kosong — komponen menampilkan
       keadaan "belum terukur" dgn penanda, bukan tabel kosong tanpa
       penjelasan. Bentuknya sudah ditetapkan di `detail.ts` supaya stream
       data punya acuan. */
    tradersList: [],
    positions: [],
    swaps,

    agentSummary: a.explanation ?? 'No explanation written yet.',
    // ⛔ Tak ada angka keyakinan di sistem — 0 agar tak ditampilkan.
    agentConfidence: 0,
  }
}
