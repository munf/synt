/* Bentuk data akun & sosial.

   ⚠️ PRODUK.md §2: backend akun BELUM ADA sama sekali. Semua tipe di sini
   adalah rancangan bentuk akhir, bukan cerminan API yang sudah ada. */

export interface Notification {
  id: string
  /** Menentukan ikon & warna; bukan sekadar label. */
  kind: 'audit' | 'price' | 'social' | 'system'
  title: string
  text: string
  timeAgo: string
  read: boolean
  /** Tujuan saat diklik. null = tidak menuju ke mana-mana. */
  href: string | null
}

export interface Message {
  id: string
  from: string
  avatar: string | null
  preview: string
  timeAgo: string
  unread: boolean
  /** pesan sistem bisa menunjuk ke halaman terminal (mis. /settings) */
  href?: string | null
}

export interface ProfileStats {
  followers: number
  following: number
  /** Belum ada sumbernya (composer post & audit on-demand belum dibangun) → tak ditampilkan bila kosong. */
  posts?: number
  /** Token yang pernah dinilai user ini lewat audit on-demand. */
  audits?: number
}

export interface Profile {
  handle: string
  displayName: string
  avatar: string | null
  bio: string
  joined: string
  /** Alamat wallet terhubung, sudah dipersingkat. null = belum terhubung. */
  walletShort: string | null
  verified: boolean
  /** Belum ada sumbernya di synt-akun (follow/post menyusul) → kosong = blok statistik tak ditampilkan,
      bukan diisi nol yang tampak seperti "tak ada pengikut". */
  stats?: ProfileStats
}
