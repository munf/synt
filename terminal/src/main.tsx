import React from 'react'
import ReactDOM from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'

import './styles/base.css'
import { AppShell } from './components/AppShell'
import { FeedRoute } from './routes/Feed'
import { TrenchesRoute } from './routes/Trenches'
import { CoinRoute } from './routes/Coin'
import { MyProfileRoute, ProfileRoute } from './routes/Profile'
import { MessagesRoute, NotificationsRoute } from './routes/Inbox'
import { SettingsRoute } from './routes/Settings'
import { PostRoute } from './routes/Post'
import { WalletTrackerRoute, PortfolioRoute } from './routes/Wallet'
import { NotFoundRoute } from './routes/NotFound'
import { LeaderboardRoute } from './routes/Leaderboard'
import { BnbTokenRoute } from './routes/BnbToken'
import { PrivacyRoute, TermsRoute } from './routes/Legal'

/* ⛔ Pemilik 29 Okt: rute tanpa backend DIKUNCI di build biasa. ⭐ 4 Nov (pemilik, hackathon Encode): akun, profil,
   pesan, notifikasi, pengaturan, portfolio & trading kini punya backend (synt-akun) → dibuka di kedua build. */

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      // ⭐ '/' → Trenches (keputusan pemilik proyek). Trenches adalah
      // SATU-SATUNYA halaman yang tersambung data nyata; Discovery &
      // Leaderboard masih data contoh dan sudah dimatikan di nav AppShell.
      // Mendaratkan pengunjung di Discovery berarti kesan pertama terminal
      // ini adalah angka contoh — persis yang dihindari DevNotice.
      { path: '/', element: <Navigate to="/trenches" replace /> },
      { path: '/discovery', element: <FeedRoute /> },
      { path: '/trenches', element: <TrenchesRoute /> },
      // ⛔ DITUTUP 2026-10-22 (keputusan pemilik): isinya data contoh (trader & profit fiktif) tanpa label, padahal nav
      // sudah terkunci "Coming soon". Rute dialihkan ke Trenches; buka lagi saat leaderboard punya data asli.
      // ⭐ Butir 13 (27 Okt): DIBUKA lagi di kedua build — leaderboard Creator kini data asli (B3). Flag mati = Creator saja,
      // tanpa trader/angka contoh (lihat routes/Leaderboard.tsx).
      { path: '/leaderboard', element: <LeaderboardRoute /> },
      { path: '/coin/:mint', element: <CoinRoute /> },
      // ⭐ Butir 14 (B11): halaman token BNB (BSC: Flap.sh + four.meme). Endpoint belum ada → keadaan kosong jujur.
      { path: '/bnb/:token', element: <BnbTokenRoute /> },
      { path: '/me', element: <MyProfileRoute /> },
      { path: '/profile/:handle', element: <ProfileRoute /> },
      { path: '/messages', element: <MessagesRoute /> },
      { path: '/notifications', element: <NotificationsRoute /> },
      { path: '/settings', element: <SettingsRoute /> },
      { path: '/post/:id', element: <PostRoute /> },
      // ⭐ Butir 8 (B2): wallet tracker read-only NYATA di kedua build; `/wallet/:addr` = hasil satu alamat (bisa ditautkan).
      { path: '/wallet-tracker', element: <WalletTrackerRoute /> },
      { path: '/wallet/:addr', element: <WalletTrackerRoute /> },
      { path: '/portfolio', element: <PortfolioRoute /> },
      // 1 Nov: Privacy & Terms (wajib sebelum akun dibuka publik); dibuka bersama akun 4 Nov.
      { path: '/privacy', element: <PrivacyRoute /> },
      { path: '/terms', element: <TermsRoute /> },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
])

const root = document.getElementById('root')
if (!root) throw new Error('#root tidak ditemukan')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
