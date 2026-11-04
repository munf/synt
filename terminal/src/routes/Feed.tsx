import { api } from '@/api/client'
import { Discovery } from '@/features/discovery/Discovery'
import { adaptBrief } from '@/features/discovery/adapt'
import { mockAgent, mockPosts } from '@/features/discovery/mock'
import { ambilPosts } from '@/features/discovery/postsCache'
import { TEMPLATE } from '@/lib/template'
import type { CoinBrief } from '@/features/discovery/types'
import { usePolling, type PollState } from '@/lib/usePolling'

/** Baris per kolom koin — kolom samping, bukan pengganti Trenches. */
const N_KOIN = 5

/**
 * Discovery — route utama.
 *
 * Sumber per kolom:
 *   koin   ✅ synt-dash /api/trenches (data hidup, sama dgn Trenches)
 *   feed   ✅ post agent terbit — synt-ops /api/posts (Publish di Approvals); belum ada → contoh berlabel SAMPLE
 *   wallet & leaderboard ⬜ disembunyikan sampai backend-nya ada
 */
export function FeedRoute() {
  const baru = useKoin('new')
  const ramai = useKoin('trending')
  // cache memori ber-TTL 30 dtk, dibagi dgn halaman post (postsCache.ts); polling 60 dtk tetap mengambil data segar
  const post = usePolling((signal) => ambilPosts(signal), 60_000, 'posts')
  // Post TERBIT dari synt-ops (Publish di Approvals). Belum ada yang terbit → contoh berlabel SAMPLE, dgn keterangan
  // yang terlihat (bukan fallback diam-diam). API gagal → keterangan galat, contoh tetap berlabel SAMPLE.
  const terbit = post.data?.items ?? []
  const posts = terbit.length ? terbit : mockPosts
  const catatan = post.error ? `Couldn't load published posts (${post.error.message}). Showing sample posts.`
    : post.data && !terbit.length ? 'No published posts yet. Sample posts shown.' : null
  // Mode template (butir 4, 2026-10-25): koin & post NYATA seperti preview; hanya kolom yang butuh backend akun
  // (profil, wallet, leaderboard) yang ditambahkan sebagai contoh. Agent card memakai mockAgent di kedua mode.
  return (
    <section>
      <Discovery agent={mockAgent} posts={posts} newlyAudited={baru} trending={ramai} catatan={catatan} template={TEMPLATE} />
    </section>
  )
}

/**
 * ⛔ Tak ada fallback ke mock saat API gagal (CLAUDE.md: mock jangan jadi
 * fallback diam-diam) — kolom menampilkan statusnya sendiri.
 */
function useKoin(view: 'new' | 'trending'): PollState<CoinBrief[]> {
  return usePolling(
    async (signal) => {
      // Ambil lebih dari N: pair tanpa skor dibuang di adaptBrief.
      const r = await api.trenches(view, N_KOIN * 2, signal)
      return r.items
        .map((it) => adaptBrief(it, r.sol_usd))
        .filter((c): c is CoinBrief => c !== null)
        .slice(0, N_KOIN)
    },
    15_000,
    view,
  )
}
