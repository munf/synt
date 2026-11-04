import { api } from '@/api/client'

/* ⭐ Sisa kecil review (AGEN-BUILD): `/post/:id` (template) dulu meminta `/api/posts` synt-ops pada SETIAP navigasi
   (tak ada `/api/posts/:id`, jadi tiap halaman post mengambil daftar penuh). Kini daftar terakhir disimpan di memori
   selama sesi tab dgn TTL pendek: navigasi Discovery → post → post lain dalam 30 dtk = satu permintaan.
   ⚠️ Kebasian: halaman yang baru dibuka bisa mulai dgn daftar berumur ≤30 dtk, lalu tik polling berikutnya (60 dtk,
   > TTL → selalu ke server) menyegarkannya. Jadi koreksi/penarikan post bisa tampil terlambat ≤ ±90 dtk (dulu ≤60).
   Post yang baru terbit dan belum ada di cache tak menunggu itu: `ambilPosts(signal, id)` melewati cache bila id
   tak ada di dalamnya. Hanya respons SUKSES yang disimpan; gagal tak pernah di-cache. */
const TTL_MS = 30_000

type Posts = Awaited<ReturnType<typeof api.posts>>

let simpan: { at: number; data: Posts } | null = null

/** Daftar post yang masih segar di memori, atau null. Dibaca sinkron supaya halaman post tak berkedip "Loading…". */
export function postsSegar(): Posts | null {
  return simpan && Date.now() - simpan.at < TTL_MS ? simpan.data : null
}

/** `api.posts` dgn cache memori ber-TTL; dipakai Discovery & halaman post.
 *  `perluId`: cache hanya dipakai bila memuat post itu (post baru terbit → ambil ulang, bukan "Post not found."). */
export async function ambilPosts(signal?: AbortSignal, perluId?: string): Promise<Posts> {
  const ada = postsSegar()
  if (ada && (perluId === undefined || ada.items.some((p) => p.id === perluId))) return ada
  const data = await api.posts(signal)
  simpan = { at: Date.now(), data }
  return data
}
