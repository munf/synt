/* ⬜ KERANGKA — wallet tracker & portfolio.

   PRODUK.md §2 mencatat wallet tracer butuh "langganan per-wallet, indeks
   riwayat" yang belum ada. Yang dibangun di sini adalah bentuk akhirnya. */

export interface TrackedTrade {
  wallet: string
  walletLabel: string | null
  side: 'buy' | 'sell'
  symbol: string
  mint: string
  /** Skor audit token saat transaksi terjadi. */
  score: number
  amountUsd: number
  timeAgo: string
}

export interface Position {
  symbol: string
  mint: string
  amount: number
  valueUsd: number
  /** Harga rata-rata masuk. */
  avgEntry: number
  currentPrice: number
  /** Skor audit terkini. */
  score: number
  /** Skor saat dibeli — perbandingannya menunjukkan apakah audit memburuk. */
  scoreAtEntry: number
}

export const mockTrades: TrackedTrade[] = [
  { wallet: '7xKq…4mNp', walletLabel: 'Whale #1', side: 'buy', symbol: 'PWEASE', mint: 'JA7tBgPWEASEmint1111111111111111111111wEhWEA', score: 72, amountUsd: 42_800, timeAgo: '2m ago' },
  { wallet: '3bTr…9wQs', walletLabel: 'Early sniper', side: 'buy', symbol: 'BONKZ', mint: 'BonkzMint4444444444444444444444444444444444', score: 81, amountUsd: 5_400, timeAgo: '6m ago' },
  { wallet: '7xKq…4mNp', walletLabel: 'Whale #1', side: 'sell', symbol: 'CARDBOARD', mint: 'CardboardMint22222222222222222222222222222222', score: 54, amountUsd: 18_200, timeAgo: '14m ago' },
  { wallet: 'Ge2v…1kLm', walletLabel: null, side: 'buy', symbol: 'NORA', mint: 'NoraMint99999999999999999999999999999999999', score: 77, amountUsd: 2_100, timeAgo: '31m ago' },
]

export const mockPositions: Position[] = [
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', amount: 92.4, valueUsd: 18_420, avgEntry: 178.2, currentPrice: 199.3, score: 0, scoreAtEntry: 0 },
  { symbol: 'PWEASE', mint: 'JA7tBgPWEASEmint1111111111111111111111wEhWEA', amount: 1_150_000, valueUsd: 6_880, avgEntry: 0.0000041, currentPrice: 0.00000598, score: 72, scoreAtEntry: 61 },
  { symbol: 'BONKZ', mint: 'BonkzMint4444444444444444444444444444444444', amount: 480_000, valueUsd: 3_372, avgEntry: 0.0000082, currentPrice: 0.00000702, score: 81, scoreAtEntry: 79 },
]
