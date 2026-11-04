import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import type { Message } from './types'

/** Isi popover pesan. */
export function MessagesPop({
  items,
  onOpen,
  kosong = 'No messages.',
}: {
  items: Message[]
  onOpen: (m: Message) => void
  kosong?: string
}) {
  const unread = items.filter((m) => m.unread).length

  return (
    <>
      <header className="pop-head">
        <h2 className="pop-title">Messages{unread > 0 && ` (${unread})`}</h2>
        <Link to="/messages" className="pop-action">Open inbox</Link>
      </header>

      {items.length === 0 ? (
        <p className="pop-empty">{kosong}</p>
      ) : (
        <ul className="pop-list">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={`pop-item ${m.unread ? 'is-unread' : ''}`}
                onClick={() => onOpen(m)}
              >
                <Avatar name="synt" src={m.avatar} size={32} shape="circle" />
                <span className="pop-item-body">
                  <span className="pop-item-title">{m.from}</span>
                  <span className="pop-item-text">{m.preview}</span>
                </span>
                <span className="pop-item-time">{m.timeAgo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
