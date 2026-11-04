import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Creator, FeedPost, FeedTab, CoinBrief } from './types'
import { Avatar } from '@/components/Avatar'
import { Popover } from '@/components/Popover'
import type { PollState } from '@/lib/usePolling'
import { CoinList, LeaderCard, ProfileCard, SampleTag, WalletCard } from './cards'
import { mockLeaderBrief, mockWallet } from './mock'
import { AgentCard, EvidenceBlock, KindLabel, SourceList, TokenRefs, mutlak, relatif } from './agent'
import { useStickyState } from '@/lib/useStickyState'
import './Discovery.css'

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'following', label: 'Following' },
  { id: 'agent', label: 'Agent' },
]

/**
 * Discovery — ringkasan synt, dengan bobot di sisi sosial.
 *
 * Tiga kolom (lab 2026-10-20):
 *   kiri    siapa yang menulis    kartu synt agent + aturannya
 *   tengah  feed                  post agent (manusia menyusul)
 *   kanan   komoditas             newly audited, trending — data hidup
 *
 * ⬜ Kolom wallet & leaderboard DISEMBUNYIKAN sampai backend-nya ada (saldo
 * RPC, PnL — cakupan 11%). Komponennya tetap di cards.tsx. Menampilkan
 * angka contoh di sebelah kolom koin yang NYATA membuat keduanya diragukan.
 *
 * ⚠️ Pemisahan konten dijaga ketat: Discovery meRINGKAS, tidak menduplikasi.
 * Kartu koin di sini hanya simbol · skor · MC — metrik lengkap ada di
 * Trenches. Tiap kartu berakhir dengan tautan ke halaman pemilik datanya.
 *
 * ⚠️ PRODUK.md §1.1: ini BUKAN feed sosial terbuka. Yang boleh MEMPOSTING
 * hanya agent synt (lewat Approvals), pengguna ber-akses khusus, dan creator
 * terverifikasi.
 */
export function Discovery({
  agent,
  posts,
  newlyAudited,
  trending,
  catatan,
  template,
}: {
  /** Identitas penulis post agent — kolom kiri. */
  agent: Creator
  posts: FeedPost[]
  /** Status polling apa adanya — kolom menampilkan muat/galat sendiri. */
  newlyAudited: PollState<CoinBrief[]>
  trending: PollState<CoinBrief[]>
  /** Keterangan sumber feed (mis. "belum ada post terbit — contoh ditampilkan"). */
  catatan?: string | null
  /** Mode template lab: kolom profil, wallet & leaderboard (data contoh) ditampilkan. */
  template?: boolean
}) {
  // ⬜ KERANGKA: interaksi sosial disimpan lokal sampai backend akun ada.
  const [following] = useStickyState<string[]>('synt.following', [])
  const [tab, setTab] = useStickyState<FeedTab>('synt.discovery.tab', 'recent')

  // ⭐ Tab baru berarti kalau ada post MANUSIA. Selama feed hanya berisi
  // agent, tiga tab akan menampilkan isi yang sama — itu terbaca rusak.
  const adaManusia = posts.some((p) => !p.fromAgent)

  // ⬜ Penyaringan di klien atas data contoh. Saat integrasi, `tab` jadi
  // parameter permintaan — feed penuh tak layak dikirim lalu dibuang.
  const visible = !adaManusia
    ? posts
    : posts.filter((p) => {
        if (tab === 'agent') return p.fromAgent === true
        if (tab === 'following') return following.includes(p.author.id)
        return true
      })

  return (
    <div className="dc">
      {/* ── Kolom kiri: siapa yang menulis ── */}
      <aside className="dc-left">
        {template && <ProfileCard />}
        <AgentCard agent={agent} />
      </aside>

      {/* ── Kolom tengah: feed ── */}
      <main className="dc-feed">
        {/* Layar sempit: kolom kiri dilepas, ringkasannya pindah ke atas feed. */}
        <div className="dc-agent-inline">
          <AgentCard agent={agent} compact />
        </div>

        {(adaManusia || catatan) && (
          <div className={`dc-feed-bar ${adaManusia ? '' : 'is-title'}`}>
            {adaManusia ? (
              <div className="dc-tabs" role="tablist" aria-label="Feed category">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={tab === t.id ? 'is-active' : ''}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null /* judul "From the synt agent" dihapus 2026-10-24 (pemilik): feed langsung ke konten */}
            {catatan && <p className="dc-feed-note">{catatan}</p>}
            {/* ⬜ Composer sengaja tak ditampilkan: belum ada backend, dan tombol
                yang tak melakukan apa pun terbaca sebagai fitur rusak. */}
          </div>
        )}

        {visible.length === 0 ? (
          <p className="dc-empty">
            {tab === 'following'
              ? 'Nothing from the people you follow yet.'
              : 'No posts in this category yet.'}
          </p>
        ) : (
          visible.map((p) => (
            <Post key={p.id} post={p} />
          ))
        )}
      </main>

      {/* ── Kolom kanan: komoditas (data hidup) ── */}
      <aside className="dc-coins-col">
        <CoinList title="Newly audited" poll={newlyAudited} href="/trenches" showAge />
        <CoinList title="Trending" poll={trending} href="/trenches" />
        {template && <WalletCard wallet={mockWallet} />}
        {template && <LeaderCard items={mockLeaderBrief} />}
      </aside>

    </div>
  )
}

/**
 * Satu post (dipakai juga halaman `/post/:id`) — bentuknya timeline ala X, dgn satu pembeda: post bisa MENANDAI
 * pair, dan data pair itu (skor + base rate) tampil di dalam post.
 *
 * ⛔ Lab 2026-10-20 (keputusan pemilik): hanya agent yang memposting, dan
 * halaman detail `/post/:id` DIBLOKIR — route-nya tetap ada, tapi tak ada
 * yang menautkannya. Karena itu body bukan link, dan aksi yang bergantung
 * pada detail/backend akun (reply, repost, like, share, salin tautan,
 * laporkan) tampil TERKUNCI: terlihat supaya bentuk produknya terbaca,
 * tak bisa diklik supaya tak ada yang tampak bekerja padahal tidak.
 */
export function Post({ post: p }: { post: FeedPost }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const token = p.tokens?.[0]

  return (
    <article className={`dc-post ${p.fromAgent ? 'is-agent' : ''}`}>
      <header className="dc-post-head">
        {/* Bukan tombol: kartu profil & halaman profil agent belum ada. */}
        <div className="dc-post-author is-static">
          <Avatar name={p.author.name} src={p.author.avatar} size={38} shape="circle" />
          <span className="dc-post-id">
            <span className="dc-post-name">
              {p.author.name}
              {p.fromAgent && <span className="dc-agent-tag">Agent</span>}
              {p.sample && <SampleTag info="Example post, not published." />}
            </span>
            <span className="dc-post-time">
              {p.author.handle && <>{p.author.handle} · </>}
              {p.publishedAt ? (
                <time dateTime={p.publishedAt} title={mutlak(p.publishedAt)}>
                  {relatif(p.publishedAt)}
                </time>
              ) : (
                p.timeAgo
              )}
            </span>
          </span>
        </div>

        <div className="dc-post-menu-anchor">
          <button
            type="button"
            className="dc-post-more"
            aria-label="Post options"
            aria-expanded={menuOpen}
            data-popover-trigger
            onClick={() => setMenuOpen((v) => !v)}
          >
            <DotsIcon />
          </button>

          <Popover open={menuOpen} onClose={() => setMenuOpen(false)} label="Post options">
            <div className="pop-menu">
              {token && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate(`/coin/${token.mint}`)
                  }}
                >
                  <ChartIcon />
                  View {token.symbol} audit
                </button>
              )}
              <button type="button" className="is-locked" disabled title="Coming soon">
                <LinkIcon />
                Copy link
              </button>
              <span className="pop-sep" />
              <button type="button" className="is-locked" disabled title="Coming soon">
                <FlagIcon />
                Report post
              </button>
            </div>
          </Popover>
        </div>
      </header>

      {(p.kind || p.title) && (
        <div className="dc-post-headline">
          {p.kind && <KindLabel kind={p.kind} />}
          {p.title && <h2 className="dc-post-title">{p.title}</h2>}
        </div>
      )}

      {p.body && <p className="dc-post-body">{p.body}</p>}

      {p.image && <img className="dc-post-image" src={p.image} alt={p.imageAlt ?? ''} loading="lazy" />}
      {(p.corrections ?? []).map((c) => (
        <p key={c.at} className={`dc-koreksi ${c.jenis}`}>{c.jenis === 'retracted' ? 'Retracted' : 'Corrected'} · {mutlak(c.at)}: {c.alasan}</p>
      ))}

      {/* ⭐ Data pair yang ditandai — pembeda Discovery dari X. */}
      {p.evidence && <EvidenceBlock items={p.evidence} />}
      {p.tokens && p.tokens.length > 0 && <TokenRefs items={p.tokens} />}

      {p.sources && <SourceList items={p.sources} />}

      <footer className="dc-post-foot">
        <div className="dc-post-acts" aria-label="Post actions (coming soon)">
          <LockedAct label="Reply" icon={<CommentIcon />} />
          <LockedAct label="Repost" icon={<RepostIcon />} />
          <LockedAct label="Like" icon={<HeartIcon />} />
          <LockedAct label="Share" icon={<ShareIcon />} />
        </div>
      </footer>
    </article>
  )
}

/** Aksi ala X yang belum aktif — terlihat, tak bisa diklik (pola nav terkunci). */
function LockedAct({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <button type="button" className="dc-act is-locked" disabled aria-label={`${label} (coming soon)`} title="Coming soon">
      {icon}
    </button>
  )
}

function RepostIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </svg>
  )
}




function DotsIcon() {
  return (
    <svg viewBox="0 0 16 4" width="16" height="4" aria-hidden="true">
      <circle cx="2" cy="2" r="1.5" fill="currentColor" />
      <circle cx="8" cy="2" r="1.5" fill="currentColor" />
      <circle cx="14" cy="2" r="1.5" fill="currentColor" />
    </svg>
  )
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 18 16" width="16" height="15" fill="none" aria-hidden="true">
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

function CommentIcon() {
  return (
    <svg viewBox="0 0 18 16" width="16" height="15" fill="none" aria-hidden="true">
      <path
        d="M2 3a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 16 3v7a1.5 1.5 0 0 1-1.5 1.5H7l-4 3v-3h-.5A1.5 1.5 0 0 1 2 10.5V3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M11.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 4.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.2 7 9.8 4.9M6.2 9l3.6 2.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M6.5 9.5a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 1 0-4-4l-.8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.5 6.5a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 1 0 4 4l.8-.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M2 13h12M4 11V7M8 11V3M12 11V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}



function FlagIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <path d="M3.5 14V2.5M3.5 3h7l-1.2 2.6L10.5 8.5h-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
