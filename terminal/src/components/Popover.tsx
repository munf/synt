import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Popover.css'

/**
 * Dropdown yang menempel pada pemicunya — untuk messages, notifications,
 * dan menu wallet di topbar.
 *
 * Berbeda dari Drawer: popover tidak modal. Ia menutup saat klik di luar
 * atau Escape, tapi tidak mengunci fokus — isinya pendek dan pengguna
 * sering hanya melirik lalu kembali bekerja.
 */
export function Popover({
  open,
  onClose,
  align = 'right',
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  align?: 'left' | 'right'
  label: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      // Klik pada pemicu ditangani pemicunya sendiri (toggle); tanpa
      // pengecualian ini, popover tertutup lalu langsung terbuka lagi.
      const t = e.target as Node
      if (ref.current && !ref.current.contains(t) && !(t as HTMLElement).closest?.('[data-popover-trigger]')) {
        onClose()
      }
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={ref} className={`pop pop-${align}`} role="dialog" aria-label={label}>
      {children}
    </div>
  )
}

/**
 * ⭐ Popover KETUK (A2, DESIGN-TERMINAL §2): pengganti `title` utk informasi yang penting dibaca, mis. alasan "—",
 * definisi outcome BNB, arti TREND. `title` tak pernah muncul di layar sentuh & tak terjangkau keyboard (audit
 * Trenches §3 no. 8, audit token §7).
 *
 * Buka: tap / klik / Enter / Spasi pada pemicu (sebuah <button>). Tutup: tap di luar, Esc (fokus kembali ke pemicu),
 * fokus pindah ke elemen lain (Tab), gulir, atau ubah ukuran.
 * A2b: `role="tooltip"` (bukan dialog): isinya hanya teks, fokus tak pernah masuk. A6: `aria-describedby` pemicu
 * menunjuk salinan tersembunyi yang selalu ada (bukan popover yang baru muncul setelah dibuka). Posisi `fixed` dihitung dari pemicu & dijepit ke viewport (16px dari tepi), jadi tak
 * pernah menimbulkan overflow horizontal di 390px dan lolos dari kontainer `overflow: hidden` (portal ke body).
 * ⚠️ Pemicu sering berada di dalam baris tabel yang bisa diklik: klik & tombol keyboard di pemicu/popover TIDAK
 * diteruskan ke baris (portal React tetap menggelembungkan event ke leluhur React-nya).
 */
export function InfoPopover({
  info,
  label,
  children,
  className = '',
}: {
  /** Isi popover (kalimat penjelasan). */
  info: React.ReactNode
  /** Nama singkat utk pembaca layar, mis. "Market cap". */
  label?: string
  /** Isi pemicu yang terlihat, mis. "—" atau chip. */
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; arrow: number; above: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const id = useId()
  const descId = `${id}-d`

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const width = Math.min(260, vw - 32)
    const left = Math.max(16, Math.min(r.left + r.width / 2 - width / 2, vw - 16 - width))
    const h = pop.current?.offsetHeight ?? 0
    const above = r.bottom + 8 + h > vh - 8 && r.top - 8 - h > 8
    setPos({ left, top: above ? r.top - 8 - h : r.bottom + 8, width, arrow: r.left + r.width / 2 - left, above })
  }, [open])

  useEffect(() => {
    if (!open) return
    const tutup = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (btn.current?.contains(t) || pop.current?.contains(t)) return
      setOpen(false)
    }
    // A2b: Tab / fokus pindah ke elemen lain menutup. Klik teks di dalam popover memindah fokus ke body (tanpa
    // focusin) → tetap terbuka; tutup oleh pointerdown di luar sudah ditangani `onDown`.
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Node
      // Safari/iOS: tombol tak menerima fokus saat diketuk → fokus jatuh ke leluhur ber-tabIndex (mis. baris
      // `.tt-row`) yang MEMUAT pemicu; jangan tutup di sini supaya ketuk ulang pemicu tetap menutup lewat onClick
      if (btn.current?.contains(t) || pop.current?.contains(t) || (btn.current && t.contains(btn.current))) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('focusin', onFocus)
    window.addEventListener('scroll', tutup, true)
    window.addEventListener('resize', tutup)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('focusin', onFocus)
      window.removeEventListener('scroll', tutup, true)
      window.removeEventListener('resize', tutup)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`ip-trigger ${className}`}
        aria-expanded={open}
        aria-describedby={descId}
        aria-label={label ? `${label}, more info` : undefined}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen((v) => !v)
        }}
        onKeyDown={(e) => {
          // ⚠️ stopPropagation (agar Enter tak memilih baris) juga menahan listener Esc di document → Esc ditangani di sini
          e.stopPropagation()
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        {children}
      </button>
      {/* A6 (nit Reviewer A2b): deskripsi PERMANEN utk pembaca layar. Pemicu selalu `aria-describedby` ke salinan
          tersembunyi ber-id stabil (elemen `hidden` tetap dipakai sbg deskripsi, tapi tak dibaca dua kali saat
          menelusuri halaman), jadi isi penjelasan terbaca saat fokus tanpa harus membuka popover dulu. */}
      <span id={descId} className="ip-desc" hidden>{info}</span>
      {open &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="tooltip"
            className={`ip-pop ${pos?.above ? 'is-above' : ''}`}
            style={pos ? { left: pos.left, top: pos.top, width: pos.width, ['--ip-arrow' as string]: `${pos.arrow}px` } : { visibility: 'hidden', left: 0, top: 0, width: 'min(260px, calc(100vw - 32px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {info}
          </div>,
          document.body,
        )}
    </>
  )
}
