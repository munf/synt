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

export function DevNotice() {
  const { pathname, search } = useLocation()
  const bnb = chainBnb(pathname, search)
  // mode template: cukup sekali per browser (localStorage); preview tetap seperti semula
  const KUNCI = 'synt.template.notice'
  const [buka, setBuka] = useState(() => { if (!TEMPLATE) return true; try { return localStorage.getItem(KUNCI) !== '1' } catch { return true } })

  const tutup = () => { if (TEMPLATE) { try { localStorage.setItem(KUNCI, '1') } catch { /* penyimpanan diblokir */ } } setBuka(false) }

  if (!buka) return null

  // mode template (lab): pemberitahuan mana yang nyata & mana contoh (1b putaran 2: Trenches & halaman token; butir 3-5: footer, Discovery & post)
  if (TEMPLATE) return (
    <div className="dn-backdrop" role="dialog" aria-modal="true" aria-labelledby="dn-title">
      <div className="dn-card">
        <h2 id="dn-title" className="dn-title">Terminal template</h2>
        <p className="dn-lead">
          This is the full template of the synt terminal. Every page is open so you can see the whole product and
          what is still to be built. Trenches and its token search, token pages, the engine footer, the Discovery posts and coin lists, and the creator leaderboard show live data. Everything else is a sample.
          The public terminal is preview.synt.fun.
        </p>
        <button type="button" className="dn-ok" onClick={tutup}>Got it</button>
      </div>
    </div>
  )

  return (
    <div className="dn-backdrop" role="dialog" aria-modal="true" aria-labelledby="dn-title">
      <div className="dn-card">
        <h2 id="dn-title" className="dn-title">synt is in early access</h2>

        {bnb ? <PembukaBnb pathname={pathname} /> : (
        <p className="dn-lead">
          The audit engine is live and every score on this page is real. Two
          things are not finished yet, and you should know which is which.
        </p>
        )}

        <ul className="dn-list">
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

        <button type="button" className="dn-ok" onClick={tutup}>
          Got it
        </button>
      </div>
    </div>
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
