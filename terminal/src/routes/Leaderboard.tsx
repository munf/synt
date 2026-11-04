import { useStickyState } from '@/lib/useStickyState'
import { TEMPLATE } from '@/lib/template'
import { Leaderboard } from '@/features/leaderboard/Leaderboard'
import { CreatorsBoard } from '@/features/leaderboard/Creators'
import { mockPodium, mockLeaderboard } from '@/features/leaderboard/mock'
import '@/features/leaderboard/Leaderboard.css'
import '@/features/discovery/Discovery.css'

/**
 * Leaderboard — frame Figma 3:16.
 *
 * ⭐ Butir 13 (B3, 27 Okt): tampilan **Creators** NYATA (`/api/leaderboard/creators`) di KEDUA build.
 * ⛔ Trader/PnL tak bisa dihitung jujur (cakupan riwayat tx 11%) → build flag-off HANYA Creators (tanpa toggle,
 * tanpa podium/angka contoh); mode template menambah tab "Traders" yang seluruhnya berlabel SAMPLE dan tak pernah
 * tampil berdampingan dgn angka nyata (tab terpisah, default Creators).
 */
type Mode = 'creators' | 'traders'

export function LeaderboardRoute() {
  const [mode, setMode] = useStickyState<Mode>('synt.leaderboard.mode', 'creators')
  const aktif: Mode = TEMPLATE ? mode : 'creators'

  return (
    <section className="page">
      <div className="lb">
        <div className="lb-top">
          <h1 className="lb-title">{aktif === 'creators' ? 'Creator leaderboard' : 'Trader leaderboard'}</h1>
          {TEMPLATE && (
            <div className="lb-toggle" role="tablist" aria-label="Leaderboard type">
              {(['creators', 'traders'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={aktif === m}
                  className={aktif === m ? 'is-active' : ''}
                  onClick={() => setMode(m)}
                >
                  {m === 'creators' ? 'Creators' : 'Traders (sample)'}
                </button>
              ))}
            </div>
          )}
        </div>
        {aktif === 'creators'
          ? <CreatorsBoard />
          : <Leaderboard podium={mockPodium} rows={mockLeaderboard} />}
      </div>
    </section>
  )
}
