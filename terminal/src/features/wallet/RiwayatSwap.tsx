import { useEffect, useState } from 'react'
import { TokenIdentity } from '@/components/TokenIdentity'
import { ScoreCell, type ModelSkor } from '@/components/ScoreCell'
import { InfoPopover } from '@/components/Popover'
import { umur } from '@/lib/format'
import { dariMentah, jumlahRingkas, teksSol } from '@/features/trade/dagang'

/**
 * ⭐ Riwayat swap wallet (22 Nov, keputusan pemilik "implementasi penuh") — synt-akun `GET /api/akun/dompet?addr=`.
 *
 * Dibaca LANGSUNG dari rantai saat alamat dicari (30 transaksi terbaru), bukan dari indeks synt — jadi melengkapi
 * kartu lama yang hanya memuat apa yang dilihat mesin. ⛔ Kejujuran: jendela terbatas, SOL bukan PnL (posisi yang masih
 * dipegang tak dinilai), fee jaringan & sewa akun token tak dihitung. Ketiganya tertulis di kartu.
 */

interface TokenSwap {
  mint: string
  symbol?: string | null
  name?: string | null
  decimals: number
  buys: number
  sells: number
  solSpent: number
  solReceived: number
  tokenBought: string
  tokenSold: string
  first: number
  last: number
  synt: { score: number; scoreMax: number | null; collapseRatePct: number | null } | null
}

interface Riwayat {
  addr: string
  scannedTx: number
  limit: number
  oldest: number | null
  tokens: TokenSwap[]
  trades: unknown[]
}

type Keadaan = { k: 'loading' } | { k: 'ok'; d: Riwayat } | { k: 'busy' } | { k: 'error' }

function useRiwayat(addr: string, coba: number): Keadaan {
  const [st, setSt] = useState<{ kunci: string; v: Keadaan }>({ kunci: '', v: { k: 'loading' } })
  const kunci = `${addr}#${coba}`
  useEffect(() => {
    const c = new AbortController()
    fetch(`/api/akun/dompet?addr=${encodeURIComponent(addr)}`, { signal: c.signal })
      .then(async (r) => {
        if (r.status === 429) return setSt({ kunci, v: { k: 'busy' } })
        if (!r.ok) return setSt({ kunci, v: { k: 'error' } })
        setSt({ kunci, v: { k: 'ok', d: (await r.json()) as Riwayat } })
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setSt({ kunci, v: { k: 'error' } })
      })
    return () => c.abort()
  }, [addr, kunci])
  return st.kunci === kunci ? st.v : { k: 'loading' }
}

/** skor synt + base rate runtuh langsung dari synt-dash (bukan tabel tingkat) */
function modelSkor(s: TokenSwap['synt']): ModelSkor {
  if (!s) return { kind: 'quiet', text: 'Not scored', title: 'synt did not score this token, or it is outside the pairs synt tracks.' }
  const r = s.collapseRatePct
  return {
    kind: 'value',
    value: s.score,
    nadaKelas: r == null ? 'is-mid' : r <= 15 ? 'is-high' : r <= 30 ? 'is-mid' : 'is-low',
    base: r != null ? { pct: `${r.toFixed(0)}%`, word: 'collapsed', title: 'Share of tokens at this score that later collapsed', nilai: r } : null,
  }
}

const detikSejak = (t: number | null | undefined) => (t ? Math.max(0, Date.now() / 1000 - t) : null)

export function RiwayatSwap({ addr }: { addr: string }) {
  const [coba, setCoba] = useState(0)
  const st = useRiwayat(addr, coba)
  return (
    <div className="wt-card">
      <div className="wt-sec-head">
        <h2 className="wt-h">Recent swaps</h2>
        {st.k === 'ok' && <span className="wt-sec-n">{st.d.tokens.length}</span>}
      </div>
      <IsiRiwayat st={st} ulang={() => setCoba((n) => n + 1)} />
    </div>
  )
}

function IsiRiwayat({ st, ulang }: { st: Keadaan; ulang: () => void }) {
  if (st.k === 'loading') {
    return <p className="wt-sec-note" role="status">Reading the wallet&apos;s latest transactions on Solana. This takes a few seconds…</p>
  }
  if (st.k !== 'ok') {
    return (
      <div className="wt-sec-note" role="alert">
        <p>{st.k === 'busy' ? 'Too many wallet lookups right now. Wait a minute.' : "Couldn't read this wallet's transactions."}</p>
        <button type="button" className="wt-retry" onClick={ulang}>Try again</button>
      </div>
    )
  }
  const d = st.d
  const sejak = detikSejak(d.oldest)
  return (
    <>
      <p className="wt-sec-note">
        Buys and sells against SOL in its last {d.scannedTx} transactions{sejak !== null ? `, going back ${umur(sejak)}` : ''}, read
        from the chain when you looked it up. Net SOL is not profit: tokens it still holds are not valued, and network fees and
        token account rent are left out. Transfers and token-to-token swaps are skipped.
      </p>
      {d.tokens.length === 0 ? (
        <p className="wt-empty">No buys or sells against SOL in these transactions.</p>
      ) : (
        <div className="wt-table" role="table" aria-label="Recent swaps by token">
          <div className="wt-tr wt-tr-swap wt-th" role="row">
            <span role="columnheader">Token</span>
            <span role="columnheader" className="ta-r">Buys / sells</span>
            <span role="columnheader" className="ta-r">SOL in</span>
            <span role="columnheader" className="ta-r">SOL out</span>
            <span role="columnheader" className="ta-r">
              <span className="wt-th-plain">Net SOL</span>
              <InfoPopover info="SOL received minus SOL spent on this token in the window shown. Tokens still held are not counted." label="Net SOL" className="wt-th-pop">Net SOL</InfoPopover>
            </span>
            <span role="columnheader">synt score</span>
            <span role="columnheader" className="ta-r">Last</span>
          </div>
          {d.tokens.map((t) => {
            const bersih = t.solReceived - t.solSpent
            const dibeli = dariMentah(t.tokenBought, t.decimals)
            return (
              <div key={t.mint} className="wt-tr wt-tr-swap" role="row">
                <span role="cell" className="wt-c-token">
                  <TokenIdentity size="row" symbol={t.symbol?.trim() || 'Unnamed'} address={t.mint} href={`/coin/${t.mint}`} symbolTitle={t.name ?? undefined} />
                </span>
                <span role="cell" className="wt-c ta-r wt-num" data-label="Buys / sells">{t.buys} / {t.sells}</span>
                <span role="cell" className="wt-c ta-r wt-num" data-label="SOL in" title={dibeli > 0 ? `Bought ${jumlahRingkas(dibeli)} tokens` : undefined}>
                  {t.solSpent > 0 ? teksSol(t.solSpent) : '—'}
                </span>
                <span role="cell" className="wt-c ta-r wt-num" data-label="SOL out">{t.solReceived > 0 ? teksSol(t.solReceived) : '—'}</span>
                <span role="cell" className={`wt-c ta-r wt-num ${bersih > 0 ? 'is-up' : bersih < 0 ? 'is-down' : ''}`} data-label="Net SOL">
                  {bersih > 0 ? '+' : bersih < 0 ? '−' : ''}{teksSol(Math.abs(bersih))}
                </span>
                <span role="cell" className="wt-c-score"><ScoreCell model={modelSkor(t.synt)} look="sol" /></span>
                <span role="cell" className="wt-c ta-r wt-num wt-time" data-label="Last">{umur(detikSejak(t.last))} ago</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
