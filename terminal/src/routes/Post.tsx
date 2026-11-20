import { useState, type ReactNode } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { Post } from '@/features/discovery/Discovery'
import { mockPosts, mockComments } from '@/features/discovery/mock'
import { ambilPosts, postsSegar } from '@/features/discovery/postsCache'
import { mockMe } from '@/features/account/mock'
import type { Comment, FeedPost } from '@/features/discovery/types'
import { TEMPLATE } from '@/lib/template'
import { usePolling } from '@/lib/usePolling'
import '@/features/discovery/Post.css'

/**
 * Halaman post + komentar — `/post/:id`, MODE TEMPLATE (lab).
 *
 * ⭐ Butir 5 AGEN-BUILD (2026-10-25): post dicari dulu di `/api/posts` synt-ops (post TERBIT; tak ada
 * `/api/posts/:id`, daftarnya kecil). Contoh dari `mockPosts` HANYA utk id contoh dan selalu berlabel SAMPLE
 * (kartu yang sama dgn feed Discovery). Id yang tak dikenal siapa pun → "Post not found." apa adanya.
 *
 * ⬜ KERANGKA komentar: belum ada backend (usulan B4). Komentar baru hanya masuk state lokal dan hilang saat
 * refresh; keterangannya ditulis di composer supaya tak terbaca tersimpan. Composer tetap dibangun karena bentuk
 * dan alurnya yang perlu dievaluasi sekarang.
 */
export function PostRoute() {
  const { id } = useParams<{ id: string }>()
  // ⛔ Flag mati (preview publik) = perilaku master apa adanya: keputusan pemilik, halaman detail post tetap
  // diblokir di publik; tautan publik hanya permalink `/p/<id>` dari synt-ops.
  if (!TEMPLATE) return <PostPratinjau />
  // key={id}: pindah post = state komentar lokal mulai dari nol
  return <PostCari key={id} id={id ?? ''} />
}

function PostCari({ id }: { id: string }) {
  // Daftar post terbit; dipoll lambat supaya koreksi/penarikan ikut terlihat bila halaman dibiarkan terbuka.
  // Cache memori ber-TTL (postsCache.ts): pindah antar post / dari Discovery tak meminta ulang daftar yang sama.
  // id tak ada di cache (mis. post baru terbit) → cache dilewati sekali, daftar diambil ulang dari synt-ops
  const poll = usePolling((signal) => ambilPosts(signal, id), 60_000, 'posts')
  const segar = postsSegar()
  const daftar = poll.data ?? (segar?.items.some((p) => p.id === id) ? segar : null)
  const nyata = daftar?.items.find((p) => p.id === id)
  if (nyata) return <PostView post={nyata} />

  if (poll.loading && !daftar) return <Keadaan>Loading post…</Keadaan>

  // Contoh hanya utk id contoh, sesudah daftar nyata tak memuatnya (atau gagal dimuat).
  const contoh = mockPosts.find((p) => p.id === id)
  if (contoh) return <PostView post={contoh} />

  // ⛔ Gagal memuat ≠ tidak ada: jangan menulis "not found" utk post yang mungkin ada.
  if (poll.error && !daftar) {
    return <Keadaan>Couldn't load posts ({poll.error.message}). Retrying.</Keadaan>
  }
  return <Keadaan>Post not found.</Keadaan>
}

function Keadaan({ children }: { children: React.ReactNode }) {
  return (
    <section className="page">
      <div className="pv">
        <div className="pv-card">
          <p className="pv-empty" role="status">
            {children}
            <br />
            <Link to="/discovery">Back to Discovery</Link>
          </p>
        </div>
      </div>
    </section>
  )
}

function PostView({ post }: { post: FeedPost }) {
  const navigate = useNavigate()
  // Komentar contoh (mockComments) hanya utk post contoh; post terbit tak punya komentar sampai backend ada.
  const [comments, setComments] = useState<Comment[]>(post.sample ? (mockComments[post.id] ?? []) : [])
  const [draft, setDraft] = useState('')

  const total = comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return

    setComments((prev) => [
      {
        id: `local-${Date.now()}`,
        author: { id: 'me', name: mockMe.displayName, avatar: mockMe.avatar, handle: mockMe.handle },
        timeAgo: 'now',
        body,
        likes: 0,
      },
      ...prev,
    ])
    setDraft('')
  }

  return (
    <section className="page">
      <div className="pv">
        <button type="button" className="pv-back" onClick={() => navigate(-1)}>
          <BackIcon /> Back
        </button>

        {/* Kartu yang sama dgn feed: judul, bukti angka, token dgn base rate, sumber, koreksi, label SAMPLE. */}
        <Post post={post} />

        <form className="pv-card pv-composer" onSubmit={submit}>
          <Avatar name={mockMe.displayName} src={mockMe.avatar} size={36} shape="circle" />
          <div className="pv-composer-main">
            <textarea
              className="pv-input"
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              aria-label="Add a comment"
            />
            <div className="pv-composer-foot">
              <span className="pv-hint">Comments are not connected yet. Yours is not saved.</span>
              <button type="submit" className="pv-submit" disabled={!draft.trim()}>
                Comment
              </button>
            </div>
          </div>
        </form>

        <div className="pv-card">
          <h2 className="pv-section">
            Comments {total > 0 && <span className="pv-count">{total}</span>}
          </h2>

          {comments.length === 0 ? (
            <p className="pv-empty">No comments yet.</p>
          ) : (
            <ul className="pv-list">
              {comments.map((c) => (
                <li key={c.id}>
                  <CommentItem comment={c} />
                  {c.replies && c.replies.length > 0 && (
                    <ul className="pv-replies">
                      {c.replies.map((r) => (
                        <li key={r.id}>
                          <CommentItem comment={r} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}


/**
 * Halaman post + komentar — `/post/:id`, FLAG MATI (preview): salinan master persis, kecuali tautan
 * "Back to Discovery" (`/` dialihkan ke Trenches → kini `/discovery`).
 *
 * ⬜ KERANGKA: komentar baru hanya masuk ke state lokal dan hilang saat
 * refresh. PRODUK.md §2 mencatat backend akun belum ada, jadi tidak ada
 * tempat mengirimnya. Composer tetap dibangun karena bentuk dan alurnya
 * yang perlu dievaluasi sekarang.
 */
function PostPratinjau() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const post = mockPosts.find((p) => p.id === id)
  const [comments, setComments] = useState<Comment[]>(
    id ? (mockComments[id] ?? []) : [],
  )
  const [draft, setDraft] = useState('')
  const [liked, setLiked] = useState(false)

  if (!post) {
    return (
      <section className="page">
        <div className="pv">
          <div className="pv-card">
            <p className="pv-empty">
              Post not found.
              <br />
              <Link to="/discovery">Back to Discovery</Link>
            </p>
          </div>
        </div>
      </section>
    )
  }

  const total = comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return

    setComments((prev) => [
      {
        id: `local-${Date.now()}`,
        author: { id: 'me', name: 'Yeremias NJ', avatar: null, handle: '@yeremias' },
        timeAgo: 'now',
        body,
        likes: 0,
      },
      ...prev,
    ])
    setDraft('')
  }

  return (
    <section className="page">
      <div className="pv">
        <button type="button" className="pv-back" onClick={() => navigate(-1)}>
          <BackIcon /> Back
        </button>

        <article className="pv-card">
          <header className="pv-head">
            <ProfilAuthor id={post.author.id} className="pv-author">
              <Avatar name={post.author.name} src={post.author.avatar} size={44} shape="circle" />
              <span className="pv-author-id">
                <span className="pv-author-name">{post.author.name}</span>
                <span className="pv-author-handle">
                  {post.author.handle ?? ''} · {post.timeAgo}
                </span>
              </span>
            </ProfilAuthor>
          </header>

          {post.body && <p className="pv-body">{post.body}</p>}

          <div className="pv-stats">
            <span>
              <strong>{post.likes + (liked ? 1 : 0)}</strong> Likes
            </span>
            <span>
              <strong>{total}</strong> Comments
            </span>
          </div>

          <div className="pv-acts">
            <button
              type="button"
              className={`pv-act ${liked ? 'is-liked' : ''}`}
              aria-pressed={liked}
              onClick={() => setLiked((v) => !v)}
            >
              <HeartIcon filled={liked} />
              {liked ? 'Liked' : 'Like'}
            </button>
            {post.mint && (
              <Link to={`/coin/${post.mint}`} className="pv-act">
                <ChartIcon />
                View audit
              </Link>
            )}
          </div>
        </article>

        <form className="pv-card pv-composer" onSubmit={submit}>
          <Avatar name="Yeremias NJ" size={36} shape="circle" />
          <div className="pv-composer-main">
            <textarea
              className="pv-input"
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              aria-label="Add a comment"
            />
            <div className="pv-composer-foot">
              <span className="pv-hint">Not saved. Preview only.</span>
              <button type="submit" className="pv-submit" disabled={!draft.trim()}>
                Comment
              </button>
            </div>
          </div>
        </form>

        <div className="pv-card">
          <h2 className="pv-section">
            Comments {total > 0 && <span className="pv-count">{total}</span>}
          </h2>

          {comments.length === 0 ? (
            <p className="pv-empty">No comments yet.</p>
          ) : (
            <ul className="pv-list">
              {comments.map((c) => (
                <li key={c.id}>
                  <CommentItem comment={c} />
                  {c.replies && c.replies.length > 0 && (
                    <ul className="pv-replies">
                      {c.replies.map((r) => (
                        <li key={r.id}>
                          <CommentItem comment={r} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/** Tautan ke profil penulis — hanya di mode template. Rute `/profile/:handle` terbuka sejak 4 Nov (main.tsx); build biasa (salinan master) belum menautkan penulis, jadi teks biasa. */
function ProfilAuthor({ id, className, children, ...rest }: { id: string; className?: string; children: ReactNode; 'aria-label'?: string }) {
  return TEMPLATE ? (
    <Link to={`/profile/${id}`} className={className} {...rest}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  )
}

function CommentItem({ comment: c }: { comment: Comment }) {
  const [liked, setLiked] = useState(false)

  return (
    <div className="pv-comment">
      <ProfilAuthor id={c.author.id} aria-label={`${c.author.name} profile`}>
        <Avatar name={c.author.name} src={c.author.avatar} size={34} shape="circle" />
      </ProfilAuthor>

      <div className="pv-comment-body">
        <div className="pv-comment-head">
          <ProfilAuthor id={c.author.id} className="pv-comment-name">
            {c.author.name}
          </ProfilAuthor>
          {c.author.handle && <span className="pv-comment-handle">{c.author.handle}</span>}
          <span className="pv-comment-time">· {c.timeAgo}</span>
        </div>

        <p className="pv-comment-text">{c.body}</p>

        <div className="pv-comment-acts">
          <button
            type="button"
            className={`pv-mini ${liked ? 'is-liked' : ''}`}
            aria-pressed={liked}
            onClick={() => setLiked((v) => !v)}
          >
            <HeartIcon filled={liked} />
            {c.likes + (liked ? 1 : 0)}
          </button>
          <button type="button" className="pv-mini">Reply</button>
        </div>
      </div>
    </div>
  )
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 18 16" width="14" height="13" fill="none" aria-hidden="true">
      <path
        d="M9 14.5S1.5 10.2 1.5 5.6A3.6 3.6 0 0 1 9 4a3.6 3.6 0 0 1 7.5 1.6c0 4.6-7.5 8.9-7.5 8.9Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M2 13h12M4 11V7M8 11V3M12 11V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M11 7H3M6 3.5 2.5 7 6 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
