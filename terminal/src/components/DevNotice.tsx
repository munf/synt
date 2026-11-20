import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './DevNotice.css'
import { TEMPLATE } from '@/lib/template'
import { resetStatusFeedBnb, useBnbCalibration, useStatusFeedBnb } from '@/features/bnb/useBnb'
import { hariKalibrasi } from '@/features/bnb/bnbFormat'

/**
 * Pemberitahuan tahap pengembangan.
 *
 * ⭐ Ada karena terminal ini akan dibuka publik sebagai MVP untuk aplikasi
 * pendanaan, dan dua hal HARUS dinyatakan di muka:
 *
 * 1. **Harga kini streaming, metrik lain menyusul berkala.** Sejak
 *    2026-09-24 harga & likuiditas datang dari satu langganan WSS
 *    (`programSubscribe`) lewat synt-stream, jadi ia bergerak tiap
 *    transaksi. Holder dan aktivitas transaksi tetap ditarik berkala lewat
 *    RPC karena WSS tak menyediakannya (jebakan #53).
 *
 *    ⚠️ Teks lama berbunyi "polled, not streamed, up to 15 seconds old" dan
 *    itu kini SALAH — menyatakan sistem lebih lambat daripada kenyataannya
 *    sama merugikannya dgn melebih-lebihkan.
 * 2. **Sebagian halaman belum tersambung.** Discovery & Leaderboard masih
 *    memakai data contoh — dan angka contoh yang tak ditandai akan membuat
 *    seluruh angka NYATA di halaman lain ikut diragukan.
 *
 * ⛔ USANG (8 Nov, pemilik): tak lagi tiap kunjungan — setelah "Got it" disembunyikan 24 jam (`SEMBUNYI_MS`).
 * ⭐ SELALU ditampilkan tiap kali terminal dibuka (keputusan pemilik proyek).
 * Sebelumnya sekali per browser lewat localStorage, dengan alasan
 * pemberitahuan berulang akan ditutup tanpa dibaca. Alasan itu kalah oleh
 * konteks pemakaian sekarang: preview.synt.fun dibuka publik untuk PITCHING,
 * dan tiap penonton baru harus melihat kualifikasinya — mana angka nyata,
 * mana data contoh. Penonton yang melewatkannya akan menganggap SELURUH
 * angka di layar sudah final.
 */

/**
 * ⭐ Butir 14c (keputusan orkestrator): pemberitahuan SADAR CHAIN. Halaman `/bnb/*` atau Trenches dgn chain BNB
 * tersimpan (`synt.trenches.chain`, state milik TrenchesRoute) memakai kalimat BNB; kalimat Solana di bawah TIDAK
 * diubah sama sekali (Solana dibekukan). Dibaca saat render: pemberitahuan ini modal di muka halaman, jadi chain
 * yang menentukan adalah chain saat halaman dibuka.
 */
function chainBnb(pathname: string, search = ''): boolean {
  if (pathname.startsWith('/bnb/')) return true
  if (pathname !== '/trenches') return false
  // A3: chain kini di URL (`/trenches?chain=bnb`); tersimpan hanya bila URL tak menyebutnya
  const c = new URLSearchParams(search).get('chain')
  if (c === 'bnb' || c === 'sol') return c === 'bnb'
  try {
    return JSON.parse(localStorage.getItem('synt.trenches.chain') ?? 'null') === 'bnb'
  } catch {
    return false
  }
}

/** 8 Nov (pemilik): di preview "Got it" menyembunyikan pil sehari, bukan hanya sampai muat ulang. */
const KUNCI_TUTUP = 'synt.notice.tutup'
const SEMBUNYI_MS = 24 * 60 * 60 * 1000

function baruDitutup(): boolean {
  try {
    const t = Number(localStorage.getItem(KUNCI_TUTUP))
    return t > 0 && Date.now() - t < SEMBUNYI_MS
  } catch {
    return false
  }
}

export function DevNotice() {
  const { pathname, search } = useLocation()
  const bnb = chainBnb(pathname, search)
  // mode template: cukup sekali per browser (localStorage); preview: sekali sehari setelah "Got it"
  const KUNCI = 'synt.template.notice'
  const [buka, setBuka] = useState(() => { if (!TEMPLATE) return !baruDitutup(); try { return localStorage.getItem(KUNCI) !== '1' } catch { return true } })
  // 7 Nov (pemilik): di preview pemberitahuan jadi kartu kecil di pojok, tak lagi modal yang menutupi terminal;
  // tampil tiap kunjungan (8 Nov: setelah "Got it" disembunyikan 24 jam). Butir rincian dilipat di balik "Details".
  // ⭐ U23 (audit 7 Nov, disetujui pemilik 8 Nov): kartu itu menutup baris terakhir tabel (MC, Buy) di 1440 dan ±25%
  // layar 390. Kini bawaannya PIL satu baris "synt is in early access · Details · Got it" tepat di atas footer engine,
  // di ruang yang dicadangkan untuknya (`--dn-h`, DevNotice.css) → tak menutup sel atau tombol Buy. "Details" membuka
  // kartu lengkap (pembuka + rincian, isi sama); "Hide details" kembali ke pil. "Got it" = sembunyi 24 jam.
  const [rinci, setRinci] = useState(false)

  const tutup = () => {
    try { localStorage.setItem(TEMPLATE ? KUNCI : KUNCI_TUTUP, TEMPLATE ? '1' : String(Date.now())) } catch { /* penyimpanan diblokir */ }
    setBuka(false)
  }

  if (!buka) return null

  // mode template (lab): pemberitahuan mana yang nyata & mana contoh (1b putaran 2: Trenches & halaman token; butir 3-5: footer, Discovery & post; X1: akun, profil, pesan, follow, watchlist, tiket & Buy/Sell nyata sejak 1-4 Nov)
  if (TEMPLATE) return (
    <div className="dn-backdrop" role="dialog" aria-modal="true" aria-labelledby="dn-title">
      <div className="dn-card">
        <h2 id="dn-title" className="dn-title">Terminal template</h2>
        <p className="dn-lead">
          This is the full template of the synt terminal. Every page is open so you can see the whole product and
          what is still to be built. Live data: Trenches and its token search, token pages, the engine footer, the
          Discovery posts and coin lists, and the creator leaderboard. Also real: wallet login and accounts, the wallet tracker and portfolio, profiles,
          messages and notifications, follow, watchlist sync, and support tickets. Buy and Sell send real
          transactions signed by your own wallet and move your own funds; synt never holds them. Still samples: the
          Discovery profile, wallet and leaderboard cards, the Traders tab, and post comments.
          The public terminal is preview.synt.fun.
        </p>
        <button type="button" className="dn-ok" onClick={tutup}>Got it</button>
      </div>
    </div>
  )

  // U23: pil satu baris (bawaan). Pembuka BNB (dgn permintaan kalibrasinya) baru dipasang saat kartu dibuka.
  if (!rinci) return (
    <aside className="dn-dock dn-dock--pil" aria-labelledby="dn-title">
      <div className="dn-pil">
        <h2 id="dn-title" className="dn-pil-t">synt is in early access</h2>
        <span className="dn-pil-sep" aria-hidden="true">·</span>
        <button type="button" className="dn-pil-rinci" aria-expanded={false} onClick={() => setRinci(true)}>
          Details
        </button>
        <button type="button" className="dn-pil-ok" onClick={tutup}>
          Got it
        </button>
      </div>
    </aside>
  )

  return (
    <aside className="dn-dock" aria-labelledby="dn-title">
      <div className="dn-card dn-card--dock">
        <h2 id="dn-title" className="dn-title">synt is in early access</h2>

        {bnb ? <PembukaBnb pathname={pathname} /> : (
        <p className="dn-lead">
          The audit engine is live and every score on this page is real. synt
          is still in development. The notes below say how fresh each figure is
          and what a score can and cannot tell you.
        </p>
        )}

        <ul className="dn-list" id="dn-rinci">
          {bnb ? (
          <li>
            <b>BNB prices are not streamed live.</b> Price, market cap and liquidity come from the latest trade
            or DEX pool price synt recorded. When that price is old, the page shows how old it is.
          </li>
          ) : (
          <li>
            <b>Prices stream live.</b> Price and liquidity come from a
            WebSocket subscription and move with each trade. Holder counts and
            transaction activity refresh on a short interval, so those figures
            can trail the price by a few seconds.
          </li>
          )}
          {bnb ? (
          <li>
            <b>Trenches, Discovery and Leaderboard are connected.</b> Discovery shows posts written by the synt agent
            and reviewed by the synt team before they go out. The leaderboard covers Solana (pump.fun) launches only.
          </li>
          ) : (
          <li>
            <b>Trenches, Discovery and Leaderboard are connected.</b> Discovery shows posts
            written by the synt agent and reviewed by the synt team before they
            go out. Leaderboard lists the wallets that launched the most tokens
            and how those launches turned out.
          </li>
          )}
          {bnb ? (
          <li>
            <b>Scores are a snapshot, not a guarantee.</b> BNB pairs are scored once at minute two for rug risk; the
            table shows how each score turned out over 90 minutes. Every score carries the share of tokens at that
            score that turned out to be rugs.
          </li>
          ) : (
          <li>
            <b>Scores are a snapshot, not a guarantee.</b> Each token is judged
            once inside its first ten minutes. Every score carries the share of
            tokens at that tier which rose, and the share that collapsed.
          </li>
          )}
        </ul>

        <div className="dn-aksi">
          <button type="button" className="dn-rinci" aria-expanded={true} aria-controls="dn-rinci" onClick={() => setRinci(false)}>
            Hide details
          </button>
          <button type="button" className="dn-ok" onClick={tutup}>
            Got it
          </button>
        </div>
      </div>
    </aside>
  )
}

/**
 * 14c putaran 2: pembuka varian BNB sendiri (pembuka Solana tak diubah). Skor nyata dari engine yang berjalan, tapi
 * provisional; versi & jumlah hari dari `/api/bnb/calibration` (tak di-hardcode). Komponen terpisah supaya permintaan
 * kalibrasi hanya ada selama pemberitahuan BNB terbuka (ditutup → dilepas, polling berhenti).
 */
/** 14e: tanpa jawaban feed pasti dalam waktu ini, pembuka tak ditahan lagi → kalimat aman "provisional" saja. */
const TUNGGU_FEED_MS = 4_000

function PembukaBnb({ pathname }: { pathname: string }) {
  const s = useBnbCalibration()
  // 14e: pembuka ikut status FEED/token (bukan hanya kalibrasi): kalibrasi tetap dilayani walau pool BNB mati, jadi
  // "real and come from the running engine" hanya boleh bila feed/token halaman ini benar-benar menjawab.
  const feed = useStatusFeedBnb()
  const [lewat, setLewat] = useState(false)
  // 14f: halaman berganti (back/forward) → status feed & batas tunggu dimulai ulang utk halaman baru
  const sebelumnya = useRef(pathname)
  useEffect(() => {
    if (sebelumnya.current !== pathname) {
      sebelumnya.current = pathname
      resetStatusFeedBnb()
    }
    setLewat(false)
    const t = setTimeout(() => setLewat(true), TUNGGU_FEED_MS)
    return () => clearTimeout(t)
  }, [pathname])
  const feedMenunggu = feed === 'menunggu' && !lewat
  // 14d (b): jangan berkedip — sebelum jawaban kalibrasi pertama (berhasil/gagal) tempatnya ditahan kosong
  // (teks TERSEMBUNYI seukuran kalimat terpanjang yang biasa tiba, hanya pengganjal tinggi supaya kartu tak melompat;
  // tak terbaca mata maupun pembaca layar, angkanya tak pernah tampil).
  if (s.kind === 'loading' || feedMenunggu) {
    return (
      <p className="dn-lead" aria-hidden="true" style={{ visibility: 'hidden' }}>
        BNB scores on this page are real and come from the running engine, but they are provisional: calibration
        bnb-sehat-v1 is based on 12 days of BNB data.
      </p>
    )
  }
  const cal = s.kind === 'live' || s.kind === 'contoh' ? s.data : null
  // 14d (a): kalibrasi tak terbaca → tanpa klaim apa pun selain status provisional
  if (!cal || feed !== 'ada') return <p className="dn-lead">BNB scores are provisional.</p>
  const hari = hariKalibrasi(cal)
  const dasar = `${cal.version ? `calibration ${cal.version}` : 'the current calibration'}${hari !== null ? ` is based on ${hari} ${hari === 1 ? 'day' : 'days'} of BNB data` : ''}`
  return (
    <p className="dn-lead">
      {/* 14d (c): provisional false → tanpa kualifikasi */}
      BNB scores on this page are real and come from the running engine
      {cal.provisional ? ', but they are provisional: ' : ': '}
      {dasar}.
    </p>
  )
}
