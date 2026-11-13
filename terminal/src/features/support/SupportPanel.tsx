import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { akunApi, AkunGalat, type TopikDukungan } from '@/features/account/akun'
import { useAkun } from '@/features/account/useAkun'
import { EMAIL, TELEGRAM } from '@/routes/legal/bersama'
import { kumpulkan, tanpa, type KunciLampiran } from './konteks'
import '@/features/trenches/SidePanels.css'
import '@/features/account/Account.css'
import './Support.css'

const TOPIK: { v: TopikDukungan; label: string }[] = [
  { v: 'trading', label: 'Trading' },
  { v: 'account', label: 'Account & sign-in' },
  { v: 'scores', label: 'Scores & data' },
  { v: 'bug', label: 'Bug' },
  { v: 'other', label: 'Something else' },
]

const PESAN_MIN = 10
const PESAN_MAKS = 2000

/**
 * Isi drawer "Support" (tombol "?" di header, 4 Nov — keputusan pemilik: form tiket ke synt-akun).
 *
 * Konteks (halaman, token, trade terakhir, wallet, versi, layar) dilampirkan OTOMATIS tapi selalu terlihat, dan
 * tiap butir bisa dilepas. Pengguna yang masuk dibalas di Messages; tamu wajib menulis kontak.
 * Dipasang ulang tiap kali drawer dibuka (`key` di AppShell) → form & lampiran selalu segar.
 */
export function SupportPanel({ tradeKunci, onSelesai }: { tradeKunci?: number; onSelesai: () => void }) {
  const lokasi = useLocation()
  const akun = useAkun()
  const masuk = akun.status === 'masuk' && akun.profil ? akun.profil : null
  // dibekukan saat drawer dibuka: berpindah halaman di belakang drawer tak mengganti lampiran yang sedang dibaca
  const [{ konteks, lampiran }] = useState(() => kumpulkan(lokasi, masuk?.walletShort ?? null, tradeKunci))
  const [topik, setTopik] = useState<TopikDukungan | null>(tradeKunci != null ? 'trading' : null)
  const [pesan, setPesan] = useState('')
  const [kontak, setKontak] = useState('')
  const [jebakan, setJebakan] = useState('')
  const [dibuang, setDibuang] = useState<ReadonlySet<KunciLampiran>>(new Set())
  const [kirim, setKirim] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const [hasil, setHasil] = useState<{ id: number; replyIn: 'messages' | 'contact' } | null>(null)

  // hitung code point seperti server (emoji = 1)
  const panjang = [...pesan.trim()].length
  const perluKontak = !masuk

  async function serahkan(e: React.FormEvent) {
    e.preventDefault()
    setGalat(null)
    if (!topik) return setGalat('Pick a topic.')
    if (panjang < PESAN_MIN) return setGalat('Tell us a little more: at least 10 characters.')
    if (panjang > PESAN_MAKS) return setGalat('Keep it under 2,000 characters.')
    if (perluKontak && kontak.trim().length < 3) return setGalat('Add an email or Telegram handle so we can reply.')
    setKirim(true)
    try {
      setHasil(
        await akunApi.dukungan({
          category: topik,
          message: pesan.trim(),
          contact: kontak.trim() || undefined,
          context: tanpa(konteks, dibuang),
          includeWallet: !dibuang.has('wallet'),
          website: jebakan,
        }),
      )
    } catch (err) {
      setGalat(
        err instanceof AkunGalat && err.status !== 404 && err.status !== 0
          ? err.message
          : `Support is not reachable right now. Email ${EMAIL} instead.`,
      )
    } finally {
      setKirim(false)
    }
  }

  if (hasil) {
    return (
      <div className="sp">
        <div className="su-terkirim" role="status">
          <h3>Request {hasil.id > 0 ? `#${hasil.id} ` : ''}sent</h3>
          <p>
            {hasil.replyIn === 'messages'
              ? 'Thanks for writing in. We will reply in Messages, where you can also find this request.'
              : `Thanks for writing in. We will reply to ${kontak.trim()}.`}
          </p>
        </div>
        <div className="ac-form-aksi">
          {hasil.replyIn === 'messages' && (
            <Link to="/messages" className="ac-btn" onClick={onSelesai}>
              Open Messages
            </Link>
          )}
          <button type="button" className="ac-btn is-primary" onClick={onSelesai}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="sp" onSubmit={serahkan} noValidate>
      <p className="sp-hint">
        Tell us what went wrong and we will look into it. synt never asks for your seed phrase or private key.
      </p>

      <fieldset className="sp-field su-fieldset">
        <legend className="sp-label">Topic</legend>
        <div className="sp-presets" role="radiogroup" aria-label="Topic">
          {TOPIK.map((t) => (
            <button
              key={t.v}
              type="button"
              role="radio"
              aria-checked={topik === t.v}
              className={`sp-preset su-topik ${topik === t.v ? 'is-active' : ''}`}
              onClick={() => setTopik(t.v)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="ac-field">
        <span className="sp-label">What happened?</span>
        <textarea
          className="ac-input ac-textarea"
          value={pesan}
          onChange={(e) => setPesan(e.target.value)}
          rows={6}
          maxLength={PESAN_MAKS + 200}
          placeholder="What you did, what you expected, and what you saw instead."
        />
        <span className={`ac-hint ${panjang > PESAN_MAKS ? 'su-lewat' : ''}`}>
          {panjang.toLocaleString('en-US')} / 2,000
        </span>
      </label>

      <label className="ac-field">
        <span className="sp-label">{perluKontak ? 'How can we reach you?' : 'Contact (optional)'}</span>
        <input
          className="ac-input"
          value={kontak}
          onChange={(e) => setKontak(e.target.value)}
          maxLength={120}
          placeholder="Email or Telegram handle"
          autoComplete="email"
          spellCheck={false}
        />
        <span className="ac-hint">
          {perluKontak
            ? 'You are not signed in, so we reply here. Sign in to get the reply in Messages instead.'
            : 'We reply in Messages. Add a contact only if you also want a reply there.'}
        </span>
      </label>

      {/* jebakan bot: tak terlihat & tak terjangkau Tab; manusia tak pernah mengisinya */}
      <input
        className="su-jebakan"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        name="website"
        value={jebakan}
        onChange={(e) => setJebakan(e.target.value)}
      />

      <div className="sp-field">
        <span className="sp-label">Attached automatically</span>
        <ul className="su-lampiran">
          {lampiran.map((l) => {
            const lepas = dibuang.has(l.kunci)
            return (
              <li key={l.kunci} className={lepas ? 'is-lepas' : undefined}>
                <span className="su-lampiran-label">{l.label}</span>
                <span className="su-lampiran-nilai">{lepas ? 'Not attached' : l.nilai}</span>
                <button
                  type="button"
                  className="su-lampiran-aksi"
                  aria-label={`${lepas ? 'Attach' : 'Remove'} ${l.label.toLowerCase()}`}
                  onClick={() =>
                    setDibuang((d) => {
                      const n = new Set(d)
                      if (lepas) n.delete(l.kunci)
                      else n.add(l.kunci)
                      return n
                    })
                  }
                >
                  {lepas ? 'Attach' : 'Remove'}
                </button>
              </li>
            )
          })}
        </ul>
        <span className="ac-hint">
          These help us trace the problem. Nothing else from your browser is sent.{' '}
          <Link to="/privacy" onClick={onSelesai}>
            Privacy Policy
          </Link>
        </span>
      </div>

      {galat && (
        <p className="ac-galat" role="alert">
          {galat}
        </p>
      )}

      <div className="ac-form-aksi">
        <button type="button" className="ac-btn" onClick={onSelesai} disabled={kirim}>
          Cancel
        </button>
        <button type="submit" className="ac-btn is-primary" disabled={kirim}>
          {kirim ? 'Sending…' : 'Send request'}
        </button>
      </div>

      <p className="sp-hint su-kontak">
        Prefer email or Telegram? <span className="su-pilih">{EMAIL}</span> ·{' '}
        <a href={`https://t.me/${TELEGRAM.slice(1)}`} target="_blank" rel="noreferrer">
          {TELEGRAM}
        </a>
      </p>
    </form>
  )
}
