import type {
  BnbCalibrationResponse,
  BnbCandle,
  BnbLaunchpad,
  BnbOutcome,
  BnbScore,
  BnbScoreStatus,
  BnbTokenDetail,
  BnbTrenchItem,
  BnbTrenchesResponse,
} from '@/api/types'

/* ⬜ DATA CONTOH BNB (butir 14, 27 Okt) — HANYA mode template (`VITE_TEMPLATE=mock`) dan HANYA bila `/api/bnb/*`
   (B11) menjawab 404/galat. Build biasa TIDAK PERNAH memakainya (lihat `useBnb.ts`).
   ⛔ Putaran 2 (Reviewer): TANPA efek samping saat modul dimuat — semua dibangkitkan lazy di dalam fungsi, dan
   pemanggil menulis `TEMPLATE ? contoh…() : null`, jadi build biasa membuang seluruh berkas (grep BNBCAT di dist = 0).

   ⚠️ Semua angka & kalimat alasan di sini KARANGAN yang meniru bentuk kontrak B11 (v1 `bnb-sehat-v1`, skor 0..4);
   tiap layar yang memakainya memasang label SAMPLE. UI membaca `max` dari data, bukan dari berkas ini.
   Quote campuran (BNB/USDT/USD1 berkurs contoh, CAKE/ASTER tanpa kurs → USD null) meniru data nyata (±67% non-USD).
   ⛔ Alamat contoh sengaja berpola nol (`0x0000…b0NN…`), bukan kontrak nyata: tak ada tautan BscScan utk alamat ini.
   Hapus berkas ini begitu synt-dash melayani B11. */

const SKALA = 4
const VERSI = 'bnb-sehat-v1'
/** Kurs contoh quote → USD. Quote lain (±67% token di data nyata) = kurs tak diketahui → nilai USD null. */
const KURS_CONTOH: Record<string, number> = { BNB: 600, USDT: 1, USD1: 1 }

/** Alamat contoh: 0x + 32 nol + "b" + nomor 3 digit + akhiran gaya launchpad (four.meme …4444, Flap …7777). */
function alamat(i: number, lp: BnbLaunchpad): string {
  return `0x${'0'.repeat(32)}b${String(i).padStart(3, '0')}${lp === 'fourmeme' ? '4444' : '7777'}`
}

export function alamatContoh(addr: string): boolean {
  return /^0x0{32}b\d{3}(4444|7777)$/.test(addr)
}

/** Kalimat alasan contoh = DISALIN dari synt-dash `bnb.rs` `sinyal` (butir 14b): [kunci, ok, tidak ok, tak terukur].
    Urutan & kunci sama dgn server (S1..S4); tanpa angka ambang. */
const ALASAN: Array<[string, string, string, string]> = [
  [
    'price_not_pumped',
    'Price had not run far above its first trade by minute two.',
    'Price had already run far above its first trade by minute two.',
    'Price move by minute two could not be measured.',
  ],
  [
    'holders_not_thin',
    'The largest outside holder held a meaningful share, so holdings were not spread thin.',
    'Holdings were spread thin across many small wallets.',
    'No outside holder yet, so holder spread could not be measured.',
  ],
  [
    'not_a_clone',
    'Name does not copy a token launched by another creator in the past day.',
    'Name copies a token launched by another creator in the past day.',
    'Name copy check could not be measured.',
  ],
  [
    'creator_not_serial',
    'Creator did not launch other tokens in the past day.',
    'Creator launched other tokens in the past day.',
    'Creator history could not be measured.',
  ],
]

/** PRNG deterministik (mulberry32): contoh yang sama tiap muat, tanpa Math.random. */
function acak(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `nilai` sinyal sehat dari `terukur` sinyal yang terukur. Seperti bnb.rs, keempat sinyal SELALU dikirim; yang tak
    terukur `ok: null` + kalimat "could not be measured". */
function skor(nilai: number, terukur: number, seed: number, scoredAt: string): BnbScore {
  const r = acak(seed)
  // sinyal mana yang sehat / tak sehat / tak terukur diacak per token, urutan tampil tetap S1..S4
  const peran = ALASAN.map((_, i) => ({ i, k: r() })).sort((x, y) => x.k - y.k).map((x) => x.i)
  const nasib = new Map<number, boolean | null>()
  peran.forEach((idx, j) => nasib.set(idx, j < nilai ? true : j < terukur ? false : null))
  return {
    value: nilai,
    max: SKALA,
    measured: terukur,
    version: VERSI,
    scored_at: scoredAt,
    signals: ALASAN.map(([key, ya, tidak, belum], idx) => {
      const ok = nasib.get(idx) ?? null
      return { key, ok, text: ok === true ? ya : ok === false ? tidak : belum }
    }),
  }
}

interface Benih {
  sym: string
  name: string
  lp: BnbLaunchpad
  age: number
  /** MC dalam satuan quote (supply contoh 1 miliar). null = harga belum terukur. */
  mcQ: number | null
  liqQ: number | null
  quote: string
  buyers: number | null
  status: BnbScoreStatus
  score?: number
  measured?: number
  outcome: BnbOutcome
  graduated?: boolean
  tax?: number
}

/* Umur dalam detik. `pending` = < 120 dtk; `quiet` = terlalu sedikit pembeli luar → tidak dinilai. */
const BENIH: Benih[] = [
  { sym: 'BNBCAT', name: 'Binance Cat', lp: 'flap', age: 48, mcQ: 9.8, liqQ: 5.1, quote: 'BNB', buyers: 11, status: 'pending', outcome: null },
  { sym: 'MOONPAW', name: 'Moon Paw', lp: 'fourmeme', age: 95, mcQ: 7_400, liqQ: 4_200, quote: 'USDT', buyers: 23, status: 'pending', outcome: null },
  { sym: 'CZDOG', name: 'CZ Dog', lp: 'flap', age: 212, mcQ: 21.3, liqQ: 11.5, quote: 'BNB', buyers: 64, status: 'scored', score: 4, measured: 4, outcome: null, tax: 100 },
  { sym: 'GIGA', name: 'Giga Bnb', lp: 'flap', age: 344, mcQ: 2_150_000, liqQ: 1_040_000, quote: 'CAKE', buyers: 19, status: 'scored', score: 1, measured: 4, outcome: null },
  { sym: 'SAFU', name: 'Safu Frog', lp: 'fourmeme', age: 610, mcQ: 9_300, liqQ: 5_100, quote: 'USD1', buyers: 41, status: 'scored', score: 2, measured: 3, outcome: null },
  { sym: 'HODL', name: 'Hodl Club', lp: 'flap', age: 1_180, mcQ: 3.1, liqQ: 1.6, quote: 'BNB', buyers: 6, status: 'quiet', outcome: null },
  { sym: 'BROCCO', name: 'Brocco', lp: 'flap', age: 1_960, mcQ: 880_000, liqQ: 402_000, quote: 'ASTER', buyers: 132, status: 'scored', score: 3, measured: 4, outcome: null },
  { sym: 'PNUTBSC', name: 'Peanut BSC', lp: 'flap', age: 2_750, mcQ: 5.4, liqQ: 2.3, quote: 'BNB', buyers: 27, status: 'scored', score: 0, measured: 4, outcome: null, tax: 300 },
  { sym: 'SLEEPY', name: 'Sleepy Bear', lp: 'flap', age: 3_400, mcQ: 1_310_000, liqQ: 600_000, quote: 'CAKE', buyers: 4, status: 'quiet', outcome: null },
  { sym: 'YIELD', name: 'Yield Cat', lp: 'fourmeme', age: 4_100, mcQ: 10.2, liqQ: 4.8, quote: 'BNB', buyers: 58, status: 'scored', score: 3, measured: 3, outcome: null },
  { sym: 'PEPEBNB', name: 'Pepe on BNB', lp: 'flap', age: 5_820, mcQ: 3.8, liqQ: 1.0, quote: 'BNB', buyers: 37, status: 'scored', score: 1, measured: 4, outcome: 'rug' },
  { sym: 'LUCKY', name: 'Lucky Bull', lp: 'flap', age: 6_400, mcQ: 4_800, liqQ: 2_200, quote: 'USDT', buyers: 49, status: 'scored', score: 2, measured: 4, outcome: 'dead' },
  { sym: 'TIGER', name: 'Tiger Coin', lp: 'fourmeme', age: 7_900, mcQ: 51.6, liqQ: 20.7, quote: 'BNB', buyers: 211, status: 'scored', score: 4, measured: 4, outcome: 'survive' },
]

const BENIH_LULUS: Benih[] = [
  { sym: 'BAOBAO', name: 'Bao Bao', lp: 'flap', age: 3_300, mcQ: 280, liqQ: 69, quote: 'BNB', buyers: 1_284, status: 'scored', score: 4, measured: 4, outcome: null, graduated: true },
  { sym: 'MEOWB', name: 'Meow BNB', lp: 'fourmeme', age: 9_600, mcQ: 412_000, liqQ: 88_200, quote: 'USDT', buyers: 2_930, status: 'scored', score: 3, measured: 4, outcome: 'winner', graduated: true },
  { sym: 'RICH', name: 'Rich Dragon', lp: 'flap', age: 14_200, mcQ: 24_400_000, liqQ: 7_700_000, quote: 'ASTER', buyers: 803, status: 'scored', score: 2, measured: 4, outcome: 'survive', graduated: true, tax: 200 },
  { sym: 'FOMO', name: 'Fomo Panda', lp: 'flap', age: 26_800, mcQ: 16.2, liqQ: 7.3, quote: 'BNB', buyers: 655, status: 'scored', score: 1, measured: 4, outcome: 'rug', graduated: true },
]

/** Candle 1m contoh dari umur 0 sampai min(umur, 90 mnt) dalam satuan `kali` (1 = quote, kurs = USD).
    `t` = epoch unix DETIK awal menit (kontrak B11 final). */
function candleContoh(b: Benih, seed: number, kali: number, bornMs: number): BnbCandle[] {
  const menit0 = Math.floor(bornMs / 60_000) * 60
  const r = acak(seed * 7919)
  // kurva + (lulus) harga pool yang direkam (bnb.rs `bnb_pasca`); contoh dibatasi 100 menit supaya ringkas
  const menit = Math.min(Math.floor(b.age / 60), 100)
  if (menit < 1 || b.mcQ === null) return []
  const akhir = (b.mcQ / 1e9) * kali
  const awal = akhir * 0.45
  const out: BnbCandle[] = []
  let harga = awal
  for (let t = 0; t <= menit; t++) {
    // jalan acak menuju harga akhir + puncak di tengah utk pair yang runtuh
    const sasaran = awal + (akhir - awal) * (t / Math.max(1, menit))
    const puncak = b.outcome === 'rug' && t > menit * 0.3 && t < menit * 0.6 ? 2.4 : 1
    const o = harga
    const c = Math.max(akhir * 0.2, (sasaran * puncak) * (0.9 + r() * 0.2))
    const h = Math.max(o, c) * (1 + r() * 0.06)
    const l = Math.min(o, c) * (1 - r() * 0.06)
    out.push({ t: menit0 + t * 60, o, h, l, c })
    harga = c
  }
  return out
}

function hargaBasiDtk(b: Benih, r: () => number): number {
  // contoh: token lulus yang tua, harga pool terakhir terekam beberapa jam lalu (bentuk "Price as of N ago")
  if (b.graduated && b.age > 100 * 60) return b.age - 100 * 60
  if (b.status === 'quiet') return Math.min(b.age, 900)
  return Math.round(3 + r() * 40)
}

function buatItem(b: Benih, i: number, now: number): BnbTokenDetail {
  const born = new Date(now - b.age * 1000).toISOString()
  const scoredAt = new Date(now - (b.age - 120) * 1000).toISOString()
  const r = acak(i * 104729)
  const kurs = KURS_CONTOH[b.quote] ?? null
  const usdDari = (q: number | null) => (q === null || kurs === null ? null : q * kurs)
  const buys = b.buyers === null ? null : Math.round(b.buyers * (1.4 + r()))
  const priceQ = b.mcQ === null ? null : b.mcQ / 1e9
  return {
    token: alamat(i, b.lp),
    symbol: b.sym,
    name: b.name,
    launchpad: b.lp,
    quote_symbol: b.quote,
    tax_bps: b.tax ?? 0,
    born_at: born,
    age_secs: b.age,
    graduated: b.graduated ?? false,
    price_quote: priceQ,
    // trade/pool terakhir yang terekam; sebagian contoh sengaja lama supaya "Price as of N ago" terlihat
    price_at: priceQ === null ? null : new Date(now - hargaBasiDtk(b, r) * 1000).toISOString(),
    price_usd: usdDari(priceQ),
    mcap_usd: usdDari(b.mcQ),
    liquidity_usd: usdDari(b.liqQ),
    buys,
    sells: buys === null ? null : Math.round(buys * (0.35 + r() * 0.5)),
    buyers: b.buyers,
    holders_120: b.age < 120 ? null : Math.round((b.buyers ?? 10) * (0.5 + r() * 0.3)),
    top1_pct_120: b.age < 120 ? null : Math.round((3 + r() * 14) * 10) / 10,
    creator_pct_120: b.age < 120 ? null : Math.round(r() * 60) / 10,
    score_status: b.status,
    score: b.status === 'scored' && b.score !== undefined ? skor(b.score, b.measured ?? SKALA, i, scoredAt) : null,
    outcome: b.outcome,
    creator: `0x${'0'.repeat(30)}c${String(i).padStart(3, '0')}000000`,
    tx_hash: null,
    candle_unit: kurs === null ? b.quote : 'USD',
    candles: candleContoh(b, i, kurs ?? 1, now - b.age * 1000),
  }
}

/** Dibangkitkan SEKALI saat pertama dipakai (bukan saat modul dimuat); umur & waktu lahir konsisten selama sesi. */
let dunia: { now: number; baru: BnbTokenDetail[]; lulus: BnbTokenDetail[] } | null = null
function contohDunia() {
  if (!dunia) {
    const now = Date.now()
    dunia = {
      now,
      baru: BENIH.map((b, i) => buatItem(b, i + 1, now)),
      lulus: BENIH_LULUS.map((b, i) => buatItem(b, i + 101, now)),
    }
  }
  return dunia
}

function ringkas(d: BnbTokenDetail): BnbTrenchItem {
  const { creator: _c, tx_hash: _t, candles: _k, ...item } = d
  return item
}

export function contohTrenches(view: 'new' | 'graduated'): BnbTrenchesResponse {
  const d = contohDunia()
  return {
    computed_at: new Date(d.now).toISOString(),
    items: (view === 'new' ? d.baru : d.lulus).map(ringkas),
  }
}

export function contohToken(addr: string): BnbTokenDetail | null {
  const d = contohDunia()
  return [...d.baru, ...d.lulus].find((x) => x.token.toLowerCase() === addr.toLowerCase()) ?? null
}

/** Kalibrasi contoh = isi `/root/synt-bnb/kalibrasi/bnb-sehat-v1.json` (v1, 27 Okt) APA ADANYA, disalin putaran 2;
    di UI tetap berlabel SAMPLE karena belum datang dari endpoint. */
export function contohKalibrasi(): BnbCalibrationResponse {
  return {
    "version": "bnb-sehat-v1",
    "provisional": true,
    "period": {
      "from": "2026-10-15T00:00:00Z",
      "to": "2026-10-27T07:00:00Z"
    },
    "days": 12,
    "population_note": "Scored tokens: bought by at least 10 distinct wallets other than the creator within the first 2 minutes on four.meme and Flap.sh. Tokens with 1 to 9 such buyers are shown as quiet and are not scored.",
    "base": {
      "n": 5679,
      "rug_pct": 4.8,
      "winner_pct": 2.0
    },
    "rows": [
      {
        "score": 0,
        "n": 155,
        "rug_pct": 32.9,
        "winner_pct": 2.6
      },
      {
        "score": 1,
        "n": 418,
        "rug_pct": 24.6,
        "winner_pct": 2.4
      },
      {
        "score": 2,
        "n": 1638,
        "rug_pct": 4.6,
        "winner_pct": 2.3
      },
      {
        "score": 3,
        "n": 2184,
        "rug_pct": 1.2,
        "winner_pct": 1.4
      },
      {
        "score": 4,
        "n": 1284,
        "rug_pct": 1.2,
        "winner_pct": 2.5
      }
    ],
    "score_max": 100,
    "score_cap": 97,
    "tiers": [
      { "score": 97, "n": 3468, "rug_pct": 1.2, "winner_pct": 1.8, "checks": [3, 4] },
      { "score": 95, "n": 1638, "rug_pct": 4.6, "winner_pct": 2.3, "checks": [2] },
      { "score": 75, "n": 418, "rug_pct": 24.6, "winner_pct": 2.4, "checks": [1] },
      { "score": 67, "n": 155, "rug_pct": 32.9, "winner_pct": 2.6, "checks": [0] }
    ],
    "quiet": {
      "n": 18068,
      "rug_pct": 0.2,
      "winner_pct": 0.4
    },
    "holdout": {
      "period": {
        "from": "2026-10-23T00:00:00Z",
        "to": "2026-10-27T07:00:00Z"
      },
      "low": {
        "scores": [
          0,
          1
        ],
        "rug_pct": 28.2
      },
      "high": {
        "scores": [
          3,
          4
        ],
        "rug_pct": 1.2
      }
    },
    "launchpads": {
      "flap": {
        "n": 5408
      },
      "fourmeme": {
        "n": 271
      }
    },
    "caveats": [
      "Provisional: 12 days of data. Thresholds were set on tokens born 2026-10-15 to 2026-10-22 and checked once on tokens born from 2026-10-23, which were not used for tuning.",
      "The score measures rug risk only. It does not predict winners: the winner rate is 1.4 to 2.6% at every score.",
      "Outcome labels (rug, dead, survive, winner) reuse synt's Solana definitions over a 90 minute window and are not yet calibrated for BNB Chain.",
      "Rug is measured from the price at second 120 using bonding curve prices before token tax.",
      "four.meme is 5% of scored tokens and had 0 winners in the holdout period, so it cannot be judged separately yet.",
      "Not investment advice."
    ]
  }
}
