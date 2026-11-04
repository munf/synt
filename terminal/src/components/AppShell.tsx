import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom'
import { DevNotice } from './DevNotice'
import { Popover } from './Popover'
import { Drawer } from './Drawer'
import { MasukPanel } from '@/features/account/MasukPanel'
import { AkunProvider, useAkun, namaTampil } from '@/features/account/useAkun'
import { NotificationsPop } from '@/features/account/NotificationsPop'
import { MessagesPop } from '@/features/account/MessagesPop'
import { KotakProvider, useKotak } from '@/features/account/useKotak'
import type { Notification, Message } from '@/features/account/types'
import { Avatar } from './Avatar'
import { TradeLayer } from '@/features/trade/TradeLayer'
import { BUKA_MASUK } from '@/features/trade/TradePanel'
import { EngineBar } from '@/features/engine/EngineBar'
import { BnbEngineBar } from '@/features/engine/BnbEngineBar'
import { adaptEngine } from '@/features/engine/adapt'
import { api } from '@/api/client'
import { usePolling } from '@/lib/usePolling'
import './AppShell.css'

/**
 * Kerangka aplikasi: topbar + area konten. Mengikuti frame Figma
 * (topbar identik di keempat frame: 1:2, 3:2, 3:16, 64:1401).
 *
 * Tinggi 60px, logo kiri 56px, search 280px, tab nav di tengah, aksi kanan.
 * Angka-angka itu dari Figma; yang tidak dari Figma adalah keputusan
 * responsive — desain hanya punya satu ukuran (1440px), jadi perilaku di
 * layar sempit ditentukan di sini, bukan disalin.
 */
export function AppShell() {
  // Status akun dibaca SEKALI di sini; rute di dalam <Outlet /> memakainya lewat useAkun().
  return (
    <AkunProvider>
      <KotakProvider>
        <Kerangka />
      </KotakProvider>
    </AkunProvider>
  )
}

function Kerangka() {
  const navigate = useNavigate()
  const akun = useAkun()
  const masuk = akun.status === 'masuk' && akun.profil ? akun.profil : null
  const [pop, setPop] = useState<'messages' | 'notifications' | 'wallet' | null>(null)
  const [walletOpen, setWalletOpen] = useState(false)
  // tombol "Sign in to trade" (panel trading) membuka drawer masuk yang sama
  useEffect(() => {
    const buka = () => setWalletOpen(true)
    window.addEventListener(BUKA_MASUK, buka)
    return () => window.removeEventListener(BUKA_MASUK, buka)
  }, [])
  // ⭐ 1 Nov (tahap C): lonceng & pesan dari synt-akun; tamu = kosong + ajakan masuk (bukan data contoh)
  const kotak = useKotak()
  const { notifications, messages } = kotak
  const [query, setQuery] = useState('')

  const unreadNotif = kotak.unread.notifications
  const unreadMsg = kotak.unread.messages

  // ⭐ 4 Nov: ketiga popover (pesan, notifikasi, akun) dibuka di kedua build — backend synt-akun sudah ada.
  const toggle = (p: typeof pop) => setPop((cur) => (cur === p ? null : p))

  const openNotification = (n: Notification) => {
    kotak.tandai([n.id])
    setPop(null)
    if (n.href) navigate(n.href)
  }

  const openMessage = (m: Message) => {
    kotak.tandai([m.id])
    setPop(null)
    navigate('/messages')
  }

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // B1: state `cari` → Trenches membuka drawer search (bagian "All tokens"), tak hanya menyaring tabel
    if (query.trim()) navigate(`/trenches?q=${encodeURIComponent(query.trim())}`, { state: { cari: true } })
  }

  return (
    <div className="shell">
      <header className="shell-top">
        <NavLink to="/" className="shell-logo" aria-label="synt home">
          <LogoMark />
        </NavLink>

        <form className="shell-search" onSubmit={submitSearch} role="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search tokens"
            className="shell-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>

        <nav className="shell-nav" aria-label="Main navigation">
          {/* ⛔ Discovery & Leaderboard DIKUNCI sampai backend-nya siap.
              Keduanya masih memakai data contoh, dan angka contoh yang bisa
              dibuka membuat angka NYATA di Trenches ikut diragukan — itu
              risiko terbesar saat terminal dipakai untuk aplikasi pendanaan.

              ⚠️ Dibiarkan TERLIHAT, bukan dihapus: menyembunyikannya
              menyiratkan produk hanya punya satu halaman, padahal keduanya
              memang sedang dibangun. Yang dimatikan hanya kliknya. */}
          {/* ⭐ Discovery DIBUKA (lab 2026-10-20, preview 2026-10-21 atas keputusan
              pemilik): tempat agent synt menerbitkan postingan yang sudah
              disetujui di Approvals ops. */}
          <NavLink to="/discovery">Discovery</NavLink>
          <NavLink to="/trenches">Trenches</NavLink>
          {/* ⭐ Butir 13 (27 Okt): Leaderboard dibuka di kedua build — tampilan Creator nyata (B3). */}
          <NavLink to="/leaderboard">Leaderboard</NavLink>
        </nav>

        <div className="shell-actions">
          <div className="shell-pop-anchor">
            <button
              type="button"
              className="shell-icon-btn"
              aria-label={`Messages${unreadMsg ? `, ${unreadMsg} unread` : ''}`}
              title="Messages"
              onClick={() => toggle('messages')}
            >
              <MailIcon />
              {/* tahap C: titik hanya dari hitungan nyata synt-akun (dulu dicabut karena berasal dari mock) */}
              {unreadMsg > 0 && <span className="shell-dot" aria-hidden="true" />}
            </button>
            <Popover open={pop === 'messages'} onClose={() => setPop(null)} label="Messages">
              <MessagesPop
                items={messages}
                onOpen={openMessage}
                kosong={masuk ? 'No messages.' : 'Sign in to get messages from synt.'}
              />
            </Popover>
          </div>

          <div className="shell-pop-anchor">
            <button
              type="button"
              className="shell-icon-btn"
              aria-label={`Notifications${unreadNotif ? `, ${unreadNotif} unread` : ''}`}
              title="Notifications"
              onClick={() => toggle('notifications')}
            >
              <BellIcon />
              {unreadNotif > 0 && <span className="shell-dot" aria-hidden="true" />}
            </button>
            <Popover
              open={pop === 'notifications'}
              onClose={() => setPop(null)}
              label="Notifications"
            >
              <NotificationsPop
                items={notifications}
                onMarkAllRead={() => kotak.tandaiSemua('notifications')}
                kosong={
                  masuk
                    ? 'Nothing yet. Star tokens to get alerts when their score changes or their price moves 50%.'
                    : 'Sign in and star tokens to get alerts when their score changes or their price moves.'
                }
                onOpen={openNotification}
              />
            </Popover>
          </div>

          <div className="shell-pop-anchor">
            <button
              type="button"
              className="shell-wallet"
              title="Account"
              onClick={() => toggle('wallet')}
            >
              <Avatar name={masuk ? namaTampil(masuk) : 'synt'} src={null} size={32} shape="circle" />
              <span className="shell-wallet-label">{masuk ? namaTampil(masuk) : 'Sign in'}</span>
              {/* HP: lonceng & pesan tersembunyi → titik belum-dibaca pindah ke tombol akun */}
              {unreadNotif + unreadMsg > 0 && <span className="shell-dot shell-dot-hp" aria-hidden="true" />}
              <ChevronIcon />
            </button>

            <Popover open={pop === 'wallet'} onClose={() => setPop(null)} label="Account menu">
              <div className="pop-menu">
                {masuk && (
                  <Link to="/me" onClick={() => setPop(null)}>
                    <UserIcon /> My profile
                  </Link>
                )}
                {/* HP: ikon lonceng & pesan disembunyikan di header (≤ breakpoint) → jalannya lewat menu ini */}
                {masuk && (
                  <>
                    <Link to="/notifications" className="pop-menu-hp" onClick={() => setPop(null)}>
                      <BellIcon /> Notifications{unreadNotif > 0 && ` (${unreadNotif})`}
                    </Link>
                    <Link to="/messages" className="pop-menu-hp" onClick={() => setPop(null)}>
                      <MailIcon /> Messages{unreadMsg > 0 && ` (${unreadMsg})`}
                    </Link>
                  </>
                )}
                <Link to="/settings" onClick={() => setPop(null)}>
                  <GearIcon /> Settings
                </Link>
                <span className="pop-sep" />
                {masuk ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPop(null)
                      void akun.keluar()
                    }}
                  >
                    <WalletIcon /> Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPop(null)
                      setWalletOpen(true)
                    }}
                  >
                    <WalletIcon /> Sign in with wallet
                  </button>
                )}
              </div>
            </Popover>
          </div>
        </div>
      </header>

      <main className="shell-main">
        <Outlet />
        {/* ⭐ Pemberitahuan tahap pengembangan — muncul sekali per browser.
            Terminal dibuka publik sbg MVP; polling-vs-streaming dan halaman
            yang masih memakai data contoh HARUS dinyatakan di muka, karena
            angka contoh yang tak ditandai membuat angka NYATA ikut diragukan. */}
        <DevNotice />
      </main>

      {/* Pemicu = item "Connect wallet" di popover akun, yang hilang saat popover menutup → fokus kembali ke tombol akun. */}
      <Drawer open={walletOpen} title="Wallet" onClose={() => setWalletOpen(false)} kembaliKe=".shell-wallet">
        <MasukPanel onSelesai={() => setWalletOpen(false)} />
      </Drawer>

      {/* ⭐ Status mesin NYATA dari /api/overview — bukan mock.
          Footer ini menampilkan performa synt, bukan harga BTC/ETH: harga
          tersedia di mana pun dan tak berkata apa pun tentang produk ini,
          sedangkan throughput audit adalah bukti mesinnya bekerja SAAT INI. */}
      <EngineFooter />
      {/* 2 Nov: status transaksi & dialog tinjau trading — di atas semua halaman */}
      <TradeLayer />
    </div>
  )
}

/**
 * Tanda merek synt — glyph yang sama dengan `src/assets/logo.svg`,
 * `public/favicon.svg`, dan dashboard synt-dash.
 *
 * ⚠️ Digambar pada kanvas 531×558 milik aset aslinya; jangan disalin ulang
 * ke viewBox lain — proporsinya berubah dan mark-nya tak lagi cocok dengan
 * favicon di tab yang sama.
 */
function LogoMark() {
  return (
    <svg viewBox="0 0 531 558" width="22" height="22" aria-hidden="true">
      <path
        d="M289 150l30 30v92h44v76l-98 98-30-30v-92h-44v-76z"
        fill="currentColor"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 20 16" width="19" height="16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m1.8 2.2 8.2 6 8.2-6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 16 18" width="16" height="18" fill="none" aria-hidden="true">
      <path
        d="M8 1.5a5 5 0 0 0-5 5v3.2L1.8 12.5h12.4L13 9.7V6.5a5 5 0 0 0-5-5ZM6.2 15a1.9 1.9 0 0 0 3.6 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 10 6" width="9" height="6" fill="none" aria-hidden="true">
      <path d="m1 1 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.4" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.8 13.6a5.2 5.2 0 0 1 10.4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <rect x="1.8" y="3.8" width="12.4" height="8.6" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 8.2h1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Footer status mesin, dari data nyata.
 *
 * ⚠️ Polling 30 detik (bukan 15 seperti feed): angka di sini bergerak lambat
 * — throughput per jam dan uptime tak berubah berarti dalam 15 detik, jadi
 * memintanya lebih sering hanya menambah beban tanpa menampilkan apa pun.
 */
/** A3: footer sadar chain — Trenches `?chain=bnb` & halaman `/bnb/*` memakai statistik engine BNB. */
function EngineFooter() {
  const { pathname, search } = useLocation()
  const bnb = pathname.startsWith('/bnb/') || (pathname === '/trenches' && new URLSearchParams(search).get('chain') === 'bnb')
  return bnb ? <BnbEngineBar /> : <EngineBarLive />
}

function EngineBarLive() {
  // Mode template ikut data nyata sejak butir 3 AGEN-BUILD (2026-10-25); dulu fetch sengaja ditolak saat TEMPLATE.
  const { data, error } = usePolling((signal) => api.overview(signal), 30_000)
  // ⛔ Tanpa angka contoh (mock engine dihapus 2026-10-25): sebelum respons pertama / saat gagal → "—", bukan "live".
  return <EngineBar status={data ? adaptEngine(data) : null} gagal={error != null} />
}
