import { useEffect, useLayoutEffect, useRef } from 'react'
import './Drawer.css'

/**
 * Panel samping untuk aksi yang tak layak memakan seluruh layar
 * (search, quick buy, wallet).
 *
 * Yang ditangani di sini, karena mudah terlupakan dan membuat panel terasa
 * rusak kalau tidak ada:
 *   · Escape menutup
 *   · fokus pindah ke panel saat terbuka, kembali ke pemicu saat tertutup
 *   · klik latar menutup
 *   · Tab tidak bisa keluar dari panel selagi terbuka
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  kembaliKe,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Selektor cadangan utk fokus saat ditutup bila pemicu sudah hilang dari DOM (mis. item popover yang menutup
      dirinya ketika drawer dibuka). Tanpa ini fokus jatuh ke BODY. */
  kembaliKe?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Elemen yang memicu pembukaan — fokus dikembalikan ke sini saat ditutup,
  // supaya pengguna keyboard tidak terlempar ke awal halaman.
  const returnTo = useRef<HTMLElement | null>(null)
  /* ⛔ 2m putaran 2: `onClose` disimpan di ref, effect HANYA bergantung `open`. Dulu deps `[open, onClose]` + pemanggil
     yang mengirim fungsi inline → tiap render (tiap ketukan di kotak pencarian, tiap polling 5 dtk) effect berjalan
     ulang: `panelRef.focus()` mencuri fokus dari input (di ponsel: "ab" jadi "a" & keyboard menutup), dan cleanup-nya
     menyimpan `returnTo` = elemen di DALAM drawer → saat ditutup fokus jatuh ke BODY, bukan ke pemicu. */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const kembaliKeRef = useRef(kembaliKe)
  kembaliKeRef.current = kembaliKe

  // Pemicu dicatat di layout effect: ia berjalan SEBELUM effect biasa anak (mis. SearchPanel memfokus input-nya),
  // jadi yang tersimpan benar-benar tombol pemicu, bukan input di dalam drawer.
  useLayoutEffect(() => {
    if (open) returnTo.current = document.activeElement as HTMLElement
  }, [open])

  useEffect(() => {
    if (!open) return

    // Anak yang sudah memfokus dirinya (input pencarian) tak direbut fokusnya.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    const onClose = () => onCloseRef.current()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Kurung fokus di dalam panel selama terbuka.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables?.length) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      // pemicu bisa sudah hilang dari DOM (mis. tampilan berganti) → jangan memfokus elemen yatim
      const t = returnTo.current
      returnTo.current = null
      // BODY bukan pemicu: item popover yang membuka drawer sudah dilepas sebelum layout effect berjalan
      if (t && t.isConnected && t !== document.body) t.focus()
      else if (kembaliKeRef.current) document.querySelector<HTMLElement>(kembaliKeRef.current)?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="drawer-root">
      {/* Latar: klik menutup. aria-hidden karena tombol tutup sungguhan ada
          di dalam panel — ini hanya jalan pintas dengan mouse. */}
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="drawer-head">
          <h2 className="drawer-title">{title}</h2>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="drawer-body">{children}</div>
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
