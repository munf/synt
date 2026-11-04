import type { CoinDetail, Candle, Holder, Swap } from './detail'

/* ⬜ KERANGKA — data contoh untuk halaman detail coin.

   Angka base rate (18.9% rug / 13.9% winner pada skor 72) diambil dari
   pengukuran nyata di PRODUK.md §0, bukan dikarang: itu populasi gate-2,
   2.235 coin berlabel, 3 hari. Nilai lain adalah contoh. */

/** Kurva harga sintetis — naik lalu terkoreksi, pola khas new pair. */
function makeCandles(): Candle[] {
  const out: Candle[] = []
  let price = 0.0000042
  for (let t = 0; t <= 60; t++) {
    // Naik tajam di 15 menit pertama, lalu mendatar dengan noise.
    const drift = t < 15 ? 0.055 : t < 30 ? 0.004 : -0.006
    const noise = Math.sin(t * 1.7) * 0.02 + Math.cos(t * 0.9) * 0.015
    const open = price
    price = Math.max(0.0000001, price * (1 + drift + noise))
    const high = Math.max(open, price) * (1 + Math.abs(noise) * 0.4)
    const low = Math.min(open, price) * (1 - Math.abs(noise) * 0.35)
    out.push({
      t,
      open,
      high,
      low,
      close: price,
      volume: 400 + Math.abs(Math.sin(t * 2.1)) * 2600 + (t < 12 ? 1800 : 0),
    })
  }
  return out
}

const holders: Holder[] = [
  { rank: 1, address: '7xKq…4mNp', pct: 8.4, valueUsd: 49_400, tag: 'dev' },
  { rank: 2, address: '3bTr…9wQs', pct: 5.1, valueUsd: 30_000, tag: 'bundler' },
  { rank: 3, address: 'Ge2v…1kLm', pct: 4.7, valueUsd: 27_600, tag: 'sniper' },
  { rank: 4, address: '9pHn…6zXc', pct: 3.9, valueUsd: 22_900, tag: null },
  { rank: 5, address: 'Km4d…8vBj', pct: 3.2, valueUsd: 18_800, tag: 'insider' },
  { rank: 6, address: '2Wqa…5tYu', pct: 2.8, valueUsd: 16_400, tag: null },
  { rank: 7, address: 'Rf7s…3nMk', pct: 2.4, valueUsd: 14_100, tag: null },
  { rank: 8, address: 'Lp9c…7hGd', pct: 2.1, valueUsd: 12_300, tag: 'bundler' },
  { rank: 9, address: 'Xz3m…2qWe', pct: 1.9, valueUsd: 11_100, tag: null },
  { rank: 10, address: 'Bn6k…4rTy', pct: 1.7, valueUsd: 10_000, tag: null },
]

const swaps: Swap[] = [
  { time: '19:17:52', side: 'buy', amount: 2_400_000, valueUsd: 1_420, trader: '7xKq…4mNp' },
  { time: '19:17:41', side: 'sell', amount: 890_000, valueUsd: 527, trader: '3bTr…9wQs' },
  { time: '19:17:33', side: 'buy', amount: 5_100_000, valueUsd: 3_018, trader: 'Ge2v…1kLm' },
  { time: '19:17:20', side: 'buy', amount: 1_200_000, valueUsd: 710, trader: '9pHn…6zXc' },
  { time: '19:17:04', side: 'sell', amount: 3_300_000, valueUsd: 1_953, trader: 'Km4d…8vBj' },
  { time: '19:16:58', side: 'buy', amount: 740_000, valueUsd: 438, trader: '2Wqa…5tYu' },
  { time: '19:16:47', side: 'buy', amount: 6_800_000, valueUsd: 4_024, trader: 'Rf7s…3nMk' },
  { time: '19:16:31', side: 'sell', amount: 1_100_000, valueUsd: 651, trader: 'Lp9c…7hGd' },
]

export const mockCoinDetail: CoinDetail = {
  mint: 'JA7tBgPWEASEmint1111111111111111111111wEhWEA',
  symbol: 'PWEASE',
  name: 'Pwease Agent',
  avatar: null,
  launchpad: 'pump.fun',
  createdAgo: '58m ago',
  address: 'JA7tBgPWEASEmint1111111111111111111111wEhWEA',
  socials: { website: 'https://example.com', twitter: 'https://x.com/example' },

  price: 0.00000598,
  changeSinceLaunch: 1012.79,
  marketCap: 588_300,
  netFlowUsd: 331_600,
  curveBuys: 412,
  curveSells: 188,
  liquidity: 77_400,
  holders: 136,
  top10Pct: 32.93,
  pumpBukti: true,

  graduationPct: 42,
  complete: false,
  marketNotLoaded: false,
  curveState: 'curve',
  ageSecs: 58 * 60,
  windowSecs: 600,

  score: 72,
  scoreLabel: 'Clean',
  // Angka nyata dari PRODUK.md §0, populasi gate-2.
  baseRateRug: 18.9,
  baseRateWinner: 13.9,

  scoreHistory: [
    { t: 3, score: 51, label: 'Mixed' },
    { t: 5, score: 58, label: 'Mixed' },
    { t: 10, score: 66, label: 'Clean' },
    { t: 30, score: 72, label: 'Clean' },
  ],

  factors: [
    {
      id: 'authority',
      label: 'Mint & freeze authority',
      weight: 14,
      detail: 'Both authorities revoked, so supply cannot be inflated or frozen.',
      passed: true,
    },
    {
      id: 'liquidity',
      label: 'Liquidity depth',
      weight: 11,
      detail: '$77.4K locked against a $588K cap, deep enough to exit at size.',
      passed: true,
    },
    {
      id: 'sellratio',
      label: 'Sell / buy ratio',
      weight: 9,
      detail: 'Ratio held at 0.28 through the window; sell pressure stayed low.',
      passed: true,
    },
    {
      id: 'concentration',
      label: 'Top 10 concentration',
      weight: -12,
      detail: 'Top 10 wallets hold 32.9%. Coordinated exit would move price hard.',
      passed: false,
    },
    {
      id: 'bundler',
      label: 'Bundler activity',
      weight: -8,
      detail: '42.5% of first-block buys came from bundled wallets.',
      passed: false,
    },
    {
      id: 'history',
      label: 'Creator history',
      weight: 6,
      detail: 'No prior rug recorded for this creator across 6 launches.',
      passed: true,
    },
  ],

  candles: makeCandles(),
  holdersList: holders,
  tradersList: [],
  positions: [],
  swaps,

  agentSummary:
    'Price retention held at 100% of peak through the 10-minute window with net inflow of +35.9 SOL. Concentration and bundler activity are the two open risks. Both are visible above, and neither is disqualifying on its own.',
  agentConfidence: 65,
}
