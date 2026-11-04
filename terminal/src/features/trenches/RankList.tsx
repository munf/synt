import { Link } from 'react-router-dom'
import type { TrenchRow } from './types'
import { Avatar } from '@/components/Avatar'
import { compact, pct, trendClass } from '@/lib/format'
import './RankList.css'

/**
 * Daftar peringkat ringkas — kolom kanan frame Figma 3:2.
 *
 * Berbagi tipe TrenchRow dengan TrenchesTable, bukan tipe sendiri: keduanya
 * menampilkan token yang sama dengan kolom lebih sedikit. Tipe terpisah
 * berarti dua tempat yang harus diperbarui saat API berubah.
 */
export function RankList({ rows, activeMint }: { rows: TrenchRow[]; activeMint?: string }) {
  return (
    <div className="rl" role="table" aria-label="Token ranking">
      <div className="rl-head" role="row">
        <span role="columnheader">TOKEN</span>
        <span role="columnheader" className="ta-r">MC</span>
        <span role="columnheader" className="ta-r">GROWTH</span>
        <span role="columnheader" className="ta-r">SCORE</span>
      </div>

      <div role="rowgroup">
        {rows.map((r) => (
          <Link
            key={r.mint}
            to={`/coin/${r.mint}`}
            className={`rl-row ${r.mint === activeMint ? 'is-active' : ''}`}
            role="row"
          >
            <span role="cell" className="rl-token">
              <span className={`rl-rank ${r.rank <= 3 ? 'is-top' : ''}`}>{r.rank}</span>
              <Avatar name={r.symbol} size="md" />
              <span className="rl-id">
                <span className="rl-symbol">{r.symbol}</span>
                {r.handle && <span className="rl-handle">{r.handle}</span>}
              </span>
            </span>

            <span role="cell" className="rl-num">{r.marketCap === null ? '—' : compact(r.marketCap)}</span>
            <span role="cell" className={`rl-num ${r.marketCapChange === null ? '' : trendClass(r.marketCapChange)}`}>
              {r.marketCapChange === null ? '—' : pct(r.marketCapChange)}
            </span>
            <span role="cell" className="rl-num rl-score">{r.score ?? '—'}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
