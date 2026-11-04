import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { compact } from '@/lib/format'
import type { Creator } from './types'

/**
 * Kartu profil ringkas — muncul saat nama/avatar creator diklik.
 *
 * Ada supaya pengguna bisa memeriksa siapa yang bicara tanpa meninggalkan
 * feed. "More info" barulah yang membawa ke halaman profil penuh; itu
 * memisahkan "lihat sekilas" dari "pelajari" dan menjaga alur baca tetap
 * utuh.
 */
export function CreatorCard({
  creator,
  following,
  onToggleFollow,
  onClose,
}: {
  creator: Creator
  following: boolean
  onToggleFollow: () => void
  onClose: () => void
}) {
  return (
    <div className="cc">
      <div className="cc-head">
        <Avatar name={creator.name} src={creator.avatar} size={52} shape="circle" />

        <button
          type="button"
          className={`cc-follow ${following ? 'is-following' : ''}`}
          aria-pressed={following}
          onClick={onToggleFollow}
        >
          {following ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="cc-id">
        <span className="cc-name">
          {creator.name}
          {creator.verified && <VerifiedMark />}
        </span>
        {creator.handle && <span className="cc-handle">{creator.handle}</span>}
      </div>

      {creator.bio && <p className="cc-bio">{creator.bio}</p>}

      <dl className="cc-stats">
        {creator.followers !== undefined && (
          <div>
            <dd>{compact(creator.followers)}</dd>
            <dt>Followers</dt>
          </div>
        )}
        {creator.tokensLaunched !== undefined && (
          <div>
            <dd>{creator.tokensLaunched}</dd>
            <dt>{creator.tokensLaunched === 1 ? 'Token' : 'Tokens'}</dt>
          </div>
        )}
      </dl>

      <Link to={`/profile/${creator.id}`} className="cc-more" onClick={onClose}>
        More info
        <ArrowIcon />
      </Link>
    </div>
  )
}

function VerifiedMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-label="Verified creator" role="img">
      <circle cx="8" cy="8" r="7" fill="var(--info)" />
      <path
        d="m5 8.2 2 2 4-4.4"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true">
      <path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
