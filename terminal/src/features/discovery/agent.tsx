import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { ScorePill } from './cards'
import type { AgentPostKind, Creator, Evidence, SourceLink, TokenRef } from './types'

/* Bagian post agent Redaksi — bentuk datanya di types.ts "KONTRAK POST AGENT".

   ⭐ Prinsip tampilan: bukti angka BUKAN lampiran yang disembunyikan di balik
   tombol. Ia tampil di badan post, sejajar teksnya, karena itulah pembeda
   synt (BRAND.md §3: klaim tanpa angka tak ditulis) — pembaca bisa melihat
   dari mana setiap angka datang tanpa satu klik pun. */

const LABEL_JENIS: Record<AgentPostKind, string> = {
  data: 'Data note',
  token: 'Token note',
  update: 'Engine update',
  insight: 'Insight',
}

export function KindLabel({ kind }: { kind: AgentPostKind }) {
  return <span className={`dc-kind is-${kind}`}>{LABEL_JENIS[kind]}</span>
}

/** "5m ago" · "3h ago" · "4d ago" — dihitung dari ISO, bukan teks dari server. */
export function relatif(iso: string, now = Date.now()): string {
  const d = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

/** Waktu mutlak untuk tooltip & "as of" — UTC, karena pembaca terminal global. */
export function mutlak(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

/**
 * Kartu data: setiap angka + asalnya.
 *
 * Sumber & waktu dikelompokkan di kaki kartu — biasanya satu post memakai
 * satu-dua sumber, dan mengulang "source: synt engine" di bawah tiap angka
 * hanya menambah derau.
 */
export function EvidenceBlock({ items }: { items: Evidence[] }) {
  if (items.length === 0) return null
  const asal = [...new Set(items.map((e) => `${e.source} · as of ${mutlak(e.asOf)}`))]
  return (
    <figure className="dc-ev" aria-label="Numbers in this post and where they come from">
      <dl className="dc-ev-grid" style={{ ['--ev-n' as string]: Math.min(items.length, 3) }}>
        {items.map((e) => (
          <div key={e.label} className="dc-ev-item">
            <dt>{e.label}</dt>
            <dd className="dc-ev-value">{e.value}</dd>
            {e.note && <dd className="dc-ev-note">{e.note}</dd>}
          </div>
        ))}
      </dl>
      <figcaption className="dc-ev-src">
        {asal.map((a) => (
          <span key={a}>{a}</span>
        ))}
      </figcaption>
    </figure>
  )
}

/**
 * Token yang dibahas — skor TAK PERNAH tanpa base rate (PRODUK.md §0).
 * Base rate di sini ditulis, bukan tooltip: di dalam post, ia bagian klaimnya.
 */
export function TokenRefs({ items }: { items: TokenRef[] }) {
  return (
    <>
      {items.map((t) => (
        <Link key={t.mint} to={`/coin/${t.mint}`} className="dc-post-token">
          <Avatar name={t.symbol} src={t.avatar ?? null} size={26} />
          <span className="dc-post-token-id">
            <span className="dc-post-token-sym">{t.symbol}</span>
            {t.collapseRatePct != null && t.rose3xRatePct != null && (
              <span className="dc-post-token-base">
                At this score: {persen(t.rose3xRatePct)} rose 3× · {persen(t.collapseRatePct)} collapsed
              </span>
            )}
          </span>
          <ScorePill value={t.score} rug={t.collapseRatePct} rose={t.rose3xRatePct} />
          <span className="dc-post-token-cta">View audit →</span>
        </Link>
      ))}
    </>
  )
}

/** Satu desimal tetap — "2%" di baris token vs "2.0%" di kartu data terbaca
    sebagai dua angka berbeda. */
function persen(v: number): string {
  return `${v.toFixed(1)}%`
}

export function SourceList({ items }: { items: SourceLink[] }) {
  if (items.length === 0) return null
  return (
    <p className="dc-sources">
      <span>Sources</span>
      {items.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
          {s.title} ↗
        </a>
      ))}
    </p>
  )
}

/**
 * Kolom kiri — siapa yang menulis feed ini dan aturan mainnya.
 *
 * ⭐ Menggantikan kartu profil & daftar creator contoh (2026-10-20): belum
 * ada backend akun, dan persona contoh membuat halaman tampak seperti fitur
 * yang sudah bekerja. Yang ditulis di sini adalah janji yang benar-benar
 * ditegakkan alur Approvals, bukan slogan.
 */
export function AgentCard({ agent, compact = false }: { agent: Creator; compact?: boolean }) {
  return (
    <section className={`dc-card dc-agent ${compact ? 'is-compact' : ''}`}>
      <div className="dc-agent-id">
        <Avatar name={agent.name} src={agent.avatar} size={compact ? 36 : 44} shape="circle" />
        <span className="dc-agent-names">
          <span className="dc-agent-name">
            {agent.name}
            <span className="dc-agent-tag">Agent</span>
          </span>
          {agent.handle && <span className="dc-agent-handle">{agent.handle}</span>}
        </span>
      </div>
      {!compact && agent.bio && <p className="dc-agent-bio">{agent.bio}</p>}
      {/* Blok "How these posts are made" & "Verified creators…" DIHAPUS 2026-10-24 (pemilik: yang penting kontennya). */}
    </section>
  )
}
