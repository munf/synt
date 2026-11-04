import type { PodiumEntry, LeaderboardRow } from './types'

/* ⬜ KERANGKA — nilai dari frame Figma 3:16.

   ⚠️ winRate & totalProfit adalah ANGKA CONTOH untuk mengisi kerangka.
   PRODUK.md §1.3: PnL per trader belum bisa dihitung — dari 37.260 pasangan
   wallet-coin hanya 4.186 (11%) punya beli DAN jual terekam, karena
   `v10_tx_awal` hanya merekam 25 transaksi pertama.

   ⛔ SEBELUM halaman ini dibuka ke publik: pasang penanda bahwa angka
   trader belum terhitung, atau lepas kolomnya. Menampilkan "+$1.2M" ke
   pengguna nyata adalah janji yang datanya tak bisa dukung (BRAND.md §3).
   Sekarang aman karena preview ini privat. */

export const mockPodium: PodiumEntry[] = [
  {
    id: 'pwease',
    rank: 1,
    name: 'PWEASE',
    handle: '@J69Qw_Apg',
    avatar: null,
    timeAgo: '2h ago',
    followers: 552_600,
    impactScore: 854,
    growth24h: 184.2,
    spark: [0.1, 0.18, 0.22, 0.2, 0.34, 0.42, 0.55, 0.7],
  },
  {
    id: 'pi-network',
    rank: 2,
    name: 'PI_NETWORK',
    handle: '@4FGbY_jem',
    avatar: null,
    timeAgo: '1h ago',
    followers: 544_600,
    impactScore: 928,
    growth24h: 112.5,
    spark: [0.08, 0.14, 0.3, 0.36, 0.4, 0.52, 0.62, 0.78],
  },
  {
    id: 'wifhat',
    rank: 3,
    name: 'WIFHAT',
    handle: '@24KWX_ump',
    avatar: null,
    timeAgo: '8d ago',
    followers: 345_900,
    impactScore: 541,
    growth24h: 67.4,
    spark: [0.12, 0.16, 0.2, 0.26, 0.3, 0.44, 0.5, 0.66],
  },
]

export const mockLeaderboard: LeaderboardRow[] = [
  { id: 'nadar', rank: 4, name: 'nadar', avatar: null, followers: 210_400, winRate: 68.2, totalProfit: 1_200_000 },
  { id: 'jonosoh', rank: 5, name: 'jonosoh', avatar: null, followers: 198_100, winRate: 71.0, totalProfit: 980_000 },
  { id: 'sumbi', rank: 6, name: 'sumbi', avatar: null, followers: 185_000, winRate: 65.4, totalProfit: 890_000 },
  { id: 'kaireno', rank: 7, name: 'kaireno', avatar: null, followers: 172_300, winRate: 63.1, totalProfit: 760_000 },
  { id: 'demasu', rank: 8, name: 'demasu', avatar: null, followers: 160_800, winRate: 61.7, totalProfit: 645_000 },
  { id: 'volpi', rank: 9, name: 'volpi', avatar: null, followers: 149_200, winRate: 59.8, totalProfit: 520_000 },
  { id: 'trenchy', rank: 10, name: 'trenchy', avatar: null, followers: 138_500, winRate: 57.2, totalProfit: 410_000 },
]
