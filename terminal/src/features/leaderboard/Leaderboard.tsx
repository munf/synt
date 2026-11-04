import { useStickyState } from '@/lib/useStickyState'
import type { PodiumEntry, LeaderboardRow } from './types'
import { Avatar } from '@/components/Avatar'
import { compact, pct, usd } from '@/lib/format'
import './Leaderboard.css'

/**
 * Leaderboard — frame Figma 3:16.
 *
 * Podium tiga kartu, lalu tabel peringkat 4+. Kartu rank #2 sengaja lebih
 * tinggi dan naik ke atas seperti di desain — urutan visualnya 1-2-3 dengan
 * #2 menonjol, jadi urutan DOM tetap rank 1,2,3 dan hanya tampilannya yang
 * digeser lewat CSS. Screen reader tetap membacanya berurutan.
 *
 * ⛔ Sejak butir 13 (27 Okt) ini HANYA tampilan Trader CONTOH di mode template (PnL per trader tak bisa dihitung,
 * cakupan 11%). Toggle Trader/Creator pindah ke rute; Creator = data nyata (`Creators.tsx`). Bagian ini selalu
 * berlabel SAMPLE dan tak pernah tampil di build flag-off.
 */
export function Leaderboard({
  podium,
  rows,
}: {
  podium: PodiumEntry[]
  rows: LeaderboardRow[]
}) {
  // ⬜ KERANGKA: follow disimpan lokal. PRODUK.md §2 — backend akun belum ada.
  const [following, setFollowing] = useStickyState<string[]>('synt.following', [])
  const toggleFollow = (id: string) =>
    setFollowing((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <div className="lb">
      <p className="lb-sample-note">
        <span className="dc-sample-tag">Sample</span> Example traders and made-up figures that show the planned layout.
        Trader profit can't be measured yet, so none of these numbers are real.
      </p>

      <div className="lb-podium">
        {podium.map((p) => <PodiumCard key={p.id} entry={p} />)}
      </div>

      <div className="lb-table" role="table" aria-label="Sample trader leaderboard">
        <div className="lb-head" role="row">
          <span role="columnheader">Rank</span>
          <span role="columnheader">Trader</span>
          <span role="columnheader" className="ta-r">Followers</span>
          <span role="columnheader" className="ta-r">Win Rate</span>
          <span role="columnheader" className="ta-r">Total Profit</span>
          <span role="columnheader" className="ta-r">Action</span>
        </div>

        <div role="rowgroup">
          {rows.map((r) => (
            <div key={r.id} className="lb-row" role="row">
              <span role="cell" className="lb-rank">{r.rank}</span>
              <span role="cell" className="lb-trader">
                <Avatar name={r.name} src={r.avatar} size={32} shape="circle" />
                {r.name}
              </span>
              <span role="cell" className="lb-num">{compact(r.followers)}</span>
              <span role="cell" className="lb-num">{r.winRate.toFixed(1)}%</span>
              <span role="cell" className="lb-num is-up">+{usd(r.totalProfit)}</span>
              <span role="cell" className="ta-r">
                <button
                  type="button"
                  className={`lb-follow ${following.includes(r.id) ? 'is-following' : ''}`}
                  aria-pressed={following.includes(r.id)}
                  onClick={() => toggleFollow(r.id)}
                >
                  {following.includes(r.id) ? 'Following' : 'Follow'}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PodiumCard({ entry: e }: { entry: PodiumEntry }) {
  return (
    <article className={`lb-card lb-card-${e.rank}`}>
      <header className="lb-card-head">
        <span className="lb-badge">RANK #{e.rank}</span>
        <span className="lb-time">{e.timeAgo}</span>
      </header>

      <div className="lb-card-id">
        <Avatar name={e.name} src={e.avatar} size={72} shape="circle" />
        <h2 className="lb-name">{e.name}</h2>
        <p className="lb-handle">{e.handle}</p>
      </div>

      <dl className="lb-stats">
        <div>
          <dt>Followers</dt>
          <dd>{compact(e.followers)}</dd>
        </div>
        <div>
          <dt>Impact Score</dt>
          <dd>{e.impactScore}</dd>
        </div>
        <div>
          <dt>Growth (24h)</dt>
          <dd className="is-up">{pct(e.growth24h)}</dd>
        </div>
      </dl>

      {e.spark.length > 1 && <Sparkline points={e.spark} />}
    </article>
  )
}

/**
 * Sparkline sederhana. Titik masuk ternormalisasi 0–1; y dibalik karena
 * sumbu SVG tumbuh ke bawah sedangkan nilai naik harus terlihat naik.
 */
function Sparkline({ points }: { points: number[] }) {
  const w = 100
  const h = 30
  const step = w / (points.length - 1)
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(h - p * h).toFixed(1)}`)
    .join(' ')

  return (
    <svg className="lb-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
