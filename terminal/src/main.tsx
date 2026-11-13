import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import ReactDOM from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom'

import './styles/base.css'
import './styles/urutan'
import './styles/kerangka.css'
import { AppShell } from './components/AppShell'
import { GalatRute } from './components/GalatRute'
import { NotFoundRoute } from './routes/NotFound'
import { impor, pasangPenjagaPotongan } from './lib/potongan'

/* ⭐ U1 (audit 7 Nov): rute dimuat MALAS (`React.lazy`). Dulu semua rute diimpor statis → satu berkas JS ±955 KB
   (288 KB gzip) di setiap halaman, termasuk klinecharts + Pro yang hanya dipakai chart halaman token. Kini berkas
   awal = kerangka (AppShell, footer engine, akun) + react; tiap rute (potongan sendiri, termasuk yang kecil spt
   Settings/Inbox) & pustaka chart menyusul sesuai kebutuhan. NotFound tetap statis (kecil).
   Galat unduh potongan: lihat `lib/potongan.tsx` (muat ulang sekali → impor menggantung; sisanya `GalatRute`). */
function malas<M>(muat: () => Promise<M>, pilih: (m: M) => ComponentType) {
  return lazy(() => impor(muat).then((m) => ({ default: pilih(m) })))
}
const FeedRoute = malas(() => import('./routes/Feed'), (m) => m.FeedRoute)
const TrenchesRoute = malas(() => import('./routes/Trenches'), (m) => m.TrenchesRoute)
const CoinRoute = malas(() => import('./routes/Coin'), (m) => m.CoinRoute)
const BnbTokenRoute = malas(() => import('./routes/BnbToken'), (m) => m.BnbTokenRoute)
const MyProfileRoute = malas(() => import('./routes/Profile'), (m) => m.MyProfileRoute)
const ProfileRoute = malas(() => import('./routes/Profile'), (m) => m.ProfileRoute)
const MessagesRoute = malas(() => import('./routes/Inbox'), (m) => m.MessagesRoute)
const NotificationsRoute = malas(() => import('./routes/Inbox'), (m) => m.NotificationsRoute)
const SettingsRoute = malas(() => import('./routes/Settings'), (m) => m.SettingsRoute)
const PostRoute = malas(() => import('./routes/Post'), (m) => m.PostRoute)
const WalletTrackerRoute = malas(() => import('./routes/Wallet'), (m) => m.WalletTrackerRoute)
const PortfolioRoute = malas(() => import('./routes/Wallet'), (m) => m.PortfolioRoute)
const LeaderboardRoute = malas(() => import('./routes/Leaderboard'), (m) => m.LeaderboardRoute)
const PrivacyRoute = malas(() => import('./routes/Legal'), (m) => m.PrivacyRoute)
const TermsRoute = malas(() => import('./routes/Legal'), (m) => m.TermsRoute)

/**
 * Selama potongan rute dimuat: kotak "Loading…" bergaya keadaan kosong Trenches (`.tr-empty`, sama dgn "Loading…"
 * halaman token tak dikenal), muncul setelah 300 ms supaya muat cepat (desktop, cache) tak berkedip. Topbar & footer
 * engine (fixed) tetap; kotak diganti isi rute di posisi yang sama → tak ada elemen yang bergeser (CLS 0).
 */
function RuteMemuat() {
  // U21: muat PERTAMA → isi kerangka statis index.html tetap tampil (bukan kotak kosong lalu "Loading…")
  const [awal] = useState(() => kerangkaAwal)
  if (awal) return <KerangkaAwal node={awal} />
  return <RuteMemuatBiasa />
}

function RuteMemuatBiasa() {
  const [tampil, setTampil] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setTampil(true), 300)
    return () => clearTimeout(t)
  }, [])
  return (
    <div role="status">
      {tampil ? <p className="tr-empty">Loading…</p> : <span className="sr-only">Loading page</span>}
    </div>
  )
}

/**
 * ⭐ U21 (audit 7 Nov): isi rute kerangka statis (index.html `[data-untuk]`, dipilih skrip <head> lewat
 * `html[data-rute]`) DIPINDAH utuh ke fallback rute pertama. React mengosongkan #root saat render pertama; tanpa ini
 * isi halaman sempat kosong / "Loading…" di antara kerangka statis dan skeleton rute (tabel Trenches, TokenSkeleton).
 * Node dipindah di layout effect (sebelum lukisan) → tak ada bingkai kosong. Dipakai SEKALI: setelah rute pertama
 * tampil, fallback kembali ke `RuteMemuatBiasa` (navigasi klien tak berubah).
 */
let kerangkaAwal: HTMLElement | null = (() => {
  const r = document.documentElement.getAttribute('data-rute')
  return r ? document.querySelector<HTMLElement>(`[data-kerangka] [data-untuk="${r}"]`) : null
})()

function KerangkaAwal({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.appendChild(node)
    return () => {
      node.remove()
      kerangkaAwal = null
    }
  }, [node])
  // role=status di elemen biasa (sr-only), bukan di pembungkus `display: contents` (tak selalu terbaca pembaca layar)
  return (
    <>
      <span className="sr-only" role="status">Loading page</span>
      <div ref={ref} style={{ display: 'contents' }} />
    </>
  )
}

function rute(C: ComponentType) {
  return (
    <Suspense fallback={<RuteMemuat />}>
      <C />
    </Suspense>
  )
}

pasangPenjagaPotongan()

/* ⛔ Pemilik 29 Okt: rute tanpa backend DIKUNCI di build biasa. ⭐ 4 Nov (pemilik, hackathon Encode): akun, profil,
   pesan, notifikasi, pengaturan, portfolio & trading kini punya backend (synt-akun) → dibuka di kedua build. */

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        // U1 putaran 2: galat rute (mis. potongan gagal diunduh) dirender DI DALAM shell, di tempat <Outlet />
        errorElement: <GalatRute />,
        children: [
          // ⭐ '/' → Trenches (keputusan pemilik proyek). Trenches adalah
          // SATU-SATUNYA halaman yang tersambung data nyata; Discovery &
          // Leaderboard masih data contoh dan sudah dimatikan di nav AppShell.
          // Mendaratkan pengunjung di Discovery berarti kesan pertama terminal
          // ini adalah angka contoh — persis yang dihindari DevNotice.
          { path: '/', element: <Navigate to="/trenches" replace /> },
          { path: '/discovery', element: rute(FeedRoute) },
          { path: '/trenches', element: rute(TrenchesRoute) },
          // ⛔ DITUTUP 2026-10-22 (keputusan pemilik): isinya data contoh (trader & profit fiktif) tanpa label, padahal nav
          // sudah terkunci "Coming soon". Rute dialihkan ke Trenches; buka lagi saat leaderboard punya data asli.
          // ⭐ Butir 13 (27 Okt): DIBUKA lagi di kedua build — leaderboard Creator kini data asli (B3). Flag mati = Creator saja,
          // tanpa trader/angka contoh (lihat routes/Leaderboard.tsx).
          { path: '/leaderboard', element: rute(LeaderboardRoute) },
          { path: '/coin/:mint', element: rute(CoinRoute) },
          // ⭐ Butir 14 (B11): halaman token BNB (BSC: Flap.sh + four.meme). Endpoint belum ada → keadaan kosong jujur.
          { path: '/bnb/:token', element: rute(BnbTokenRoute) },
          { path: '/me', element: rute(MyProfileRoute) },
          { path: '/profile/:handle', element: rute(ProfileRoute) },
          { path: '/messages', element: rute(MessagesRoute) },
          { path: '/notifications', element: rute(NotificationsRoute) },
          { path: '/settings', element: rute(SettingsRoute) },
          { path: '/post/:id', element: rute(PostRoute) },
          // ⭐ Butir 8 (B2): wallet tracker read-only NYATA di kedua build; `/wallet/:addr` = hasil satu alamat (bisa ditautkan).
          { path: '/wallet-tracker', element: rute(WalletTrackerRoute) },
          { path: '/wallet/:addr', element: rute(WalletTrackerRoute) },
          { path: '/portfolio', element: rute(PortfolioRoute) },
          // 1 Nov: Privacy & Terms (wajib sebelum akun dibuka publik); dibuka bersama akun 4 Nov.
          { path: '/privacy', element: rute(PrivacyRoute) },
          { path: '/terms', element: rute(TermsRoute) },
          { path: '*', element: <NotFoundRoute /> },
        ],
      },
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
