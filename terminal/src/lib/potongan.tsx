import { Component, type ReactNode } from 'react'

/* ─────────────────────────────────────────────────────────────────────────
   U1 putaran 2 (Reviewer 7 Nov): potongan JS yang dimuat malas (rute, chart) BISA gagal diunduh — deploy baru
   menghapus nama ber-hash lama, jaringan putus/flaky. Tiga lapis:
   1. `pasangPenjagaPotongan`: `vite:preloadError` → muat ulang halaman SEKALI (index.html baru = nama potongan baru).
      Tidak saat offline (muat ulang = halaman offline browser, lebih buruk) dan tidak lagi dlm 60 dtk (tanpa putaran).
   2. `impor`: selama muat ulang berjalan, impor yang galatnya sudah "ditangani" (Vite lalu me-resolve `undefined`)
      dibiarkan MENGGANTUNG → Suspense tetap menampilkan fallback sampai halaman berganti; tak ada TypeError dan
      halaman galat tak sempat berkedip.
   3. `BatasGalat`: galat yang tetap lolos (offline, gagal kedua kalinya) ditangkap di tempat — rute → keadaan galat
      di dalam shell (`GalatRute`), chart → `ChartGagal` (skor, base rate & panel trade tetap tampil).
   ───────────────────────────────────────────────────────────────────────── */

const KUNCI = 'synt.muatUlangPotongan'
let sedangMuatUlang = false

export function pasangPenjagaPotongan() {
  window.addEventListener('vite:preloadError', (e) => {
    if (sedangMuatUlang) {
      e.preventDefault()
      return
    }
    if (!navigator.onLine) return
    try {
      const terakhir = Number(sessionStorage.getItem(KUNCI) ?? 0)
      if (Date.now() - terakhir < 60_000) return
      sessionStorage.setItem(KUNCI, String(Date.now()))
    } catch {
      return
    }
    sedangMuatUlang = true
    e.preventDefault()
    window.location.reload()
  })
}

/** Impor dinamis yang menggantung (tak pernah selesai) bila halaman sedang dimuat ulang karena potongan gagal. */
export function impor<M>(muat: () => Promise<M>): Promise<M> {
  return muat().then((m) => (sedangMuatUlang || m === undefined ? new Promise<M>(() => {}) : m))
}

/** Galat karena potongan JS/CSS tak terunduh (Chrome, Firefox, Safari, CSS Vite). */
export function galatPotongan(e: unknown): boolean {
  const pesan = e instanceof Error ? e.message : String(e ?? '')
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(pesan)
}

/** Batas galat sederhana: anak melempar saat render → `cadangan`. */
export class BatasGalat extends Component<{ cadangan: ReactNode; children: ReactNode }, { galat: boolean }> {
  state = { galat: false }
  static getDerivedStateFromError() {
    return { galat: true }
  }
  render() {
    return this.state.galat ? this.props.cadangan : this.props.children
  }
}
