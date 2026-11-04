import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { WalletHeld, WalletLaunch, WalletOutcome, WalletResponse } from '@/api/types'
import { TokenIdentity } from '@/components/TokenIdentity'
import { Metric } from '@/components/Metric'
import { ScoreCell, type ModelSkor } from '@/components/ScoreCell'
import { StatusChip, type NadaChip } from '@/components/StatusChip'
import { InfoPopover } from '@/components/Popover'
import { alamatPendek, umur } from '@/lib/format'
import { alamatMint } from '@/lib/mint'
import { useCopy } from '@/lib/useCopy'
import '@/features/trenches/TrenchesTable.css'
import './Wallet.css'

/**
 * ⭐ Wallet tracker READ-ONLY (butir 8, B2 27 Okt) — synt-dash `GET /api/wallet?addr=` (`dompet.rs`), di KEDUA build.
 *
 * ⛔ Kejujuran (syarat pemilik): ini BUKAN riwayat trade/PnL. Tabel transaksi per wallet (`v10_tx_awal`/`v10_tx_keluar`)
 * kosong di v10, jadi "apa yang dibeli/dijual wallet ini" tak bisa dijawab. Yang ditampilkan hanya apa yang mesin
 * synt lihat, dan cakupannya ditulis di halaman (kartu "What this shows"):
 *   1. token yang DILUNCURKAN wallet ini (creator pump.fun yang terdeteksi);
 *   2. token tempat wallet ini termasuk 20 holder teratas SAAT pair diaudit (potret pertama, sejak `holders_since`):
 *      hanya pair yang sampai tahap audit, hanya top 20;
 *   3. potret portofolio saat terakhir diaudit (umur & jumlah token account).
 * Outcome = sejak launch (sama dgn leaderboard creator), bukan klaim akurasi skor; tanpa label penipu/tuduhan.
 * ⛔ Tanpa wallet connect (di luar wewenang agen): input alamat saja.
 */

const SOLSCAN_AKUN = 'https://solscan.io/account/'
const angka = (n: number) => n.toLocaleString('en-US')

/* Kosakata outcome = leaderboard creator (Creators.tsx): rug ditulis "Collapsed". */
const OUTCOME: Record<WalletOutcome, { label: string; tone: NadaChip; def: string }> = {
  rug: { label: 'Collapsed', tone: 'bad', def: 'Price collapsed after launch.' },
  dead: { label: 'Dead', tone: 'muted', def: 'Never rose meaningfully above its launch price.' },
  survive: { label: 'Survived', tone: 'neutral', def: 'Rose after launch, but not enough, or not liquid enough, to count as a winner.' },
  winner: { label: 'Winner', tone: 'ok', def: 'Rose strongly, held the gain, and, where liquidity was measured, had enough to sell into.' },
}

/* Base rate runtuh per skor sehat: SAMA dgn synt-dash `skor_audit` (api.rs) yang menurunkan `score`. */
const RUNTUH: Record<number, number> = { 1: 49.7, 2: 32.7, 3: 24.9, 4: 20.5, 5: 13.2, 6: 9.5 }

function detikSejak(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.max(0, (Date.now() - t) / 1000)
}

function tglPendek(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const lalu = (iso: string | null | undefined) => {
  const s = detikSejak(iso)
  return s === null ? '—' : `${umur(s)} ago`
}

/* ── Ambil data: satu permintaan per alamat (server cache 60 dtk; data berubah lambat → tanpa polling) ── */

type Keadaan =
  | { k: 'loading' }
  | { k: 'ok'; data: WalletResponse }
  | { k: 'bad' }
  | { k: 'unavailable' }
  | { k: 'error' }

function useWallet(addr: string, coba: number, sah: boolean): Keadaan {
  const [st, setSt] = useState<{ addr: string; coba: number; v: Keadaan }>({ addr, coba, v: { k: 'loading' } })

  useEffect(() => {
    if (!sah) return
    const c = new AbortController()
    setSt({ addr, coba, v: { k: 'loading' } })
    api.wallet(addr, c.signal).then(
      (data) => setSt({ addr, coba, v: { k: 'ok', data } }),
      (e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        const v: Keadaan =
          e instanceof ApiError && e.status === 400
            ? { k: 'bad' }
            : e instanceof ApiError && (e.status === 503 || e.status === 404)
              ? { k: 'unavailable' }
              : { k: 'error' }
        setSt({ addr, coba, v })
      },
    )
    return () => c.abort()
  }, [addr, coba, sah])

  // hasil milik alamat/percobaan lama tak boleh tampil sesaat utk alamat baru
  // putaran 2 (nit 4): alamat tak sah dari URL → keadaan "bad" tanpa GET
  if (!sah) return { k: 'bad' }
  return st.addr === addr && st.coba === coba ? st.v : { k: 'loading' }
}

/* ── Halaman ── */

export function WalletLookup({ addr }: { addr?: string }) {
  const target = addr?.trim() ?? ''
  return (
    <section className="page">
      <div className="wt">
        <header className="wt-head">
          <h1 className="wp-title">Wallet tracker</h1>
          <p className="wp-sub">
            Look up a Solana wallet and see what the synt engine has recorded about it: tokens it launched, and
            pairs where it was a top holder when synt audited them.
          </p>
          <WalletForm initial={target} />
        </header>

        {target ? <WalletResult key={target} addr={target} /> : <Cakupan sejak={null} />}
      </div>
    </section>
  )
}

export function WalletForm({ initial = '', onGo, compact = false, autoFocus = false }: { initial?: string; onGo?: () => void; compact?: boolean; autoFocus?: boolean }) {
  const nav = useNavigate()
  const masukan = useRef<HTMLInputElement>(null)
  // putaran 2 (nit 6): drawer memfokus input saat dibuka. Effect anak berjalan sebelum effect Drawer, dan Drawer tak
  // merebut fokus yang sudah ada di dalamnya.
  useEffect(() => { if (autoFocus) masukan.current?.focus() }, [autoFocus])
  const [v, setV] = useState(initial)
  const [salah, setSalah] = useState(false)
  useEffect(() => { setV(initial); setSalah(false) }, [initial])

  return (
    <form
      className={`wt-form ${compact ? 'is-compact' : ''}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const a = v.trim()
        if (!alamatMint(a)) { setSalah(true); return }
        setSalah(false)
        nav(`/wallet/${a}`)
        onGo?.()
      }}
    >
      <label className="sr-only" htmlFor={compact ? 'wt-addr-drawer' : 'wt-addr'}>Solana wallet address</label>
      <div className="wt-form-row">
        <input
          ref={masukan}
          id={compact ? 'wt-addr-drawer' : 'wt-addr'}
          className="wt-input"
          value={v}
          onChange={(e) => { setV(e.target.value); if (salah) setSalah(false) }}
          placeholder="Solana wallet address"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={salah || undefined}
          aria-describedby={salah ? 'wt-form-err' : undefined}
        />
        <button type="submit" className="wt-go">Look up</button>
      </div>
      {salah && (
        <p id="wt-form-err" className="wt-form-err" role="alert">
          That does not look like a Solana address (32 to 44 base58 characters).
        </p>
      )}
    </form>
  )
}

function WalletResult({ addr }: { addr: string }) {
  const [coba, setCoba] = useState(0)
  const st = useWallet(addr, coba, alamatMint(addr))
  // putaran 2 (nit 5): tombol Try again hilang saat memuat ulang → fokus dipindah ke wadah hasil (tetap ada di semua
  // keadaan), bukan jatuh ke body.
  const wadah = useRef<HTMLDivElement>(null)
  return (
    <div ref={wadah} className="wt-result" tabIndex={-1} aria-label="Wallet lookup result">
      <IsiHasil addr={addr} st={st} ulang={() => { setCoba((n) => n + 1); wadah.current?.focus() }} />
    </div>
  )
}

function IsiHasil({ addr, st, ulang }: { addr: string; st: Keadaan; ulang: () => void }) {

  if (st.k === 'loading') {
    return (
      <>
        <div className="wt-card wt-skel" aria-hidden="true" />
        <p className="wt-state" role="status">Looking up {alamatPendek(addr)}…</p>
      </>
    )
  }
  if (st.k === 'bad') {
    return (
      <p className="wt-state" role="alert">
        <strong>{alamatPendek(addr)}</strong> is not a valid Solana wallet address. Check it and try again.
      </p>
    )
  }
  if (st.k !== 'ok') {
    return (
      <div className="wt-state" role="alert">
        <p>
          {st.k === 'unavailable'
            ? 'Wallet lookup is unavailable right now. The engine database did not answer.'
            : "Couldn't reach the engine."}
        </p>
        <button type="button" className="wt-retry" onClick={ulang}>Try again</button>
      </div>
    )
  }

  const d = st.data
  const kosong = d.launched_total === 0 && d.held_total === 0 && !d.wallet
  return (
    <>
      <Ringkasan d={d} />
      {kosong && (
        <p className="wt-state">
          synt has no record of this wallet. It did not launch a token synt detected, and it was not among the top{' '}
          {d.holders_top_n} holders of any pair synt audited{tglPendek(d.holders_since) ? ` since ${tglPendek(d.holders_since)}` : ''}.
          That says nothing about its other activity.
        </p>
      )}
      <Cakupan sejak={d.holders_since} topN={d.holders_top_n} />
      {!kosong && (
        <>
          <Launched d={d} />
          <Held d={d} />
        </>
      )}
    </>
  )
}

function Ringkasan({ d }: { d: WalletResponse }) {
  const { copy, copied } = useCopy()
  const sejak = tglPendek(d.holders_since)
  const w = d.wallet
  const sw = detikSejak(d.computed_at)
  return (
    <div className="wt-card wt-sum">
      <div className="wt-id">
        <div className="wt-id-main">
          <h2 className="wt-h">Wallet</h2>
          <button
            type="button"
            className="wt-addr"
            onClick={() => copy(d.addr, 'addr')}
            title={`Copy wallet address\n${d.addr}`}
            aria-label={copied === 'addr' ? 'Address copied' : `Copy wallet address ${d.addr}`}
          >
            {copied === 'addr' ? 'Copied' : d.addr}
          </button>
        </div>
        <a className="wt-ext" href={`${SOLSCAN_AKUN}${d.addr}`} target="_blank" rel="noopener noreferrer">
          Solscan ↗
        </a>
      </div>
      <div className="wt-metrics">
        <Metric variant="stat" label="Launched" note="detected by synt" value={angka(d.launched_total)} />
        <Metric
          variant="stat"
          label={`Top ${d.holders_top_n} holder`}
          note={sejak ? `at audit, since ${sejak}` : 'at audit'}
          value={angka(d.held_total)}
        />
        <Metric
          variant="stat"
          label="Wallet age"
          note={
            <InfoPopover info="From the oldest of its recent transactions, so a busy wallet can be older than this." label="Wallet age">
              lower bound
            </InfoPopover>
          }
          value={w?.age_days != null ? `${w.age_days < 1 ? '<1' : angka(Math.floor(w.age_days))}d` : null}
          why={w ? 'The wallet age was not measured at its last audit.' : 'This wallet was never profiled during an audit.'}
        />
        <Metric
          variant="stat"
          label="Tokens with a balance"
          // A6: arti "x of y" dulu hanya di `title` (tak terjangkau sentuh) → popover ketuk pada catatan waktu
          note={
            <InfoPopover
              info="Token accounts holding a balance, out of all token accounts, when synt last audited a pair this wallet was in."
              label="Tokens with a balance"
            >
              {w?.seen_at ? `as of ${lalu(w.seen_at)}` : 'at last audit'}
            </InfoPopover>
          }
          value={w?.tokens_held != null ? `${angka(w.tokens_held)}${w.tokens_seen != null ? ` of ${angka(w.tokens_seen)}` : ''}` : null}
          why={w ? 'The portfolio was not read at its last audit.' : 'This wallet was never profiled during an audit.'}
        />
      </div>
      <p className="wt-sum-foot">
        {sw !== null ? `Computed ${umur(sw)} ago` : 'Computation time unknown'} · Read-only, no wallet connection
      </p>
    </div>
  )
}

function Cakupan({ sejak, topN = 20 }: { sejak: string | null; topN?: number }) {
  const t = tglPendek(sejak)
  return (
    <div className="wt-card wt-scope">
      <h2 className="wt-h">What this shows</h2>
      <ul className="wt-scope-list">
        <li><b>Launched:</b> pump.fun tokens this wallet created that synt detected.</li>
        <li>
          <b>Top holder at audit:</b> pairs where this wallet was one of the top {topN} holders when synt audited the
          pair{t ? `, since ${t}` : ''}. Only pairs that reached the audit stage are covered, and only the top {topN}.
        </li>
        <li><b>Wallet facts:</b> its portfolio as last seen during an audit.</li>
      </ul>
      <p className="wt-scope-not">
        <b>Not shown:</b> trades, buys and sells, or profit and loss. synt does not keep a trade history per wallet,
        so this is not a record of everything this wallet did. Outcomes describe how each token did after launch,
        not intent, and do not measure how accurate its score was.
      </p>
    </div>
  )
}

/* ── Sel bersama ── */

function modelSkor(score: number | null, checks: number | null): ModelSkor {
  // putaran 2 (nit 1): "Not audited" HANYA bila memang tak ada audit (checks null). Diaudit tapi tanpa skor publik
  // (checks 0) → "—" seperti Trenches.
  if (score === null) {
    return checks === null
      ? { kind: 'quiet', text: 'Not audited', title: 'This pair did not reach the audit stage, so it has no score.' }
      : { kind: 'none', title: 'Audited, but no public score at this level.' }
  }
  const c = checks ?? 0
  const r = checks !== null ? RUNTUH[checks] : undefined
  return {
    kind: 'value',
    value: score,
    nadaKelas: c >= 5 ? 'is-high' : c >= 4 ? 'is-mid' : 'is-low',
    base: r !== undefined
      ? { pct: `${r.toFixed(0)}%`, word: 'collapsed', title: 'Share of tokens at this score that later collapsed', nilai: r }
      : null,
  }
}

function Outcome({ o }: { o: WalletOutcome | null }) {
  if (!o) {
    return (
      <StatusChip
        label="Open"
        tone="open"
        info="No outcome yet: the 90-minute observation window has not closed, or this token was not labelled."
      />
    )
  }
  const m = OUTCOME[o]
  return <StatusChip label={m.label} tone={m.tone} info={`${m.def} Since launch. Describes the token, not intent.`} />
}

function Token({ mint, symbol }: { mint: string; symbol: string | null }) {
  return (
    <TokenIdentity
      size="row"
      symbol={symbol?.trim() || 'Unnamed'}
      address={mint}
      href={`/coin/${mint}`}
      symbolTitle={symbol ?? undefined}
    />
  )
}

function Lebih({ shown, total, what }: { shown: number; total: number; what: string }) {
  if (total <= shown) return null
  return <p className="wt-more">Showing the latest {angka(shown)} of {angka(total)} {what}.</p>
}

/* ── Tabel ── */

function Launched({ d }: { d: WalletResponse }) {
  return (
    <div className="wt-card">
      <div className="wt-sec-head">
        <h2 className="wt-h">Launched</h2>
        <span className="wt-sec-n">{angka(d.launched_total)}</span>
      </div>
      {d.launched.length === 0 ? (
        <p className="wt-empty">No launches by this wallet among the pump.fun tokens synt detected.</p>
      ) : (
        <div className="wt-table" role="table" aria-label="Tokens launched by this wallet">
          <div className="wt-tr wt-tr-launch wt-th" role="row">
            <span role="columnheader">Token</span>
            <span role="columnheader" className="ta-r">Launched</span>
            <span role="columnheader">Score</span>
            <span role="columnheader">Outcome</span>
          </div>
          {d.launched.map((t: WalletLaunch) => (
            <div key={t.mint} className="wt-tr wt-tr-launch" role="row">
              <span role="cell" className="wt-c-token"><Token mint={t.mint} symbol={t.symbol} /></span>
              <span role="cell" className="wt-c ta-r wt-num wt-time" data-label="Launched">{lalu(t.launched_at)}</span>
              <span role="cell" className="wt-c-score"><ScoreCell model={modelSkor(t.score, t.checks)} look="sol" /></span>
              <span role="cell" className="wt-c" data-label="Outcome"><Outcome o={t.outcome} /></span>
            </div>
          ))}
        </div>
      )}
      <Lebih shown={d.launched.length} total={d.launched_total} what="launches" />
    </div>
  )
}

function Held({ d }: { d: WalletResponse }) {
  const sejak = tglPendek(d.holders_since)
  return (
    <div className="wt-card">
      <div className="wt-sec-head">
        <h2 className="wt-h">Top {d.holders_top_n} holder at audit</h2>
        <span className="wt-sec-n">{angka(d.held_total)}</span>
      </div>
      <p className="wt-sec-note">
        Its position in the first holder snapshot synt took of each pair. It may have bought or sold since.
        {/* A6: ≤760 kepala kolom tersembunyi → arti "Pair age" ditulis di sini (popover kepala tak terjangkau) */}
        <span className="wt-narrow-only"> Pair age is how old the pair was when synt took that snapshot.</span>
      </p>
      {d.held_at_audit.length === 0 ? (
        <p className="wt-empty">
          Not among the top {d.holders_top_n} holders of any pair synt audited{sejak ? ` since ${sejak}` : ''}.
        </p>
      ) : (
        <div className="wt-table" role="table" aria-label="Pairs where this wallet was a top holder at audit">
          <div className="wt-tr wt-tr-held wt-th" role="row">
            <span role="columnheader">Token</span>
            <span role="columnheader" className="ta-r">Rank</span>
            <span role="columnheader" className="ta-r">Supply</span>
            <span role="columnheader" className="ta-r">
              {/* A6 (nit Reviewer 8): ≤760 kepala kolom hanya utk pembaca layar → pemicu popover `display:none` (bukan
                  tab stop 1px tak terlihat); teks polos menggantikan nama kolom */}
              <span className="wt-th-plain">Pair age</span>
              <InfoPopover info="How old the pair was when synt took this holder snapshot." label="Pair age" className="wt-th-pop">Pair age</InfoPopover>
            </span>
            <span role="columnheader">Score</span>
            <span role="columnheader">Outcome</span>
            <span role="columnheader" className="ta-r">Seen</span>
          </div>
          {d.held_at_audit.map((t: WalletHeld) => (
            <div key={t.mint} className="wt-tr wt-tr-held" role="row">
              <span role="cell" className="wt-c-token"><Token mint={t.mint} symbol={t.symbol} /></span>
              <span role="cell" className="wt-c ta-r wt-num" data-label="Rank">#{t.rank}</span>
              <span role="cell" className="wt-c ta-r wt-num" data-label="Supply">
                {t.supply_pct === null ? '—' : `${t.supply_pct < 10 ? t.supply_pct.toFixed(1) : Math.round(t.supply_pct)}%`}
              </span>
              <span role="cell" className="wt-c ta-r wt-num" data-label="Pair age">{umur(t.pair_age_secs)}</span>
              <span role="cell" className="wt-c-score"><ScoreCell model={modelSkor(t.score, t.checks)} look="sol" /></span>
              <span role="cell" className="wt-c" data-label="Outcome"><Outcome o={t.outcome} /></span>
              <span role="cell" className="wt-c ta-r wt-num wt-time" data-label="Seen">{lalu(t.seen_at)}</span>
            </div>
          ))}
        </div>
      )}
      <Lebih shown={d.held_at_audit.length} total={d.held_total} what="pairs" />
    </div>
  )
}
