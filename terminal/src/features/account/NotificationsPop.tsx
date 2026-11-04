import { Link } from 'react-router-dom'
import type { Notification } from './types'

/**
 * Isi popover notifikasi.
 *
 * Ikon dibedakan per `kind` — pada terminal trading, "audit berubah" dan
 * "ada follower baru" punya urgensi yang sangat berbeda, dan warna adalah
 * cara tercepat membedakannya tanpa membaca.
 */
export function NotificationsPop({
  items,
  onMarkAllRead,
  onOpen,
  kosong = 'Nothing yet.',
}: {
  items: Notification[]
  onMarkAllRead: () => void
  onOpen: (n: Notification) => void
  /** teks saat daftar kosong (tamu vs sudah masuk tanpa notifikasi) */
  kosong?: string
}) {
  const unread = items.filter((n) => !n.read).length

  return (
    <>
      <header className="pop-head">
        <h2 className="pop-title">Notifications{unread > 0 && ` (${unread})`}</h2>
        {unread > 0 && (
          <button type="button" className="pop-action" onClick={onMarkAllRead}>
            Mark all read
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <p className="pop-empty">{kosong}</p>
      ) : (
        <ul className="pop-list">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`pop-item ${n.read ? '' : 'is-unread'}`}
                onClick={() => onOpen(n)}
              >
                <KindIcon kind={n.kind} />
                <span className="pop-item-body">
                  <span className="pop-item-title">{n.title}</span>
                  <span className="pop-item-text">{n.text}</span>
                </span>
                <span className="pop-item-time">{n.timeAgo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="pop-foot">
        <Link to="/notifications">View all</Link>
      </div>
    </>
  )
}

function KindIcon({ kind }: { kind: Notification['kind'] }) {
  const color = {
    audit: 'var(--accent)',
    price: 'var(--warn)',
    social: 'var(--info)',
    system: 'var(--mute)',
  }[kind]

  const path = {
    audit: 'M8 1.8 13.5 4v4.2c0 3.2-2.3 5-5.5 6-3.2-1-5.5-2.8-5.5-6V4L8 1.8Z',
    price: 'm2.5 11.5 3.8-3.8 2.4 2.4 4.8-4.8',
    social: 'M8 8a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 8 8Zm-4.8 5.4a4.8 4.8 0 0 1 9.6 0',
    system: 'M8 5.2v3.4M8 11v.1M8 1.8 14.2 13H1.8L8 1.8Z',
  }[kind]

  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true" style={{ color, marginTop: 2, flexShrink: 0 }}>
      <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
