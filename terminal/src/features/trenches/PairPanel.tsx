import { QuickBuy } from '@/features/trade/QuickBuy'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { StatusChip } from '@/components/StatusChip'
import { ScoreSpark } from '@/components/ScoreCell'
import { InfoPopover } from '@/components/Popover'
import { alamatPendek, pct, trendClass, uang, umur } from '@/lib/format'
import { useWatchlist } from '@/lib/useWatchlist'
import { useCopy } from '@/lib/useCopy'
import type { TokenDetail } from '@/features/token/types'
import { hitung, rate, type Num, type PairModel, type Tag } from './pairModel'
import './PairPanel.css'

/**
 * ⭐ Panel detail Trenches BERSAMA kedua chain (A3), digambar ulang R1 (28 Okt, DESIGN-TERMINAL §0) dgn markup &
 * ukuran panel PREVIEW (`master` src/features/token/TokenPanel.tsx, 384px, dua kartu):
 *   (1) InfoCard: avatar 48 + simbol + umur, chip alamat + salin, ikon ✓ ☆ bagikan, Buy putih, harga 30px bernol
 *       subskrip + pil Δ "since launch", empat tile terpisah (LIQUIDITY / MARKET CAP / HOLDERS / BUY/SELL),
 *       kaki "SOLANA · More Info" (fakta + tautan explorer & audit penuh).
 *   (2) AuditCard: "SYNT AUDIT" + baris base rate + cincin skor, bar FLOW / DEVELOPER, WHY THIS SCORE, jendela skor.
 * Slot khusus BNB digambar dgn gaya yang sama (§0.2/0.3): tag Name reused / Creator-filled / Tax = chip di bawah
 * kepala, Provisional & outcome = chip di kartu audit, empat sinyal = grid bar, laci kalibrasi = tautan di kaki.
 *
 * Data: model baris (`PairModel`, angka sama persis dgn tabel di sebelahnya) + opsional `detail` (SOL, `/api/token`
 * lewat `adaptToken`) utk bar FLOW/DEVELOPER & fakta "More Info". Warna cincin = nada base rate (§0.5 / 6.1-2).
 * Quick buy NYATA sejak 2 Nov (SOL saja): jumlah dari pengaturan Quick buy, transaksi ditandatangani wallet pengguna.
 */
export function PairPanel({ m, detail = null, onCalibration, badges, ringkasTabel = false }: {
  m: PairModel
  /** SOL: detail `/api/token` (adaptToken) milik mint yang sama; null = belum dimuat / BNB. */
  detail?: TokenDetail | null
  /** BNB: buka laci "How BNB scores are calibrated". */
  onCalibration?: () => void
  /** Lencana di sebelah simbol (mis. SAMPLE di mode template). */
  badges?: React.ReactNode
  /** U26b putaran 2: tabel di sebelahnya dlm mode sempit (tanpa chevron detail) → kartu audit memuat isi detail itu. */
  ringkasTabel?: boolean
}) {
  const d = detail && detail.mint === m.id ? detail : null
  return (
    <div className="pp">
      <InfoCard m={m} d={d} badges={badges} />
      <AuditCard m={m} d={d} onCalibration={onCalibration} ringkas={ringkasTabel} />
    </div>
  )
}

/**
 * ⭐ U21 (audit 7 Nov): panel saat feed belum menjawab = bentuk dua kartu panel (blok `.sk` spt TokenSkeleton), bukan
 * kotak "Loading…" 103 px. Di 561-1100 px panel berada DI ATAS tabel: dulu kotak kecil itu tumbuh jadi panel ±770 px
 * saat data tiba dan mendorong tabel yang sudah terlihat ke luar layar (CLS 0,45 di 1024). Tinggi minimum kartu =
 * kartu SOL nyata (InfoCard 434, AuditCard 310 di 561-1100, diukur 8 Nov); markup sama dipakai kerangka statis
 * index.html.
 */
export function PairPanelSkeleton() {
  return (
    <div className="pp pp-skel" role="status" aria-label="Loading token details">
      <section className="pp-card pp-skel-info">
        <div className="pp-skel-head"><i className="sk sk-av" /><i className="sk sk-l" /></div>
        <i className="sk sk-num" />
        <div className="pp-skel-tiles"><i className="sk" /><i className="sk" /><i className="sk" /><i className="sk" /></div>
      </section>
      <section className="pp-card pp-skel-audit"><i className="sk sk-t" /><i className="sk sk-m" /><i className="sk sk-m" /><i className="sk sk-m" /></section>
    </div>
  )
}

/** Alamat di chip salin panel: Solana 6…4 seperti preview (`addressShort`), EVM 0x+4…4 (`alamatPendek`). */
function alamatPanel(a: string): string {
  return a.startsWith('0x') || a.length <= 11 ? alamatPendek(a) : `${a.slice(0, 6)}…${a.slice(-4)}`
}

function Nilai({ n, text, label }: { n: Num; text: string; label: string }) {
  if (n.v === null) return n.why ? <InfoPopover info={n.why} label={label}>—</InfoPopover> : <>—</>
  // U22: nilai yang ada + sumbernya (likuiditas SOL = sisi SOL saja) → popover ketuk
  return n.info ? <InfoPopover info={n.info} label={label}>{text}</InfoPopover> : <>{text}</>
}

function Tags({ tags }: { tags: Tag[] }) {
  return (
    <div className="pp-tags">
      {tags.map((t) => (
        <StatusChip key={t.label} label={t.label} tone={t.tone === 'warn' ? 'warn' : 'neutral'} info={t.info} />
      ))}
    </div>
  )
}

function InfoCard({ m, d, badges }: { m: PairModel; d: TokenDetail | null; badges?: React.ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const watchlist = useWatchlist()
  const { copy, copied } = useCopy()
  const watched = watchlist.has(m.id)
  const sol = m.chain === 'sol'
  const p2 = m.tags.find((t) => t.tone === 'warn' && sol)

  // Web Share API tak ada di semua browser desktop → jatuh ke salin tautan
  const share = async () => {
    const url = `${location.origin}${m.href}`
    if (navigator.share) {
      try {
        await navigator.share({ title: m.symbol, url })
        return
      } catch {
        // dibatalkan / tak diizinkan → salin
      }
    }
    copy(url, 'share')
  }

  const liq = m.curveFunds ?? m.liq
  const tiles: Array<{ label: string; note?: string; node: React.ReactNode }> = [
    // U22: SOL = sisi SOL saja (padanan BNB "Curve funds (one side)")
    { label: m.curveFunds ? 'Curve funds' : 'Liquidity', note: m.curveFunds ? '(one side)' : m.chain === 'sol' ? '(SOL side)' : undefined, node: <Nilai n={liq} text={uang(liq.v)} label="Liquidity" /> },
    { label: 'Market cap', node: <Nilai n={m.mcap} text={uang(m.mcap.v)} label="Market cap" /> },
    {
      label: m.holders.label,
      note: `(${m.holders.note})`,
      node: <Nilai n={m.holders} text={m.holders.v === null ? '' : m.holders.v.toLocaleString('en-US')} label={m.holders.label} />,
    },
    {
      label: 'Buy/sell,',
      note: m.bsNote,
      node:
        m.buys === null && m.sells === null ? (
          <InfoPopover info="Buys and sells were not measured yet." label="Buy/sell">—</InfoPopover>
        ) : (
          `${hitung(m.buys)} / ${hitung(m.sells)}`
        ),
    },
  ]

  /* More Info: SOL = fakta mesin dari `/api/token` (preview); BNB = keadaan launch yang tak tampil di tempat lain */
  const facts: Array<{ label: string; value: React.ReactNode; tone?: string | null }> = d
    ? d.facts.map((f) => ({ label: f.label, value: f.value, tone: f.tone }))
    : [
        { label: 'Launchpad', value: m.launchpad ?? '—' },
        { label: 'Curve progress', value: m.curve.v === null ? <Nilai n={m.curve} text="" label="Curve" /> : m.curve.v >= 100 ? 'Graduated' : `${m.curve.v.toFixed(1)}%${m.curve.note ? ` ${m.curve.note}` : ''}` },
        ...(m.chain === 'bnb' && m.curveFunds ? [{ label: 'Liquidity', value: <Nilai n={m.liq} text={uang(m.liq.v)} label="Liquidity" /> }] : []),
      ]

  return (
    <section className="pp-card" aria-label={`${m.symbol} market`}>
      <header className="pp-head">
        <Link to={m.href} aria-label={`Open ${m.symbol} audit`}>
          <Avatar name={m.symbol} src={m.image} size={48} />
        </Link>
        <div className="pp-head-id">
          <div className="pp-head-title">
            <Link to={m.href} className="pp-symbol" title={m.name && m.name !== m.symbol ? m.name : undefined}>
              {m.symbol}
            </Link>
            {badges}
          </div>
          <p className="pp-meta">{m.ageSecs === null ? 'Age not reported' : `${umur(m.ageSecs)} old`}</p>
        </div>
        <button
          type="button"
          className="pp-addr"
          onClick={() => copy(m.address, 'mint')}
          aria-label={`Copy contract address ${m.address}`}
        >
          {copied === 'mint' ? 'Copied' : alamatPanel(m.address)}
          <CopyIcon />
        </button>
      </header>

      {!sol && m.tags.length > 0 && <Tags tags={m.tags} />}

      <div className="pp-actions">
        <div className="pp-icon-row">
          {m.score.kind === 'value' && (
            <span className="pp-icon-btn is-active" role="img" aria-label="Audited by synt" title="Audited by synt">
              <CheckIcon />
            </span>
          )}
          <button
            type="button"
            className={`pp-icon-btn ${watched ? 'is-active' : ''}`}
            aria-label={watched ? 'Remove from watchlist' : 'Save to watchlist'}
            aria-pressed={watched}
            title={watched ? 'Remove from watchlist' : 'Save to watchlist'}
            onClick={() => watchlist.toggle(m.id)}
          >
            <StarIcon filled={watched} />
          </button>
          <button type="button" className="pp-icon-btn" aria-label={copied === 'share' ? 'Link copied' : 'Share'} title="Share" onClick={share}>
            <ShareIcon />
          </button>
        </div>
        {m.buy && <QuickBuy mint={m.address} symbol={m.symbol} className="pp-buy" chain={m.chain} />}
      </div>

      <div className="pp-price">
        {/* Harga mikro: nol subskrip ($0.0₅2866), presisi justru di sini */}
        <span className="pp-price-value">
          {m.price.v === null ? <InfoPopover info={m.price.why} label="Price">—</InfoPopover> : m.price.text}
        </span>
        {p2 && <span className="pp-price-since is-warn">{p2.label}</span>}
        {m.change.v !== null && (
          <>
            <span className={`pp-price-delta ${trendClass(m.change.v)}`}>{pct(m.change.v)}</span>
            <span className="pp-price-since">{m.chain === 'sol' ? m.change.label : `in ${m.change.label}`}</span>
          </>
        )}
      </div>
      {m.priceStale && <p className="pp-note is-warn" role="note">{m.priceStale}. Price and market cap are from that moment.</p>}

      <div className="pp-metrics">
        {tiles.map((t) => (
          <div key={t.label} className="pp-metric">
            <span className="pp-metric-label">
              {t.label}
              {t.note && <> <span className="pp-metric-note">{t.note}</span></>}
            </span>
            <span className="pp-metric-value">{t.node}</span>
          </div>
        ))}
      </div>

      <footer className="pp-foot">
        <span className="pp-chain">{sol ? 'Solana' : 'BNB Chain'}</span>
        <button type="button" className="pp-more" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
          More Info <ChevronIcon flipped={moreOpen} />
        </button>
      </footer>

      {moreOpen && (
        <div className="pp-more-panel">
          {facts.length > 0 && (
            <dl className="pp-more-grid">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd className={f.tone ? `is-${f.tone}` : undefined}>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {m.quoteNote && <p className="pp-note">{m.quoteNote}</p>}
          <div className="pp-more-links">
            <a href={m.explorer.url} target="_blank" rel="noopener noreferrer">{m.explorer.name} ↗</a>
            <Link to={m.href}>Open full audit →</Link>
          </div>
        </div>
      )}
    </section>
  )
}

/* ⛔ Bar SOL = dua kelompok sinyal menurut SUMBER (preview); deskripsi sengaja umum (tak membocorkan `reasons`). */
const BAR_SOL: Array<['flow' | 'developer', string, string]> = [
  ['flow', 'Flow', 'Weight based on transaction'],
  ['developer', 'Developer', 'Weight based on creator history'],
]

function AuditCard({ m, d, onCalibration, ringkas = false }: { m: PairModel; d: TokenDetail | null; onCalibration?: () => void; ringkas?: boolean }) {
  const s = m.score
  const bnb = m.chain === 'bnb'
  const nilai = s.kind === 'value'
  // Baris status = base rate (PRODUK.md §0) dari tabel yang sama dgn skornya; SOL persis format preview
  const status = !nilai
    ? `${s.title}${s.sub ? ` · ${s.sub}` : ''}`
    : s.rate === null
      ? 'No base rate yet'
      : `${s.rose !== null ? `${s.rose}% rose 3× · ` : ''}${rate(s.rate)} collapsed${s.provisional ? ' · provisional' : ''}`

  return (
    <section className="pp-card" aria-label="synt audit">
      <header className="pp-score-head">
        <div className="pp-score-id">
          <h2 className="pp-card-title">synt audit</h2>
          <p className={`pp-score-status ${nilai ? '' : 'is-empty'}`}>
            {status}
            {!nilai && <InfoPopover info={s.info} label={s.title} className="ip-q">?</InfoPopover>}
          </p>
          {(s.kind === 'value' && s.provisional) || m.status ? (
            <div className="pp-chips">
              {s.kind === 'value' && s.provisional && (
                <StatusChip
                  label="Provisional"
                  tone="muted"
                  variant="outline"
                  info="BNB scores are calibrated on a short period of data. The shares can still move as more launches are labelled."
                />
              )}
              {m.status && <StatusChip label={m.status.label} tone={m.status.tone} prefix={m.status.prefix} info={m.status.info} />}
            </div>
          ) : null}
        </div>
        <ScoreRing m={m} />
      </header>

      {bnb ? (
        m.reasonsFull.length > 0 && (
          <div className="pp-bars">
            {m.reasonsFull.map((r) => (
              <div key={r.short} className="pp-bar">
                <div className="pp-bar-head">
                  <span className="pp-bar-label">{r.short}</span>
                  <span className={`pp-bar-value ${r.bad === true ? 'is-down' : r.bad === false ? 'is-up' : ''}`}>
                    {r.bad === true ? 'Flag' : r.bad === false ? 'Pass' : '—'}
                  </span>
                </div>
                <p className="pp-bar-desc">{r.full}</p>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="pp-bars">
          {BAR_SOL.map(([k, label, desc]) => {
            const v = d ? d.breakdown[k] : null
            return (
              <div key={k} className="pp-bar">
                <div className="pp-bar-head">
                  <span className="pp-bar-label">{label}</span>
                  <span className="pp-bar-value">{v === null ? '—' : v}</span>
                </div>
                <p className="pp-bar-desc">{v === null && d ? 'Not measured' : desc}</p>
                <div className="pp-bar-track" role="meter" aria-valuenow={v ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                  {v !== null && <span className="pp-bar-fill" style={{ width: `${v}%` }} />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="pp-why">
        {!bnb && (
          <>
            <h3 className="pp-reason-title">Why this score</h3>
            <p className="pp-reason">{d?.analysis.reasoning ?? m.explanation ?? 'No explanation written yet.'}</p>
          </>
        )}
        {bnb && s.kind === 'value' && (
          <p className="pp-reason">
            {s.rate !== null ? <><b className={`sk-tone-${s.tone}`}>{rate(s.rate)}</b> {s.sentence}.</> : s.sentence}
            {s.measured !== null && <> Only {s.measured} of {s.checksMax ?? s.max} checks could be measured for this pair.</>}
          </p>
        )}
        {bnb && !nilai && <p className="pp-reason">{s.info}</p>}
        {ringkas && <LintasanSkor m={m} />}

        {(m.scoreWindow || bnb) && (
          <div className="pp-window">
            {m.scoreWindow && <p className="pp-window-note">{m.scoreWindow}</p>}
            {bnb && (
              <p className="pp-window-note">
                {nilai && s.scoredAt ? 'Scored once at minute 2. ' : ''}
                <button type="button" className="pp-link" onClick={onCalibration}>How BNB scores are calibrated</button>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * ⭐ U26b putaran 2 (Reviewer): di tabel sempit (ponsel / kartu < 700 px) chevron detail baris disembunyikan dan sel
 * SCORE tanpa sparkline → isi detail yang tak ada di panel dibawa ke sini (teks sama dgn PairTable `Expand`): evolusi
 * skor (sparkline bertangga + "Scored N× so far · a → b", CLAUDE.md "tak boleh dihilangkan") dan "A score is an audit,
 * not a guarantee." (+ jumlah cek terukur SOL; BNB sudah menulisnya di atas). Hanya dirender saat `ringkas`.
 */
function LintasanSkor({ m }: { m: PairModel }) {
  const s = m.score
  if (s.kind !== 'value') return null
  const h = s.spark
  const naik = !!h && (h[h.length - 1] ?? 0) >= (h[0] ?? 0)
  return (
    <div className="pp-traj">
      {h && h.length > 1 && (
        <p className="pp-traj-sum">
          <ScoreSpark points={h} rising={naik} />
          <span>
            Scored <strong>{h.length}×</strong> so far{' · '}
            <span className={naik ? 'is-up' : 'is-down'}>{h[0]} → {h[h.length - 1]}</span>
          </span>
        </p>
      )}
      <p className="pp-reason">
        {m.chain !== 'bnb' && s.measured !== null && <>Only {s.measured} of {s.checksMax ?? s.max} checks could be measured for this pair. </>}
        A score is an audit, not a guarantee.
      </p>
    </div>
  )
}

/** Cincin skor preview (52px, stroke-dasharray). Isi = skor/max; warna isi = nada base rate (§0.5). */
function ScoreRing({ m }: { m: PairModel }) {
  const s = m.score
  const r = 22
  const keliling = 2 * Math.PI * r
  const isi = s.kind === 'value' ? (Math.min(s.max, Math.max(0, s.value)) / (s.max || 1)) * keliling : 0
  return (
    <div className="pp-ring">
      <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} className="pp-ring-track" />
        {s.kind === 'value' && (
          <circle
            cx="26"
            cy="26"
            r={r}
            className={`pp-ring-fill sk-stroke-${s.tone}`}
            strokeDasharray={`${isi} ${keliling}`}
            transform="rotate(-90 26 26)"
          />
        )}
      </svg>
      <span className="pp-ring-value">
        {s.kind === 'value' ? (
          <>
            {s.value}
            {s.max !== 100 && <span className="pp-ring-max">/{s.max}</span>}
          </>
        ) : (
          <span className="pp-ring-empty">—</span>
        )}
      </span>
      <span className="sr-only">{s.kind === 'value' ? `Score ${s.value} of ${s.max}` : s.title}</span>
    </div>
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

function CopyIcon() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h2" stroke="currentColor" strokeWidth="1.3" />
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
    <svg viewBox="0 0 10 6" width="9" height="6" fill="none" aria-hidden="true" className={flipped ? 'is-flipped' : undefined}>
      <path d="m1 1 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
