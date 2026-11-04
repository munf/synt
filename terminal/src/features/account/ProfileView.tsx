import { Avatar } from '@/components/Avatar'
import { compact } from '@/lib/format'
import { Metric } from '@/components/Metric'
import type { Profile } from './types'
import './Account.css'

/**
 * Tampilan profil — dipakai `/me` maupun `/profile/:handle`.
 *
 * Satu komponen untuk keduanya karena isinya sama; yang berbeda hanya aksi
 * di kanan atas (Edit vs Follow). Memisahkannya jadi dua komponen berarti
 * dua tempat yang harus diperbarui setiap kali profil bertambah field.
 */
export function ProfileView({
  profile,
  isMe,
  following,
  onToggleFollow,
  onEdit,
}: {
  profile: Profile
  isMe: boolean
  following?: boolean
  onToggleFollow?: () => void
  onEdit?: () => void
}) {
  const s = profile.stats

  return (
    <div className="ac">
      <section className="ac-card ac-profile">
        <div className="ac-cover" aria-hidden="true" />

        <div className="ac-profile-head">
          <Avatar name={profile.displayName} src={profile.avatar} size={88} shape="circle" />

          <div className="ac-profile-actions">
            {isMe ? (
              <button type="button" className="ac-btn" onClick={onEdit}>
                Edit profile
              </button>
            ) : onToggleFollow ? (
              <button
                type="button"
                className={`ac-btn ${following ? '' : 'is-primary'}`}
                aria-pressed={following}
                onClick={onToggleFollow}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="ac-identity">
          <h1 className="ac-name">
            {profile.displayName}
            {profile.verified && <VerifiedMark />}
          </h1>
          <p className="ac-handle">{profile.handle}</p>
          {profile.bio && <p className="ac-bio">{profile.bio}</p>}

          <p className="ac-meta">
            <span>{profile.joined}</span>
            {profile.walletShort && (
              <>
                <span className="ac-dot">·</span>
                <span className="ac-wallet">{profile.walletShort}</span>
              </>
            )}
          </p>
        </div>

        {s && (
        <div className="ac-stats">
          <Metric variant="count" className="ac-stat" label="Followers" value={compact(s.followers)} />
          <Metric variant="count" className="ac-stat" label="Following" value={compact(s.following)} />
          {s.posts != null && <Metric variant="count" className="ac-stat" label="Posts" value={compact(s.posts)} />}
          {s.audits != null && (
            <Metric variant="count" className="ac-stat" label="Audits read" value={compact(s.audits)} />
          )}
        </div>
        )}
      </section>

      <section className="ac-card">
        <h2 className="ac-section-title">Activity</h2>
        <p className="ac-empty">
          Posts and audit history will appear here.
        </p>
      </section>
    </div>
  )
}

/* A2: `Stat` lokal dihapus → komponen bersama `@/components/Metric` (varian `count`). */

function VerifiedMark() {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" aria-label="Verified" role="img">
      <path
        d="M8 1.2 9.9 3l2.6-.2.5 2.5 2.2 1.4-1.3 2.3 1.3 2.3-2.2 1.4-.5 2.5-2.6-.2L8 16.4 6.1 14.6l-2.6.2-.5-2.5L.8 10.9l1.3-2.3L.8 6.3 3 4.9l.5-2.5L6.1 3 8 1.2Z"
        fill="var(--info)"
        transform="scale(0.92) translate(0.7 -0.5)"
      />
      <path
        d="m5.4 8.1 1.8 1.8 3.5-3.8"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
