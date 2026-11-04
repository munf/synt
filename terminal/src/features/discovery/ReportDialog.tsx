import { useEffect, useState } from 'react'
import { Drawer } from '@/components/Drawer'
import type { FeedPost } from './types'

/**
 * Dialog laporan post.
 *
 * ⬜ KERANGKA: laporan tidak terkirim ke mana pun — belum ada backend
 * (PRODUK.md §2). Yang dibangun sekarang adalah alurnya: pilih alasan →
 * konfirmasi → umpan balik.
 *
 * Alasan yang tersedia sengaja mencerminkan risiko di ekosistem ini,
 * bukan daftar generik media sosial. "Promosi token menyesatkan" dan
 * "menyamar sebagai creator" adalah dua hal yang paling merugikan pengguna
 * di feed yang dibangun di atas skor audit.
 */
const REASONS = [
  { id: 'scam', label: 'Scam or misleading token promotion' },
  { id: 'impersonation', label: 'Impersonating a creator or project' },
  { id: 'spam', label: 'Spam or repetitive posting' },
  { id: 'abuse', label: 'Harassment or abusive language' },
  { id: 'other', label: 'Something else' },
]

export function ReportDialog({
  post,
  onClose,
}: {
  post: FeedPost | null
  onClose: () => void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)

  // Reset saat dialog dibuka untuk post lain — tanpa ini, alasan dari
  // laporan sebelumnya masih terpilih.
  useEffect(() => {
    if (post) {
      setReason(null)
      setNote('')
      setSent(false)
    }
  }, [post])

  if (!post) return null

  return (
    <Drawer open title="Report post" onClose={onClose}>
      {sent ? (
        <div className="rp-done">
          <CheckCircle />
          <h3>Report submitted</h3>
          <p>
            Thanks, we'll review this post. Reports are not visible to the
            person you reported.
          </p>
          <button type="button" className="rp-submit" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form
          className="rp"
          onSubmit={(e) => {
            e.preventDefault()
            setSent(true)
          }}
        >
          <p className="rp-context">
            Reporting <strong>{post.author.name}</strong>
            {post.body && <span className="rp-quote">"{post.body.slice(0, 90)}…"</span>}
          </p>

          <fieldset className="rp-reasons">
            <legend className="rp-legend">Why are you reporting this?</legend>
            {REASONS.map((r) => (
              <label key={r.id} className={`rp-reason ${reason === r.id ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="reason"
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                />
                <span>{r.label}</span>
              </label>
            ))}
          </fieldset>

          <label className="rp-note">
            <span className="rp-legend">Additional detail (optional)</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should we look at?"
            />
          </label>

          <div className="rp-foot">
            <span className="rp-hint">Not sent. Preview only.</span>
            <button type="submit" className="rp-submit" disabled={!reason}>
              Submit report
            </button>
          </div>
        </form>
      )}
    </Drawer>
  )
}

function CheckCircle() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="m15 24.5 6 6 12-13"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
