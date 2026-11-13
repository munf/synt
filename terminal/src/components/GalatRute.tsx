import { useRouteError } from 'react-router-dom'
import { galatPotongan } from '@/lib/potongan'

/**
 * U1 putaran 2: `errorElement` rute anak AppShell → galat rute tampil DI DALAM shell (topbar, nav & footer engine
 * tetap), bukan halaman galat bawaan React Router yang menggantikan seluruh aplikasi. Gaya = keadaan kosong Trenches
 * (`.tr-empty` + tombol `.ptb-clear`, sama dgn "Clear filters").
 */
export function GalatRute() {
  const galat = useRouteError()
  const potongan = galatPotongan(galat)
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  const teks = potongan
    ? offline
      ? 'This page could not be downloaded because you appear to be offline. Reconnect, then reload.'
      : 'Part of this page could not be downloaded. Reload to try again.'
    : 'This page ran into an error. Reload to try again.'
  return (
    <div className="tr-empty" role="alert">
      <p className="tr-empty-t">{teks}</p>
      <button type="button" className="ptb-clear" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  )
}
