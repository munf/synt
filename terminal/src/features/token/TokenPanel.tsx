import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { TokenDetail, ScoreBreakdown } from './types'
import { TokenIdentity } from '@/components/TokenIdentity'
import { Metric } from '@/components/Metric'
import { harga, pct, trendClass, umur } from '@/lib/format'
import { useWatchlist } from '@/lib/useWatchlist'
import { useCopy } from '@/lib/useCopy'
import { JUDUL_PASAR_BELUM, LABEL_PASAR_BELUM } from './labels'
import './TokenPanel.css'

/**
 * Panel detail token — kolom kiri frame Figma 3:2, lebar 384px.
 *
 * Dua kartu bertumpuk: info+harga, lalu audit (skor + faktor + penjelasan
 * agent). Sebelumnya tiga — skor dan penjelasan dipisah, padahal keduanya
 * satu jawaban.
 */
export function TokenPanel({ token: t }: { token: TokenDetail }) {
  return (
    <div className="tp">
      <InfoCard token={t} />
      <AuditCard token={t} />
    </div>
  )
}

function InfoCard({ token: t }: { token: TokenDetail }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const watchlist = useWatchlist()
  const { copy, copied } = useCopy()
  const watched = watchlist.has(t.mint)

  // Web Share API tidak ada di semua browser desktop; jatuh ke salin tautan
  // supaya tombolnya tetap melakukan sesuatu yang berguna.
  const share = async () => {
    const url = `${location.origin}/coin/${t.mint}`
    if (navigator.share) {
      try {
        await navigator.share({ title: t.symbol, url })
        return
      } catch {
        // Dibatalkan pengguna atau tak diizinkan — lanjut ke salin.
      }
    }
    copy(url, 'share')
  }

  return (
    <section className="tp-card">
      {/* A2: `TokenIdentity` bersama (= panel BNB): simbol, lencana, alamat + salin, umur di baris-2.
          Dulu salin-alamat 6…4 di kanan kepala & umur "13m old" di baris sendiri. */}
      <header className="tp-head">
        <TokenIdentity
          size="panel"
          symbol={t.symbol}
          address={t.mint}
          src={t.image}
          href={`/coin/${t.mint}`}
          avatarLink
          badges={t.tag && <span className="tp-tag">{t.tag}</span>}
          tags={<span className="tp-meta">· Age {t.age}</span>}
        />
      </header>

      <div className="tp-actions">
        <div className="tp-icon-row">
          <IconButton label="Audited by synt" active title="Audited by synt">
            <CheckIcon />
          </IconButton>
          <IconButton
            label={watched ? 'Remove from watchlist' : 'Save to watchlist'}
            active={watched}
            onClick={() => watchlist.toggle(t.mint)}
          >
            <StarIcon filled={watched} />
          </IconButton>
          <IconButton
            label={copied === 'share' ? 'Link copied' : 'Share'}
            onClick={share}
          >
            <ShareIcon />
          </IconButton>
        </div>
        <button type="button" className="tp-buy">Buy</button>
      </div>

      <div className="tp-price">
        {/* Harga token mikro punya banyak desimal signifikan — jangan
            dipotong seperti angka besar, justru di sinilah presisinya. */}
        <span className="tp-price-value">{t.marketNotLoaded ? '—' : harga(t.price)}</span>
        {/* ⭐ 1d: dulu persen tanpa label (terbaca sbg 24 jam); ini harga kini vs harga pertama mesin */}
        {/* ⭐ P2: harga pasca-lulus belum dimuat → harga & persen = angka kelulusan → "—"/disembunyikan + label */}
        {t.marketNotLoaded && (
          <span className="tp-price-since tp-nomarket" title={JUDUL_PASAR_BELUM}>{LABEL_PASAR_BELUM}</span>
        )}
        {t.priceChange !== null && (
          <>
            <span className={`tp-price-delta ${trendClass(t.priceChange)}`}>
              {pct(t.priceChange)}
            </span>
            <span className="tp-price-since">since launch</span>
          </>
        )}
      </div>

      <div className="tp-metrics">
        {t.metrics.map((m) => (
          <Metric
            key={m.label}
            label={m.label}
            note={m.note}
            value={m.value}
            why={m.why}
            delta={m.change !== null && <span className={`tp-metric-delta ${trendClass(m.change)}`}>{pct(m.change)}</span>}
          />
        ))}
      </div>

      <footer className="tp-foot">
        {/* ⛔ Tanpa kotak, dan HANYA rantai. Tahap kurva ("bonding") sudah
            disebut baris meta di header, jadi badge kedua hanya mengulang. */}
        <span className="tp-chain-plain">{t.chains[0]}</span>
        <button
          type="button"
          className="tp-more"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          More Info <ChevronIcon flipped={moreOpen} />
        </button>
      </footer>

      {moreOpen && (
        <div className="tp-more-panel">
          {/* ⛔ Contract/Source/Age dihapus — ketiganya sudah tampil di header
              kartu, jadi membuka panel ini tak menambah apa pun. Diganti
              keadaan yang benar-benar mengubah risiko. */}
          <dl className="tp-more-grid">
            {t.facts.map((f) => (
              <div key={f.label}>
                <dt>
                  {f.label}
                  {f.mock && <span className="tp-fact-mock">mock</span>}
                </dt>
                <dd className={f.tone ? `is-${f.tone}` : undefined}>{f.value}</dd>
              </div>
            ))}
          </dl>

          <div className="tp-more-links">
            <a
              href={`https://solscan.io/token/${t.mint}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Solscan ↗
            </a>
            <Link to={`/coin/${t.mint}`}>Open full audit →</Link>
          </div>
        </div>
      )}
    </section>
  )
}

/* ⛔ Empat bar (SAFETY/LIQUIDITY/HOLDERS/TRUST) diringkas jadi DUA.
   Keempatnya adalah nama karangan tanpa padanan di mesin — synt punya satu
   skor, dan rinciannya memakai nama sinyal internal yang ditahan dari jalur
   publik.

   ⭐ Dua nama baru mengelompokkan sinyal yang memang berasal dari sumber
   berbeda, dan deskripsinya sengaja UMUM: menyebut "tick-by-tick" atau
   "bundler" akan membocorkan cara kerja yang justru ditahan `reasons`. */
const FACTOR_BARS: Array<[keyof ScoreBreakdown, string, string]> = [
  ['flow', 'FLOW', 'Weight based on transaction'],
  ['developer', 'DEVELOPER', 'Weight based on creator history'],
]

/**
 * Kartu audit — skor, dua bar faktor, penjelasan agent, dan jendela penilaian.
 *
 * ⭐ Dulu DUA kartu terpisah ("SYNT SCORE" dan "SYNT AGENT ANALYSIS").
 * Keduanya menjawab pertanyaan yang sama — seberapa berisiko, dan kenapa —
 * jadi memisahkannya memaksa mata melompat antar-kartu untuk merangkai satu
 * jawaban.
 */
function AuditCard({ token: t }: { token: TokenDetail }) {
  const a = t.analysis

  return (
    <section className="tp-card">
      <header className="tp-score-head">
        <div>
          <h2 className="card-title">synt audit</h2>
          {/* ⛔ Base rate WAJIB menempel pada skor (PRODUK.md §0) — tanpa
              penyebutnya, angka itu terbaca sebagai jaminan. */}
          <p className="tp-score-status">{t.scoreStatus}</p>
        </div>
        <ScoreRing value={t.score} />
      </header>

      <div className="tp-bars">
        {FACTOR_BARS.map(([key, label, desc]) => {
          /* ⭐ P1 (27 Okt): `null` = tak ada komponen terukur (mis. FLOW tanpa buys) → "—" + "Not measured",
             track kosong tanpa isian. Dulu 0 = bar kosong yang terbaca "paling berisiko". */
          const v = t.breakdown[key]
          return (
            <div key={key} className="tp-bar">
              <div className="tp-bar-head">
                <span className="tp-bar-label">{label}</span>
                <span className="tp-bar-value">{v ?? '—'}</span>
              </div>
              <p className="tp-bar-desc">{v === null ? `${desc}. Not measured` : desc}</p>
              <div
                className="tp-bar-track"
                role="meter"
                aria-valuenow={v ?? undefined}
                aria-valuetext={v === null ? 'Not measured' : undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
              >
                {v !== null && <span className="tp-bar-fill" style={{ width: `${v}%` }} />}
              </div>
            </div>
          )
        })}
      </div>

      <div className="tp-why">
        <h3 className="tp-reason-title card-subtitle">Why this score</h3>
        <p className="tp-reason">{a.reasoning}</p>

        {a.warnings.length > 0 && (
          <div className="tp-note is-warn">
            <div className="tp-note-head">
              <WarnIcon /> WARNING
            </div>
            <ul className="tp-note-list">
              {a.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}

        {a.verified.length > 0 && (
          <div className="tp-note is-ok">
            <div className="tp-note-head">
              <VerifiedIcon /> VERIFIED
            </div>
            <ul className="tp-note-list">
              {a.verified.map((v) => <li key={v}>{v}</li>)}
            </ul>
          </div>
        )}

        {t.scoring && <ScoringWindow window={t.scoring} />}
      </div>
    </section>
  )
}

/**
 * Jendela penilaian — kapan skor dibuat, dan sampai kapan ia masih bisa
 * berubah.
 *
 * ⭐ Ini menjawab pertanyaan yang selalu muncul dan tak dijawab terminal
 * mana pun: *"skor ini sudah final atau masih bergerak?"* Pair yang baru
 * dinilai di detik-300 terlihat jelas BELUM selesai.
 */
function ScoringWindow({ window: w }: { window: NonNullable<TokenDetail['scoring']> }) {
  // Judul "SCORING WINDOW" & garis waktu 60→500 dtk dihapus 2026-10-24 (permintaan pemilik); kalimatnya dipertahankan.
  // umur pair kini ≈ detik dinilai + waktu sejak dinilai. Lewat batas (500 dtk) = skor tak akan dinilai ulang,
  // jadi FINAL meski penilaian terakhir terjadi sebelum batas (dulu tetap tertulis "can still move until second 500").
  const umurKini = w.scoredAtSec + w.agoSec
  const selesai = w.scoredAtSec >= w.lastSec || umurKini >= w.lastSec
  const sisa = w.lastSec - umurKini
  return (
    <div className="tp-window">
      <p className="tp-window-note">
        {selesai
          ? `Final. Last scored ${umur(w.agoSec)} ago.`
          : `Last scored ${umur(w.agoSec)} ago. It can still change for about ${umur(sisa)}.`}
      </p>
    </div>
  )
}

/**
 * Cincin skor. Digambar dengan stroke-dasharray pada lingkaran SVG ketimbang
 * conic-gradient supaya ujung goresnya bisa dibulatkan dan nilainya bisa
 * dianimasikan nanti.
 */
/** Skor audit 0-100 sejak 2026-10-10 (sebelumnya `skor_sehat` 0-6). */
const MAKS = 100

function ScoreRing({ value }: { value: number | null }) {
  const r = 22
  const circumference = 2 * Math.PI * r
  // ⭐ Skala 0-100 (skor audit terkalibrasi) sejak 2026-10-10.
  // A2: tanpa skor → cincin kosong + "—" (bukan 0)
  const filled = value === null ? 0 : (Math.min(MAKS, Math.max(0, value)) / MAKS) * circumference

  return (
    <div className="tp-ring">
      <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="tp-ring-track" />
        {value !== null && <circle
          cx="26"
          cy="26"
          r={r}
          className="tp-ring-fill"
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 26 26)"
        />}
      </svg>
      <span className="tp-ring-value">{value ?? '—'}</span>
    </div>
  )
}



function IconButton({
  children,
  label,
  active,
  title,
  onClick,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={`tp-icon-btn ${active ? 'is-active' : ''}`}
      aria-label={label}
      aria-pressed={onClick ? active : undefined}
      title={title ?? label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M11.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7 4.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.2 7 9.8 4.9M6.2 9l3.6 2.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      viewBox="0 0 10 6"
      width="9"
      height="6"
      fill="none"
      aria-hidden="true"
      style={flipped ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path d="m1 1 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function WarnIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true">
      <path d="M7 1.8 13 12H1L7 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 5.8v2.6M7 10.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function VerifiedIcon() {
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="m4.6 7.2 1.6 1.6 3.2-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
