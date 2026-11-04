import type { BnbCalibrationResponse, BnbOutcome, BnbScore, BnbTrenchItem } from '@/api/types'
import { TEMPLATE } from '@/lib/template'
import { ScoreCell, type ModelSkor } from '@/components/ScoreCell'
import { GraduatedChip, StatusChip, type NadaChip } from '@/components/StatusChip'
import { InfoPopover } from '@/components/Popover'
import {
  DETIK_OUTCOME_MAKS,
  LAUNCHPAD,
  OUTCOME,
  hariKalibrasi,
  keadaanSkor,
  pajak,
  persenBase,
  rentangAuditBnb,
  tandaAngka,
  kalimatPlafon,
  tanggaBnb,
  teksSkor,
  tingkatBnb,
} from './bnbFormat'
import './Bnb.css'

/* Potongan UI BNB yang dipakai tabel, panel & halaman token. */

/** Label SAMPLE — sama bentuknya di setiap tempat contoh BNB tampil.
    ⚠️ Setiap pemakaian ditulis `TEMPLATE && contoh && …` supaya build biasa membuang komponen & teks contoh BNB. */
export function SampleTag() {
  // A6: penjelasan lewat popover ketuk (dulu `title`)
  return (
    <InfoPopover info="Example data, BNB endpoints are not connected yet." label="Sample" className="chip-trigger">
      <span className="bnb-contoh-tag">Sample</span>
    </InfoPopover>
  )
}

export function SampleNote({ children }: { children?: React.ReactNode }) {
  return (
    <p className="bnb-contoh-note" role="note">
      <SampleTag />{' '}
      {children ?? 'BNB endpoints are not connected yet. Every BNB number here is an example that shows the planned layout.'}
    </p>
  )
}

export function LaunchpadTag({ it }: { it: Pick<BnbTrenchItem, 'launchpad' | 'tax_bps' | 'graduated'> }) {
  const tax = pajak(it.tax_bps)
  return (
    <span className="bnb-tags">
      <span className={`bnb-lp is-${it.launchpad}`}>{LAUNCHPAD[it.launchpad] ?? it.launchpad}</span>
      {tax && <span className="bnb-tax" title="Transfer tax set by the token contract">{tax}</span>}
      {it.graduated && <GraduatedChip />}
    </span>
  )
}

/** Tooltip kolom/kartu skor. ⛔ Skor BNB = risiko RUNTUH, bukan peluang winner. */
export const ARTI_SKOR =
  'Rug risk check at 2 minutes, on the same 0 to 100 scale as Solana: the score is 100 minus the share of tokens with that score that turned out to be rugs. It does not predict winners.'

/**
 * Sel SCORE: `value/max` (+ "(n measured)") + base rate runtuh dari kalibrasi (PRODUK.md §0). `max` dari data.
 * Belum detik-120 → "Scoring at 2m"; quiet → "Quiet, not scored"; lainnya tanpa skor → "—".
 * A2: dirender komponen bersama `ScoreCell` (`look="bnb"`, tampilan sama dgn sebelumnya); ini hanya modelnya.
 */
export function modelSkorBnb(it: BnbTrenchItem, cal: BnbCalibrationResponse | null): ModelSkor {
  const k = keadaanSkor(it)
  if (k.kind === 'pending') return { kind: 'pending', text: 'Scoring at 2m', title: 'The score is computed two minutes after launch' }
  if (k.kind === 'quiet') return { kind: 'quiet', text: 'Quiet, not scored', title: 'Too few outside buyers by minute 2 to score this launch' }
  if (k.kind === 'none') return { kind: 'none', title: 'Not scored' }
  // 28 Okt: angka 0-100 dari tingkat kalibrasi (format SOL); tanpa tingkat → "—"
  const t = tingkatBnb(cal, k.value)
  if (!t) return { kind: 'none', title: cal ? 'No base rate yet' : 'Calibrating' }
  return {
    kind: 'value',
    value: t.skor,
    measured: teksSkor(k).terukur,
    base: { pct: persenBase(t.rug_pct), word: 'rug', nilai: t.rug_pct },
    baseKosong: 'No base rate yet',
    title: ARTI_SKOR + kalimatPlafon(cal),
  }
}

export function ScoreCellBnb({ it, cal, compact }: { it: BnbTrenchItem; cal: BnbCalibrationResponse | null; compact?: boolean }) {
  return <ScoreCell model={modelSkorBnb(it, cal)} look="bnb" compact={compact} />
}

/** Outcome 90 mnt sbg `StatusChip` bersama; definisi lewat popover ketuk (dulu `title`). Label tak diubah (§6). */
export function OutcomeChip({ outcome, ageSecs }: { outcome: BnbOutcome; ageSecs: number }) {
  if (outcome && OUTCOME[outcome]) {
    const o = OUTCOME[outcome]
    return <StatusChip label={o.label} tone={NADA_OUTCOME[outcome]} info={o.def} />
  }
  if (Number.isFinite(ageSecs) && ageSecs < DETIK_OUTCOME_MAKS) {
    return <StatusChip label="Open" tone="open" info="No outcome yet. It is labeled shortly after the 90 minute window closes." />
  }
  return <span className="tt-dim"><InfoPopover info="No outcome label was recorded for this pair." label="Outcome">—</InfoPopover></span>
}

const NADA_OUTCOME: Record<Exclude<BnbOutcome, null>, NadaChip> = { rug: 'bad', dead: 'muted', survive: 'neutral', winner: 'ok' }

/** Alasan skor: kalimat dari engine (`signals[].text`): ok ✓ / tidak ✕ / 14b: `ok: null` = tak terukur → tanda netral. */
export function SignalList({ score }: { score: BnbScore }) {
  if (!score.signals.length) return <p className="bnb-muted">No reasons were returned with this score.</p>
  return (
    <ul className="bnb-signals">
      {score.signals.map((s) => (
        <li key={s.key} className={s.ok === true ? 'is-ok' : s.ok === false ? 'is-bad' : 'is-unmeasured'}>
          <span className="bnb-signal-mark" aria-hidden="true">{s.ok === true ? '✓' : s.ok === false ? '✕' : '○'}</span>
          <span className="sr-only">{s.ok === true ? 'In favour:' : s.ok === false ? 'Against:' : 'Not measured:'}</span>
          <span>{s.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Kalimat base rate lengkap (panel & halaman token): penyebut n wajib terlihat. Hanya RUNTUH (arti skor). */
export function BaseRateLine({ cal, value }: { cal: BnbCalibrationResponse | null; value: number }) {
  const r = tingkatBnb(cal, value)
  if (!cal) return <p className="bnb-base-line">Base rate for BNB scores is not available yet.</p>
  if (!r) return <p className="bnb-base-line">No calibration row for this score yet.</p>
  return (
    <p className="bnb-base-line">
      Of <strong>{tandaAngka(r.n)}</strong> scored BNB tokens with this score, <strong>{persenBase(r.rug_pct)}</strong>{' '}
      were rugs{cal.base.rug_pct !== null ? <>, against <strong>{persenBase(cal.base.rug_pct)}</strong> across all scored tokens</> : null}
      {cal.provisional ? ' (provisional).' : '.'}
    </p>
  )
}

/* ── Kartu kalibrasi ─────────────────────────────────────────────────────────
   ⛔ Satu-satunya angka akurasi BNB di UI, dan ia datang dari `/api/bnb/calibration` apa adanya.
   Penyebut n di setiap baris. Tanpa ambang sinyal. */

/** Di bawah ini satu launchpad belum layak dibaca terpisah (UI, bukan ambang sinyal). 500: kalibrasi v1 four.meme
    n=271 (5% token dinilai) dan caveat server sendiri menyebutnya belum bisa dinilai terpisah. */
export const N_MIN_LAUNCHPAD = 500
/** Baris skor ber-n di bawah ini diredupkan: persentasenya masih bisa bergeser banyak. */
export const N_MIN_BARIS = 30

export function CalibrationCard({ cal, contoh, state }: {
  cal: BnbCalibrationResponse | null
  contoh?: boolean
  /** Keadaan saat `cal` null. */
  state?: 'loading' | 'missing' | 'error'
}) {
  if (!cal) {
    return (
      <section className="tp-card bnb-cal" aria-label="BNB score calibration">
        <h3 className="card-title">Score calibration</h3>
        <p className="bnb-muted">
          {state === 'loading'
            ? 'Loading calibration…'
            : state === 'error'
              ? 'Cannot reach BNB calibration. Retrying automatically.'
              : 'BNB calibration is not available yet.'}
        </p>
      </section>
    )
  }

  const hari = hariKalibrasi(cal)
  const lead = `${cal.provisional ? 'Provisional, based on' : 'Based on'} ${hari !== null ? `${hari} ${hari === 1 ? 'day' : 'days'}` : 'an unknown period'} of BNB data`
  // ⭐ 28 Okt: baris = tingkat skor audit 0-100 (format tabel publik SOL), bukan skor mentah 0-max
  const urut = tanggaBnb(cal)
  const sedikit = urut.some((r) => r.n < N_MIN_BARIS)
  const ho = cal.holdout
  const rentang = (xs: number[]) => rentangAuditBnb(cal, xs) ?? '—'
  const skorKata = (xs: number[]) => (rentang(xs).includes(' to ') ? 'scores' : 'score')
  const hoRentang = ho ? rentangTanggal(ho.period) : null

  return (
    <section className="tp-card bnb-cal" aria-label="BNB score calibration">
      <h3 className="card-title">Score calibration {TEMPLATE && contoh && <SampleTag />}</h3>
      <p className="bnb-cal-lead">
        {lead}, <strong>{tandaAngka(cal.base.n)}</strong> scored tokens.
      </p>
      <p className="bnb-cal-what">
        The score checks for rug risk on the same 0 to 100 scale as Solana: each score is 100 minus the share of
        tokens at that score that turned out to be rugs.{kalimatPlafon(cal)} It does not predict winners.
      </p>
      {cal.population_note && <p className="bnb-cal-note">{cal.population_note}</p>}

      <div className="bnb-cal-table" role="table" aria-label="Outcome by score">
        <div className="bnb-cal-row is-head" role="row">
          <span role="columnheader">Score</span>
          <span role="columnheader" className="ta-r">Tokens (n)</span>
          {/* A6: definisi outcome lewat popover ketuk (dulu `title` kepala kolom) */}
          <span role="columnheader" className="ta-r"><InfoPopover info={OUTCOME.rug.def} label="Rug">Rug</InfoPopover></span>
          <span role="columnheader" className="ta-r"><InfoPopover info={OUTCOME.winner.def} label="Winner">Winner</InfoPopover></span>
        </div>
        {urut.map((r) => (
          <div key={r.skor} className={`bnb-cal-row ${r.n < N_MIN_BARIS ? 'is-few' : ''}`} role="row">
            <span role="cell" className="bnb-cal-score">{r.skor}</span>
            <span role="cell" className="ta-r">{tandaAngka(r.n)}</span>
            <span role="cell" className="ta-r">{persenBase(r.rug_pct)}</span>
            <span role="cell" className="ta-r">{persenBase(r.winner_pct)}</span>
          </div>
        ))}
        <div className="bnb-cal-row is-base" role="row">
          <span role="cell">All scored</span>
          <span role="cell" className="ta-r">{tandaAngka(cal.base.n)}</span>
          <span role="cell" className="ta-r">{persenBase(cal.base.rug_pct)}</span>
          <span role="cell" className="ta-r">{persenBase(cal.base.winner_pct)}</span>
        </div>
        {cal.quiet && (
          <div className="bnb-cal-row is-quiet" role="row">
            <span role="cell">
              <InfoPopover info="Too few outside buyers by minute 2 to score this launch." label="Quiet">Quiet, not scored</InfoPopover>
            </span>
            <span role="cell" className="ta-r">{tandaAngka(cal.quiet.n)}</span>
            <span role="cell" className="ta-r">{persenBase(cal.quiet.rug_pct)}</span>
            <span role="cell" className="ta-r">{persenBase(cal.quiet.winner_pct)}</span>
          </div>
        )}
      </div>

      {ho && (ho.low.rug_pct !== null || ho.high.rug_pct !== null) && (
        <p className="bnb-cal-holdout">
          <strong>Holdout check</strong>
          {hoRentang ? ` (tokens born ${hoRentang}, not used to build the score)` : ' (tokens not used to build the score)'}
          : {skorKata(ho.low.scores)} {rentang(ho.low.scores)}, {persenBase(ho.low.rug_pct)} rug; {skorKata(ho.high.scores)} {rentang(ho.high.scores)},{' '}
          {persenBase(ho.high.rug_pct)} rug.
        </p>
      )}

      <div className="bnb-cal-lps">
        {(['flap', 'fourmeme'] as const).map((k) => {
          const g = cal.launchpads?.[k]
          return (
            <p key={k} className="bnb-cal-lp">
              <span className={`bnb-lp is-${k}`}>{LAUNCHPAD[k]}</span>{' '}
              {!g || g.n < N_MIN_LAUNCHPAD ? (
                <span className="bnb-muted">Not enough data yet{g ? ` (n ${tandaAngka(g.n)})` : ''}.</span>
              ) : (
                <span>n {tandaAngka(g.n)} scored tokens</span>
              )}
            </p>
          )
        })}
      </div>

      {cal.caveats?.length > 0 && (
        <ul className="bnb-cal-caveats">
          {cal.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      )}

      <p className="bnb-cal-foot">
        Each share is out of the tokens in its row. These are past results at each score, not a promise for any
        single token.{sedikit ? ` Dimmed rows have fewer than ${N_MIN_BARIS} tokens, so their shares can still move a lot.` : ''}
        {cal.version ? ` Version ${cal.version}.` : ''}
      </p>
    </section>
  )
}

/** Rentang tanggal UTC "23 Oct to 27 Oct" (nit Reviewer: dulu Math.ceil hari → 4,3 hari tertulis "5 days"). */
function rentangTanggal(p: { from: string; to: string } | null | undefined): string | null {
  const a = Date.parse(p?.from ?? '')
  const b = Date.parse(p?.to ?? '')
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  const f = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${f(a)} to ${f(b)}`
}
