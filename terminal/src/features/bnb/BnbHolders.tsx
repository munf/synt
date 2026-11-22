import { useEffect, useState } from 'react'
import { alamatPendek, umur } from '@/lib/format'
import { BSCSCAN_ADDRESS } from '@/features/bnb/useBnb'
import { TabKosong } from '@/features/token/view/TokenView'

/**
 * ⭐ P-7 (§8, 22 Nov): tab Top holders BNB — synt-dash `GET /api/bnb/holders/:addr` (saldo dihitung dari event Transfer
 * sejak blok lahir token). ⚠️ Node gratis hanya menyimpan log ±6 jam terakhir: sesudahnya server mengirim snapshot
 * terakhir (`stale`) atau 503 `history_unavailable` → keadaan kosong jujur, BUKAN "0 holder".
 */

interface Holder {
  rank: number
  address: string
  pct: number | null
  contract: boolean | null
  label: 'creator' | 'burn' | null
}
interface Jawab {
  holders_count: number
  computed_at: number
  stale?: boolean
  top: Holder[]
}

type Keadaan = { k: 'memuat' } | { k: 'ok'; d: Jawab } | { k: 'riwayat' } | { k: 'galat' }

export function BnbHolders({ token }: { token: string }) {
  const [st, setSt] = useState<{ t: string; v: Keadaan }>({ t: '', v: { k: 'memuat' } })
  useEffect(() => {
    const c = new AbortController()
    fetch(`/api/bnb/holders/${encodeURIComponent(token)}`, { signal: c.signal })
      .then(async (r) => {
        if (r.ok) return setSt({ t: token, v: { k: 'ok', d: (await r.json()) as Jawab } })
        const j = (await r.json().catch(() => ({}))) as { status?: string }
        setSt({ t: token, v: j.status === 'history_unavailable' ? { k: 'riwayat' } : { k: 'galat' } })
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setSt({ t: token, v: { k: 'galat' } })
      })
    return () => c.abort()
  }, [token])
  const v = st.t === token ? st.v : ({ k: 'memuat' } as Keadaan)

  if (v.k === 'memuat') return <p className="tv-tab-note" role="status">Reading this token&apos;s transfers on BNB Chain…</p>
  if (v.k === 'riwayat') {
    return (
      <TabKosong
        judul="No holder list for this pair."
        isi="synt builds the list from the token's transfers since launch. The node synt reads keeps only about the last 6 hours of transfers, and this pair is older than that with no saved list."
      />
    )
  }
  if (v.k === 'galat') return <TabKosong judul="Couldn't read the holder list." isi="BNB Chain did not answer. Try again in a minute." />
  const d = v.d
  const lalu = Math.max(0, Date.now() / 1000 - d.computed_at)
  return (
    <>
      <div className="cd-table" role="table" aria-label="Top holders">
        <div className="cd-tr cd-th" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">Wallet</span>
          <span role="columnheader" className="ta-r">Share</span>
          <span role="columnheader" className="ta-r">Type</span>
        </div>
        {d.top.map((h) => (
          <div key={h.address} className="cd-tr" role="row">
            <span role="cell" className="cd-rank">{h.rank}</span>
            <span role="cell" className="cd-wallet">
              <a className="cd-wallet-link" href={`${BSCSCAN_ADDRESS}${h.address}`} target="_blank" rel="noopener noreferrer" title={h.address}>
                {alamatPendek(h.address)}
              </a>
              {h.label === 'creator' && <span className="cd-tag is-dev">creator</span>}
              {h.label === 'burn' && <span className="cd-tag">burn</span>}
            </span>
            <span role="cell" className="ta-r cd-num">{h.pct == null ? '—' : `${h.pct < 0.1 ? '<0.1' : h.pct.toFixed(1)}%`}</span>
            <span role="cell" className="ta-r cd-num cd-dim">{h.contract == null ? '—' : h.contract ? 'Contract' : 'Wallet'}</span>
          </div>
        ))}
      </div>
      <p className="tv-tab-note">
        {d.holders_count.toLocaleString('en-US')} addresses hold this token, counted from its transfers since launch.
        Share is of all tokens minted. Contracts include the launchpad curve and trading pools.{' '}
        {d.stale
          ? `Saved list from ${umur(lalu)} ago: the node no longer keeps this token's early transfers.`
          : `Read ${umur(lalu)} ago.`}
      </p>
    </>
  )
}
