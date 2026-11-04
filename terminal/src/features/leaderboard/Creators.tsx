import { Link } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { CreatorRow, CreatorsResponse } from '@/api/types'
import { usePolling } from '@/lib/usePolling'
import { alamatPendek, umur as durasi } from '@/lib/format'
import './Creators.css'

/**
 * ⭐ Leaderboard creator NYATA (butir 13, B3 27 Okt) — synt-dash `GET /api/leaderboard/creators` (`kreator.rs`).
 *
 * Arti kolom dicek di penulisnya:
 * · `launches` = baris `v10_outcome_v3` per creator (setiap launch yang terdeteksi mesin sejak `since`).
 * · `labeled` = launch yang outcome-nya sudah ditetapkan (`outcome <> 'pending'`). ⚠️ Cakupan TIDAK rata (creator
 *   teratas: 263 dari 3.386) → setiap persen berpenyebut `labeled`, dan cakupan itu tertulis di tiap baris.
 * · rug / dead / survive / winner = `outcome` dari synt-v10 `outcome.rs klasifikasi` (harga relatif harga awal &
 *   puncak, plus likuiditas utk winner). ⛔ Ambangnya TIDAK ditulis di UI; definisi di legenda kualitatif saja.
 *   Kosakata publik yang sudah ada: rug = "collapsed" (base rate skor "x% collapsed").
 * · Urutan = server (`launches` turun, maks 200, hanya creator dgn `labeled` ≥ `min_labeled`).
 *
 * ⛔ Bukan tuduhan: creator teratas mayoritas "dead" dgn 0 collapsed (peluncur berantai yang token-nya tak
 * pernah naik). Copy menggambarkan riwayat launch, bukan niat. Server menghitung ulang tiap 15 mnt; polling 60 dtk
 * murah (hasil disajikan dari memori).
 */
const SOLSCAN_AKUN = 'https://solscan.io/account/'

const angka = (n: number) => n.toLocaleString('en-US')

function tglPendek(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function detikSejak(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.max(0, (Date.now() - t) / 1000)
}

/** Persen atas `labeled`; >0 tapi < 1 → "<1%" supaya tak terbaca nol; >99 tapi < 100 → ">99%". */
function bagian(n: number, labeled: number): string {
  if (labeled <= 0) return '—'
  const p = (n / labeled) * 100
  if (p > 0 && p < 1) return '<1%'
  // cermin "<1%": 99,5 s/d <100 dibulatkan jadi "100%" padahal tak semuanya
  if (p > 99 && p < 100) return '>99%'
  return `${Math.round(p)}%`
}

const HASIL = [
  { k: 'rug', label: 'Collapsed', cls: 'is-rug', def: 'Price collapsed after launch.' },
  { k: 'dead', label: 'Dead', cls: 'is-dead', def: 'Never rose meaningfully above its launch price.' },
  { k: 'survive', label: 'Survived', cls: 'is-survive', def: 'Rose after launch, but not enough, or not liquid enough, to count as a winner.' },
  { k: 'winner', label: 'Winner', cls: 'is-winner', def: 'Rose strongly, held the gain, and, where liquidity was measured, had enough to sell into.' },
] as const

export function CreatorsBoard() {
  const { data, error, loading } = usePolling((signal) => api.creators(signal), 60_000)

  if (!data) {
    if (loading) return <p className="cr-state">Loading creators…</p>
    const sedangDihitung = error instanceof ApiError && error.status === 503
    return (
      <p className="cr-state" role="status">
        {sedangDihitung
          ? 'The creator leaderboard is being computed, try again shortly.'
          : "Couldn't load the creator leaderboard. Retrying every minute."}
      </p>
    )
  }

  return <CreatorsTable data={data} stale={!!error} />
}

/** Kalimat dari DATA (bukan teks tetap): komposisi outcome 10 baris teratas DAFTAR (sudah tersaring ≥ min_labeled,
    jadi bukan "10 wallet dgn launch terbanyak" secara mutlak). Kosong bila tak ada yang berlabel. */
function ringkasTeratas(rows: CreatorRow[]): string {
  const top = rows.slice(0, 10)
  const l = top.reduce((a, c) => a + c.labeled, 0)
  if (top.length === 0 || l === 0) return ''
  const p = (k: 'rug' | 'dead' | 'survive' | 'winner') => bagian(top.reduce((a, c) => a + c[k], 0), l)
  const siapa = top.length === 1 ? 'For the top wallet listed' : `Across the top ${top.length} wallets listed`
  return `${siapa}, known outcomes are ${p('dead')} Dead, ${p('rug')} Collapsed, ${p('survive')} Survived and ${p('winner')} Winner. `
}

function CreatorsTable({ data, stale }: { data: CreatorsResponse; stale: boolean }) {
  const sejak = tglPendek(data.since)
  const umur = detikSejak(data.computed_at)
  // nit sisa: tanpa ringkasan (0 baris / 0 berlabel) kalimat "These figures…" tak menunjuk apa pun → paragraf disembunyikan
  const ringkas = ringkasTeratas(data.creators)

  return (
    <div className="cr">
      <header className="cr-head">
        <p className="cr-lead">
          Wallets that launched the most pump.fun tokens synt detected{sejak ? ` since ${sejak}` : ''}, and how those
          launches turned out.
        </p>
        <p className="cr-meta">
          {umur !== null ? `Updated ${durasi(umur)} ago` : 'Update time unknown'}
          {stale && <span className="cr-stale"> · Not updating, showing the last result</span>}
          {data.creators.length > 0 && <>{' · '}Top {angka(data.creators.length)} by launches</>}
        </p>
      </header>

      <div className="cr-notes">
        <p>
          <strong>Outcomes are known for only part of the launches.</strong> Each share below is out of the launches
          with a known outcome (the "Outcome known" column), not out of all launches. Creators with fewer than{' '}
          {data.min_labeled} known outcomes are not listed.
        </p>
        {ringkas && <p>{ringkas}These figures describe past launches, not intent.</p>}
        <dl className="cr-legend">
          {HASIL.map((h) => (
            <div key={h.k}>
              <dt><i className={`cr-dot ${h.cls}`} aria-hidden="true" />{h.label}</dt>
              <dd>{h.def}</dd>
            </div>
          ))}
        </dl>
      </div>

      {data.creators.length === 0 ? (
        <p className="cr-state">No creators to list yet.</p>
      ) : (
        <div className="cr-table" role="table" aria-label="Creator leaderboard">
          <div className="cr-row cr-row-head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">Creator</span>
            <span role="columnheader" className="ta-r">Launches</span>
            <span role="columnheader" className="ta-r">Outcome known</span>
            {HASIL.map((h) => (
              <span key={h.k} role="columnheader" className="ta-r" title={h.def}>{h.label}</span>
            ))}
            <span role="columnheader" className="ta-r">Last launch</span>
          </div>
          <div role="rowgroup">
            {data.creators.map((c, i) => <Baris key={c.creator} c={c} rank={i + 1} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function Baris({ c, rank }: { c: CreatorRow; rank: number }) {
  const terakhir = detikSejak(c.last_launch_at)
  const cakupan = c.launches > 0 ? `${bagian(c.labeled, c.launches)} of launches` : ''
  return (
    <div className="cr-row" role="row">
      <span role="cell" className="cr-rank">{rank}</span>
      <span role="cell" className="cr-wallet">
        {/* Butir 8: alamat → wallet tracker (launch & posisi top holder yang synt lihat); Solscan tetap di sebelahnya. */}
        <Link to={`/wallet/${c.creator}`} title={`Open ${c.creator} in the wallet tracker`}>
          {alamatPendek(c.creator)}
        </Link>
        <a className="cr-ext" href={`${SOLSCAN_AKUN}${c.creator}`} target="_blank" rel="noopener noreferrer"
          title={`${c.creator} on Solscan`} aria-label={`${alamatPendek(c.creator)} on Solscan`}>↗</a>
      </span>
      <span role="cell" className="cr-num" data-label="Launches">{angka(c.launches)}</span>
      <span role="cell" className="cr-num" data-label="Outcome known" title={cakupan}>
        {angka(c.labeled)} <span className="cr-of">of {angka(c.launches)}</span>
      </span>
      {HASIL.map((h) => (
        <span key={h.k} role="cell" className={`cr-num cr-share ${c[h.k] > 0 ? h.cls : 'is-zero'}`} data-label={h.label}
          title={`${angka(c[h.k])} of ${angka(c.labeled)} launches with a known outcome`}>
          {bagian(c[h.k], c.labeled)}
        </span>
      ))}
      <span role="cell" className="cr-num cr-last" data-label="Last launch">
        {terakhir === null ? '—' : `${durasi(terakhir)} ago`}
      </span>
      <span className="cr-bar" aria-hidden="true">
        {HASIL.map((h) => c.labeled > 0 && c[h.k] > 0 && (
          <i key={h.k} className={h.cls} style={{ flexGrow: c[h.k] }} />
        ))}
      </span>
    </div>
  )
}
