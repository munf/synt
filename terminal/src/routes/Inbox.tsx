import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { MasukPanel } from '@/features/account/MasukPanel'
import { useAkun } from '@/features/account/useAkun'
import { useKotak } from '@/features/account/useKotak'
import '@/features/account/Account.css'

/**
 * Kotak pesan — `/messages` — dan semua notifikasi — `/notifications`.
 *
 * ⭐ 1 Nov (tahap C): data nyata dari synt-akun (`useKotak`). Pesan = pesan SISTEM dari synt saja
 * (keputusan pemilik: tanpa pesan antar-pengguna), jadi tak ada composer — dan memang tak boleh ada.
 */

function Tamu({ judul, ajakan }: { judul: string; ajakan: string }) {
  return (
    <section className="page">
      <div className="ac">
        <div className="ac-card">
          <h1 className="ac-section-title">{judul}</h1>
          <div className="ac-pad">
            <p className="ac-hint">{ajakan}</p>
            <MasukPanel />
          </div>
        </div>
      </div>
    </section>
  )
}

export function MessagesRoute() {
  const { status } = useAkun()
  const { messages, unread, tandai, tandaiSemua } = useKotak()
  const pindah = useNavigate()

  if (status === 'memuat') return <section className="page" />
  if (status !== 'masuk') return <Tamu judul="Messages" ajakan="Sign in to read messages from synt." />

  return (
    <section className="page">
      <div className="ac">
        <div className="ac-card">
          <div className="ac-section-title ac-title-row">
            <h1>Messages</h1>
            {unread.messages > 0 && (
              <button type="button" className="pop-action" onClick={() => tandaiSemua('messages')}>
                Mark all read
              </button>
            )}
          </div>

          {messages.length === 0 ? (
            <p className="ac-empty">No messages.</p>
          ) : (
            <ul className="ac-list">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`ac-row ${m.unread ? 'is-unread' : ''}`}
                    onClick={() => {
                      tandai([m.id])
                      if (m.href) pindah(m.href)
                    }}
                  >
                    <Avatar name="synt" src={m.avatar} size={40} shape="circle" />
                    <span className="ac-row-body">
                      <span className="ac-row-title">
                        {m.from}
                        {m.unread && <span className="ac-unread-dot" aria-label="Unread" />}
                      </span>
                      <span className="ac-row-text">{m.preview}</span>
                    </span>
                    <span className="ac-row-time">{m.timeAgo}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export function NotificationsRoute() {
  const { status } = useAkun()
  const { notifications, unread, tandai, tandaiSemua } = useKotak()
  const pindah = useNavigate()

  if (status === 'memuat') return <section className="page" />
  if (status !== 'masuk') {
    return (
      <Tamu
        judul="Notifications"
        ajakan="Sign in and star tokens to get alerts when their score changes or their price moves 50% or more."
      />
    )
  }

  return (
    <section className="page">
      <div className="ac">
        <div className="ac-card">
          <div className="ac-section-title ac-title-row">
            <h1>Notifications</h1>
            {unread.notifications > 0 && (
              <button type="button" className="pop-action" onClick={() => tandaiSemua('notifications')}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="ac-empty">
              Nothing yet. Star tokens to get alerts when their score changes or their price moves 50% or more.
            </p>
          ) : (
            <ul className="ac-list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`ac-row ${n.read ? '' : 'is-unread'}`}
                    onClick={() => {
                      tandai([n.id])
                      if (n.href) pindah(n.href)
                    }}
                  >
                    <span className="ac-row-body">
                      <span className="ac-row-title">
                        {n.title}
                        {!n.read && <span className="ac-unread-dot" aria-label="Unread" />}
                      </span>
                      <span className="ac-row-text">{n.text}</span>
                    </span>
                    <span className="ac-row-time">{n.timeAgo}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
