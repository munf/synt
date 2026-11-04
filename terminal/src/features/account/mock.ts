import type { Notification, Message, Profile, ProfileStats } from './types'

/* ⬜ KERANGKA — PRODUK.md §2: backend akun belum ada. */

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    kind: 'audit',
    title: 'Audit updated',
    text: 'PWEASE risk score moved from 62 to 85 after the 10-minute window closed.',
    timeAgo: '2m ago',
    read: false,
    href: '/coin/JA7tBgPWEASEmint1111111111111111111111wEhWEA',
  },
  {
    id: 'n2',
    kind: 'price',
    title: 'CARDBOARD +112%',
    text: 'A token on your watchlist crossed $174.1K market cap.',
    timeAgo: '18m ago',
    read: false,
    href: '/trenches',
  },
  {
    id: 'n3',
    kind: 'social',
    title: 'New follower',
    text: 'Synt Call started following you.',
    timeAgo: '1h ago',
    read: true,
    href: '/profile/synt-call',
  },
  {
    id: 'n4',
    kind: 'system',
    title: 'Calibration cohort closed',
    text: 'Scores are being re-verified against a new blind cohort.',
    timeAgo: '5h ago',
    read: true,
    href: null,
  },
]

export const mockMessages: Message[] = [
  {
    id: 'm1',
    from: 'Synt AI Agent',
    avatar: null,
    preview: 'Three new pairs cleared gate-2 in the last hour.',
    timeAgo: '5m ago',
    unread: true,
  },
  {
    id: 'm2',
    from: 'HYPERBETTA',
    avatar: null,
    preview: 'gm — launch is at 14:00 UTC, audit should be live before that.',
    timeAgo: '2h ago',
    unread: true,
  },
  {
    id: 'm3',
    from: 'nadar',
    avatar: null,
    preview: 'Thanks for the heads up on that bundler pattern.',
    timeAgo: '1d ago',
    unread: false,
  },
]

/** Profil pengguna sendiri. */
export const mockMe: Profile & { stats: Required<ProfileStats> } = {
  handle: '@yeremias',
  displayName: 'Yeremias NJ',
  avatar: null,
  bio: 'Trading new pairs on Solana. Reading audits before buying.',
  joined: 'Joined Aug 2026',
  walletShort: null,
  verified: false,
  stats: { followers: 128, following: 64, posts: 12, audits: 47 },
}

/** Profil orang lain — dipakai route /profile/:handle. */
export const mockProfiles: Record<string, Profile> = {
  'synt-call': {
    handle: '@synt-call',
    displayName: 'Synt Call',
    avatar: null,
    bio: 'Automated calls from the synt agent. Audit-first, no hype.',
    joined: 'Joined Jun 2026',
    walletShort: '4FGbY…jem',
    verified: true,
    stats: { followers: 544_600, following: 12, posts: 892, audits: 1_204 },
  },
  hyperbetta: {
    handle: '@hyperbetta',
    displayName: 'HYPERBETTA',
    avatar: null,
    bio: 'we launch with hype ALWAYS!',
    joined: 'Joined Jul 2026',
    walletShort: '8821…bnz',
    verified: true,
    stats: { followers: 345_900, following: 203, posts: 156, audits: 8 },
  },
}
