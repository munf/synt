import type { TrenchRow, RiskFactor } from './types'

/* ⬜ KERANGKA — data contoh untuk tabel Trenches.

   Skor 0–100 (bukan 0–1000): itu skala yang dipakai synt-v10 dan yang
   base rate-nya terukur di PRODUK.md §0. */

/** Faktor risiko dengan bobot — bobot negatif menurunkan skor. */
function factors(
  holders: number,
  dev: number,
  snipers: number,
  insiders: number,
  bundler: number,
): RiskFactor[] {
  return [
    { kind: 'holders', pct: holders, weight: holders >= 40 ? -9 : 4 },
    { kind: 'devHolding', pct: dev, weight: dev > 10 ? -11 : 6 },
    { kind: 'snipers', pct: snipers, weight: snipers >= 30 ? -7 : 3 },
    { kind: 'insiders', pct: insiders, weight: insiders >= 10 ? -8 : 5 },
    { kind: 'bundler', pct: bundler, weight: bundler >= 30 ? -8 : 4 },
  ]
}

const seed: TrenchRow[] = [
  {
    mint: 'StockimpalerMint1111111111111111111111111111',
    rank: 1,
    symbol: 'STOCKIMPALER',
    handle: '@Stock…',
    avatar: null,
    marketCap: 73_900,
    marketCapChange: 184.2,
    athMarketCap: 74_400,
    liquidity: 22_800,
    volume1m: 1_100,
    txs1m: { buys: 369, sells: 67 },
    holders: 213,
    totalFeesSol: 0.42,
    score: 68,
    scoreLabel: 'Clean',
    scoreHistory: [44, 52, 61, 68],
    baseRateRug: 21.4,
    graduationPct: 42,
    complete: false,
    ageMinutes: 12,
    authoritiesRevoked: true,
    factors: factors(41, 34, 35, 34, 28),
  },
  {
    mint: 'CardboardMint22222222222222222222222222222222',
    rank: 2,
    symbol: 'CARDBOARD',
    handle: '@Cardboard',
    avatar: null,
    marketCap: 174_100,
    marketCapChange: 112.5,
    athMarketCap: 222_700,
    liquidity: 77_800,
    volume1m: 9_100,
    txs1m: { buys: 52, sells: 29 },
    holders: 350,
    totalFeesSol: 18.4,
    score: 54,
    scoreLabel: 'Mixed',
    scoreHistory: [61, 58, 55, 54],
    baseRateRug: 25.2,
    graduationPct: 96,
    complete: false,
    ageMinutes: 240,
    authoritiesRevoked: true,
    factors: factors(16, 0, 21, 0, 12),
  },
  {
    mint: 'FuniOfficialMint333333333333333333333333333',
    rank: 3,
    symbol: 'Funi Official',
    handle: '@Funi…',
    avatar: null,
    marketCap: 56_400,
    marketCapChange: 67.4,
    athMarketCap: 56_300,
    liquidity: 19_100,
    volume1m: 953_500,
    txs1m: { buys: 251, sells: 37 },
    holders: 207,
    totalFeesSol: 0.17,
    score: 39,
    scoreLabel: 'Danger',
    scoreHistory: [52, 47, 43, 39],
    baseRateRug: 44.1,
    graduationPct: 100,
    complete: true,
    ageMinutes: 1440,
    priceRetention: 62,
    authoritiesRevoked: false,
    factors: factors(45, 37, 37, 37, 42),
  },
]

/** Baris tambahan supaya panjang tabel realistis untuk menguji scroll. */
const filler: TrenchRow[] = Array.from({ length: 12 }, (_, i) => {
  const n = i + 4
  const score = 72 - i * 3
  return {
    mint: `Token${n}Mint${'0'.repeat(30)}${n}`,
    rank: n,
    symbol: `Token${n}`,
    handle: `@Tkn${n}…`,
    avatar: null,
    marketCap: 82_000 - i * 4_500,
    marketCapChange: 29.2 + i * 2.3,
    athMarketCap: 104_000 - i * 4_000,
    liquidity: 28_000 - i * 500,
    volume1m: 860_000 + i * 15_000,
    txs1m: { buys: 208 + i * 2, sells: 112 + i * 3 },
    holders: 182 + i * 8,
    totalFeesSol: 0.2 + i * 0.35,
    score,
    scoreLabel: score >= 65 ? 'Clean' : score >= 45 ? 'Mixed' : 'Danger',
    scoreHistory: [score - 12, score - 7, score - 3, score],
    baseRateRug: 18.9 + i * 1.7,
    graduationPct: i < 3 ? 88 - i * 4 : 20 + i * 3,
    complete: i >= 9,
    ageMinutes: i < 5 ? 8 + i * 9 : 180 + i * 60,
    priceRetention: i >= 9 ? 90 - i * 4 : undefined,
    authoritiesRevoked: i % 3 !== 0,
    factors: factors(14 + i, i % 3 === 0 ? 18 : 0, 19 + i, i % 4 === 0 ? 14 : 0, 10 + i * 2),
  }
})

export const mockTrenches: TrenchRow[] = [...seed, ...filler]
