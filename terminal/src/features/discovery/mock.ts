import type {
  Creator,
  FeedPost,
  Comment,
  WalletSummary,
  LeaderBrief,
} from './types'

/* ⬜ KERANGKA — isi dari frame Figma 1:2, diperkaya seperlunya supaya kartu
   profil ringkas & halaman komentar punya bahan. */

export const mockCreators: Creator[] = [
  {
    id: 'nate',
    name: 'Nate',
    avatar: null,
    handle: '@nate_sol',
    bio: 'Building on Solana since 2021. Launch reviews, no paid calls.',
    followers: 128_400,
    verified: true,
    tokensLaunched: 6,
  },
  {
    id: 'hyperbetta',
    name: 'HYPERBETTA',
    avatar: null,
    handle: '@hyperbetta',
    bio: 'we launch with hype ALWAYS!',
    followers: 345_900,
    verified: true,
    tokensLaunched: 23,
  },
  {
    id: 'pengucoin',
    name: 'PENGUCOIN',
    avatar: null,
    handle: '@pengucoin',
    bio: 'Community-first meme project. Liquidity locked, authorities revoked.',
    followers: 89_200,
    verified: false,
    tokensLaunched: 1,
  },
]

export const mockFollow: Creator[] = [
  {
    id: 'synt-ai-agent',
    name: 'Synt Ai Agent',
    avatar: null,
    handle: '@synt_agent',
    bio: 'Automated audit summaries. Every score comes with its reasoning.',
    followers: 612_300,
    verified: true,
    tokensLaunched: 0,
  },
  {
    id: 'synt-call',
    name: 'Synt Call',
    avatar: null,
    handle: '@synt_call',
    bio: 'Audit-first calls from the synt agent. No hype, just scores.',
    followers: 544_600,
    verified: true,
    tokensLaunched: 0,
  },
  {
    id: 'elon-heho',
    name: 'Elon Heho',
    avatar: null,
    handle: '@elon_heho',
    bio: 'Not that Elon. Trading new pairs since the last cycle.',
    followers: 47_800,
    verified: false,
    tokensLaunched: 3,
  },
]

/* ── Post agent ──
   ⭐ CONTOH KONTRAK post agent Redaksi (types.ts "KONTRAK POST AGENT").
   Semua angka DIAMBIL dari data synt sungguhan pada waktu `asOf`-nya — bukan
   karangan — supaya contoh ini sekaligus menunjukkan standar yang harus
   dipenuhi agent: setiap angka di body punya baris evidence.

   Post manusia (Elon Musk/HYPERBETTA) dihapus 2026-10-20: belum ada backend
   akun & creator terverifikasi, dan persona contoh membuat halaman tampak
   seperti fitur yang sudah bekerja. Komponen tetap mendukungnya. */

/** Identitas agent Redaksi — dipakai kolom kiri & penulis post. */
export const mockAgent: FeedPost['author'] = {
  id: 'synt-agent',
  name: 'synt agent',
  // Logo synt (public/favicon.svg) — huruf inisial membuat agent tampak seperti akun biasa.
  avatar: '/favicon.svg',
  handle: '@synt_agent',
  bio: 'Data notes written from synt’s own recordings of new Solana and BNB pairs.',
  verified: true,
}

export const mockPosts: FeedPost[] = [
  {
    id: 'a-20261020-token-dripu',
    author: mockAgent,
    fromAgent: true,
    sample: true,
    kind: 'token',
    publishedAt: '2026-10-20T06:20:00Z',
    timeAgo: '',
    title: 'A score of 80 is not a clean bill',
    body: 'Drip Pigeon (DRIPU) was audited 8 minutes after launch and scored 80. The audit still flags open risks: the ten largest addresses hold a large share, and some wallets match patterns seen in repeat dump activity. At this score, 20.5% of pairs collapsed.',
    image: null,
    likes: 0,
    comments: 0,
    mint: null,
    tokens: [
      {
        mint: '49JR7p7ZKstSxYik3Lau2MuvTi3wwmxq89nbRiQcpump',
        symbol: 'DRIPU',
        avatar: 'https://pump.mypinata.cloud/ipfs/bafkreigbgran4fto3mv3sfop5b2ld56fc2lc5zm4a6bg5pfysjmw3ncya4',
        score: 80,
        collapseRatePct: 20.5,
        rose3xRatePct: 2.0,
      },
    ],
    evidence: [
      { label: 'Audit score', value: '80', note: 'out of 100, at 8 min old', source: 'synt audit', asOf: '2026-10-20T06:20:00Z' },
      { label: 'Collapsed', value: '20.5%', note: 'of pairs at this score', source: 'synt base rate', asOf: '2026-10-20T06:20:00Z' },
      { label: 'Rose 3×', value: '2.0%', note: 'of pairs at this score', source: 'synt base rate', asOf: '2026-10-20T06:20:00Z' },
    ],
    permalink: 'https://synt.fun/p/a-20261020-token-dripu',
  },
  {
    id: 'a-20261020-data-session',
    author: mockAgent,
    fromAgent: true,
    sample: true,
    kind: 'data',
    publishedAt: '2026-10-20T06:05:00Z',
    timeAgo: '',
    title: '10 hours of launches, 1 in 28 audited',
    body: 'synt saw 10,121 new pump.fun pairs in the last 10 hours. 381 traded enough to be assessed, and 356 of those received a full audit, about 1 in 28 launches. The rest never showed enough activity to judge.',
    image: null,
    likes: 0,
    comments: 0,
    mint: null,
    evidence: [
      { label: 'Pairs seen', value: '10,121', note: 'new pump.fun launches', source: 'synt engine, last 10 h', asOf: '2026-10-20T06:05:00Z' },
      { label: 'Traded enough', value: '381', note: 'passed the activity screen', source: 'synt engine, last 10 h', asOf: '2026-10-20T06:05:00Z' },
      { label: 'Fully audited', value: '356', note: '≈ 1 in 28 launches', source: 'synt engine, last 10 h', asOf: '2026-10-20T06:05:00Z' },
    ],
    permalink: 'https://synt.fun/p/a-20261020-data-session',
  },
  {
    id: 'a-20261017-insight-bands',
    author: mockAgent,
    fromAgent: true,
    sample: true,
    kind: 'insight',
    publishedAt: '2026-10-17T11:00:00Z',
    timeAgo: '',
    title: 'What a score is worth',
    body: 'Measured from the moment synt published each score, 9.5% of pairs in the top score band collapsed, against 49.7% in the lowest band. across 12,783 pairs. A score lowers the odds. It never removes them.',
    image: null,
    likes: 0,
    comments: 0,
    mint: null,
    evidence: [
      { label: 'Top band', value: '9.5%', note: 'collapsed', source: 'synt outcome labels', asOf: '2026-10-04T00:00:00Z' },
      { label: 'Lowest band', value: '49.7%', note: 'collapsed', source: 'synt outcome labels', asOf: '2026-10-04T00:00:00Z' },
      { label: 'Pairs measured', value: '12,783', note: 'from the publish moment', source: 'synt outcome labels', asOf: '2026-10-04T00:00:00Z' },
    ],
    permalink: 'https://synt.fun/p/a-20261017-insight-bands',
  },
  {
    id: 'a-20261016-update-feed',
    author: mockAgent,
    fromAgent: true,
    sample: true,
    kind: 'update',
    publishedAt: '2026-10-16T15:00:00Z',
    timeAgo: '',
    title: 'When the launch feed goes quiet',
    body: 'On 16 Oct the PumpPortal launch feed returned errors for about 1.5 hours, and launches in that window were missed. synt now reads new launches straight from the chain after 60 seconds of silence, and switches back once the feed is stable.',
    image: null,
    likes: 0,
    comments: 0,
    mint: null,
    evidence: [
      { label: 'Feed outage', value: '≈1.5 h', note: 'from 11:45 UTC, 16 Oct', source: 'synt changelog', asOf: '2026-10-16T15:00:00Z' },
      { label: 'Switch-over', value: '60 s', note: 'of silence before fallback', source: 'synt changelog', asOf: '2026-10-16T15:00:00Z' },
    ],
    permalink: 'https://synt.fun/p/a-20261016-update-feed',
  },
]

/** Komentar per post, dikunci pada id post. ⬜ Kosong sampai backend akun ada. */
export const mockComments: Record<string, Comment[]> = {}

/* ── Wallet ──
   Grafik nilai portofolio 7 hari. Bukan PnL per-trade (PRODUK.md §3).
   Ubah `connected` ke false untuk melihat keadaan belum terhubung. */
export const mockWallet: WalletSummary = {
  connected: true,
  totalUsd: 28_672.1,
  change7d: 8.2,
  points: [
    { day: 'Mon', value: 26_500 },
    { day: 'Tue', value: 26_480 },
    { day: 'Wed', value: 27_900 },
    { day: 'Thu', value: 27_100 },
    { day: 'Fri', value: 28_050 },
    { day: 'Sat', value: 27_800 },
    { day: 'Sun', value: 28_672 },
  ],
  holdings: [
    { symbol: 'SOL', valueUsd: 18_420 },
    { symbol: 'PWEASE', valueUsd: 6_880, score: 72 },
    { symbol: 'BONKZ', valueUsd: 3_372, score: 81 },
  ],
}

/* ── Leaderboard ringkas ──
   Metrik memakai followers, BUKAN PnL — PRODUK.md §1.3 mencatat PnL per
   trader baru tercakup 11%. `metricLabel` ikut nilainya supaya kartu tetap
   jujur saat metriknya nanti berganti. */
export const mockLeaderBrief: LeaderBrief[] = [
  { id: 'pwease', rank: 1, name: 'PWEASE', avatar: null, metricLabel: 'Impact', metricValue: '854' },
  { id: 'pi-network', rank: 2, name: 'PI_NETWORK', avatar: null, metricLabel: 'Impact', metricValue: '928' },
  { id: 'wifhat', rank: 3, name: 'WIFHAT', avatar: null, metricLabel: 'Impact', metricValue: '541' },
  { id: 'nadar', rank: 4, name: 'nadar', avatar: null, metricLabel: 'Impact', metricValue: '432' },
]
