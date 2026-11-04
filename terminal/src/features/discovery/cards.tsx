import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { usd, compact, pct } from '@/lib/format'
import type { PollState } from '@/lib/usePolling'
import type { CoinBrief, WalletSummary, LeaderBrief } from './types'
import { mockMe } from '@/features/account/mock'
import { InfoPopover } from '@/components/Popover'

/** A6: label SAMPLE dgn penjelasan lewat popover ketuk (dulu `title`). Jangan dipakai di dalam <Link>/<button>. */
export function SampleTag({ info = 'Example data, not connected yet.' }: { info?: string }) {
  return (
    <InfoPopover info={info} label="Sample" className="chip-trigger">
      <span className="dc-sample-tag">Sample</span>
    </InfoPopover>
  )
}

/** Base rate ringkas: 1 desimal < 10% atau bila berdesimal (sama dgn Trenches `rate`). */
function persenBase(v: number): string {
  return v < 10 || !Number.isInteger(v) ? `${v.toFixed(1)}%` : `${v}%`
}

/**
 * Kartu-kartu ringkas Discovery.
 *
 * Semuanya sengaja DANGKAL. Discovery adalah ringkasan; begitu sebuah kartu
 * di sini mulai menampilkan metrik lengkap, ia mengambil alih pekerjaan
 * Trenches atau Leaderboard dan pemisahan konten runtuh. Setiap kartu
 * berakhir dengan tautan ke halaman yang benar-benar memiliki data itu.
 */

/** Ringkasan profil pengguna sendiri. Profil, wallet & leaderboard hanya tampil di mode template (contoh, butuh
    backend akun) → berlabel SAMPLE, sebab di sebelahnya kolom koin & feed kini NYATA. */
export function ProfileCard() {
  const me = mockMe
  return (
    <section className="dc-card dc-profile">
      <Link to="/me" className="dc-profile-id">
        <Avatar name={me.displayName} src={me.avatar} size={48} shape="circle" />
        <span className="dc-profile-names">
          <span className="dc-profile-name">{me.displayName} <span className="dc-sample-tag" title="Example data, not connected yet">Sample</span></span>
          <span className="dc-profile-handle">{me.handle}</span>
        </span>
      </Link>

      <dl className="dc-profile-stats">
        <div>
          <dd>{compact(me.stats.followers)}</dd>
          <dt>Followers</dt>
        </div>
        <div>
          <dd>{compact(me.stats.following)}</dd>
          <dt>Following</dt>
        </div>
        <div>
          <dd>{compact(me.stats.audits)}</dd>
          <dt>Audits</dt>
        </div>
      </dl>
    </section>
  )
}

/**
 * Daftar koin ringkas — dipakai "Newly audited" dan "Trending".
 *
 * ⭐ Skor selalu ditampilkan. Tanpa itu, kartu ini identik dengan daftar
 * token di terminal mana pun; skor adalah alasan token ini muncul di synt.
 */
export function CoinList({
  title,
  poll,
  href,
  showAge,
}: {
  title: string
  /** Data hidup /api/trenches — lihat routes/Feed.tsx. */
  poll: PollState<CoinBrief[]>
  href: string
  showAge?: boolean
}) {
  const items = poll.data ?? []
  return (
    <section className="dc-card dc-coins">
      <header className="dc-card-head">
        <h2 className="dc-card-title">{title}</h2>
        <Link to={href} className="dc-card-more">All</Link>
      </header>

      {/* ⛔ Galat/kosong ditulis apa adanya — bukan diganti angka contoh. */}
      {poll.loading && !poll.data ? (
        <p className="dc-coin-note">Loading…</p>
      ) : poll.error && !poll.data ? (
        <p className="dc-coin-note">Couldn't load audited pairs. Retrying.</p>
      ) : items.length === 0 ? (
        <p className="dc-coin-note">No audited pairs in this window yet.</p>
      ) : (
      <ul className="dc-coin-list">
        {items.map((c) => (
          <li key={c.mint}>
            <Link to={`/coin/${c.mint}`} className="dc-coin">
              <Avatar name={c.symbol} src={c.avatar} size={28} />
              <span className="dc-coin-id">
                <span className="dc-coin-symbol">{c.symbol}</span>
                <span className="dc-coin-mc">
                  {c.marketCap != null ? usd(c.marketCap) : '—'}
                  {showAge && c.age && <> · {c.age}</>}
                </span>
              </span>
              {/* A6: base rate TERLIHAT di samping skor (dulu hanya di `title` pil; PRODUK.md §0 "skor selalu disertai
                  base rate"). Hanya angka runtuh supaya kartu tetap simbol · skor · MC. */}
              <span className="dc-coin-score">
                <ScorePill value={c.score} />
                {c.collapseRatePct != null && <span className="dc-coin-base">{persenBase(c.collapseRatePct)} collapsed</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      )}
    </section>
  )
}

/**
 * Skor sebagai pil.
 *
 * Warna mengikuti tingkat, tapi TIDAK memakai lime penuh untuk skor tinggi —
 * lime dicadangkan untuk aksen yang jarang. Di daftar 4 baris, empat pil
 * lime terang akan berteriak.
 */
export function ScorePill({
  value,
}: {
  value: number
  /** Base rate skor ini (PRODUK.md §0). A6: tak lagi di `title`; pemakai menulisnya terlihat di samping pil. */
  rug?: number | null
  rose?: number | null
}) {
  const tone = value >= 65 ? 'is-high' : value >= 45 ? 'is-mid' : 'is-low'
  // A6: tanpa `title`; base rate ditulis TERLIHAT oleh pemakai (CoinList: "x% collapsed", post agent: "At this score…")
  return (
    <span className={`dc-score ${tone}`}>
      {value}
    </span>
  )
}

/**
 * Performa wallet 7 hari.
 *
 * ⚠️ Ini nilai portofolio harian, BUKAN PnL per-trade — yang itu butuh
 * riwayat transaksi penuh dan belum bisa dihitung (PRODUK.md §3, cakupan
 * 11%). Saat tak ada aktivitas, grafiknya datar; itu representasi jujur,
 * bukan kegagalan render.
 */
export function WalletCard({ wallet }: { wallet: WalletSummary }) {
  if (!wallet.connected) {
    return (
      <section className="dc-card dc-wallet">
        <h2 className="dc-card-title">Your wallet</h2>
        <p className="dc-wallet-empty">
          Connect a wallet to track your positions and their audit scores.
        </p>
        <button type="button" className="dc-wallet-connect">Connect wallet</button>
      </section>
    )
  }

  return (
    <section className="dc-card dc-wallet">
      <header className="dc-card-head">
        <h2 className="dc-card-title">Your wallet <SampleTag /></h2>
        <span className={`dc-wallet-change ${wallet.change7d >= 0 ? 'is-up' : 'is-down'}`}>
          {pct(wallet.change7d)}
        </span>
      </header>

      <p className="dc-wallet-total">{usd(wallet.totalUsd)}</p>
      <p className="dc-wallet-label">7-day value</p>

      <Sparkline points={wallet.points} flat={wallet.change7d === 0} />

      <ul className="dc-holdings">
        {wallet.holdings.map((h) => (
          <li key={h.symbol}>
            <span className="dc-holding-sym">{h.symbol}</span>
            <span className="dc-holding-val">{usd(h.valueUsd)}</span>
            {h.score !== undefined ? (
              <ScorePill value={h.score} />
            ) : (
              <span className="dc-score is-none" title="Not audited">n/a</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Grafik garis 7 hari. Datar saat tak ada perubahan — bukan bug. */
function Sparkline({
  points,
  flat,
}: {
  points: { day: string; value: number }[]
  flat?: boolean
}) {
  if (points.length < 2) return null

  const w = 100
  const h = 34
  const vals = points.map((p) => p.value)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  // Rentang nol (portofolio tidak bergerak) akan membagi nol; gambar garis
  // tengah datar sebagai gantinya.
  const span = hi - lo || 1
  const mid = h / 2

  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w
      const y = flat || hi === lo ? mid : h - ((p.value - lo) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="dc-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} className={flat ? 'is-flat' : ''} />
    </svg>
  )
}

/** Ringkasan leaderboard. */
export function LeaderCard({ items }: { items: LeaderBrief[] }) {
  return (
    <section className="dc-card dc-leaders">
      <header className="dc-card-head">
        <h2 className="dc-card-title">Leaderboard <SampleTag /></h2>
        <Link to="/leaderboard" className="dc-card-more">All</Link>
      </header>

      <ul className="dc-leader-list">
        {items.map((l) => (
          <li key={l.id}>
            <Link to={`/profile/${l.id}`} className="dc-leader">
              <span className={`dc-leader-rank ${l.rank <= 3 ? 'is-top' : ''}`}>
                {l.rank}
              </span>
              <Avatar name={l.name} src={l.avatar} size={26} shape="circle" />
              <span className="dc-leader-name">{l.name}</span>
              <span className="dc-leader-metric" title={l.metricLabel}>
                {l.metricValue}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
