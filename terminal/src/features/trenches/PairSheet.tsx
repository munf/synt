import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './PairSheet.css'

/**
 * ⭐ A3 (DESIGN §3.1): wadah panel Trenches di ponsel (≤ 560px): bottom sheet, snap 60% / 95% (ketuk pegangan atau
 * tarik ke atas), tarik ke bawah utk tutup. R1: hanya sheet (561-1100 kini panel di atas tabel, seperti preview).
 * Modal: Esc / ketuk latar / tombol tutup menutup, fokus masuk saat dibuka & kembali ke baris saat ditutup,
 * Tab terkurung di dalam. Tanpa animasi pegas: geser masuk 160ms (dimatikan prefers-reduced-motion di base.css).
 */
export function PairSheet({ open, label, onClose, children }: {
  open: boolean
  /** Nama dialog utk pembaca layar (simbol token). */
  label: string
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const kembali = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [tinggi, setTinggi] = useState<'mid' | 'full'>('mid')
  const [tarik, setTarik] = useState(0)
  const awal = useRef<{ y: number; t: number } | null>(null)

  useLayoutEffect(() => {
    if (open) {
      kembali.current = document.activeElement as HTMLElement
      setTinggi('mid')
      setTarik(0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Popover ketuk yang SEDANG terbuka menutup dirinya sendiri dulu (Esc pertama); tanpa popover → tutup sheet.
        // ⚠️ Fase capture: pemicu InfoPopover menahan semua keydown (stopPropagation), jadi listener bubble tak
        // pernah menerima Esc saat fokus ada di pemicu (Reviewer A3 putaran 1).
        if (document.querySelector('[role="tooltip"].ip-pop')) return
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
      if (!f.length) return
      const first = f[0]!, last = f[f.length - 1]!
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const t = kembali.current
      kembali.current = null
      if (t && t.isConnected && t !== document.body) t.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  /* Tarik pegangan: ke bawah > 96px (atau sentil cepat) menutup; ke atas membuka 95% */
  const mulai = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.psh-close')) return
    awal.current = { y: e.clientY, t: Date.now() }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const gerak = (e: React.PointerEvent) => {
    if (!awal.current) return
    setTarik(e.clientY - awal.current.y)
  }
  const lepas = (e: React.PointerEvent) => {
    if (!awal.current) return
    const dy = e.clientY - awal.current.y
    const cepat = Date.now() - awal.current.t < 250
    awal.current = null
    setTarik(0)
    if (Math.abs(dy) < 6) {
      setTinggi((h) => (h === 'mid' ? 'full' : 'mid'))
      return
    }
    if (dy > 96 || (cepat && dy > 32)) {
      if (tinggi === 'full' && dy < 240 && !cepat) setTinggi('mid')
      else onCloseRef.current()
    } else if (dy < -48) setTinggi('full')
  }

  return (
    <div className="psh-root psh-sheet">
      <div className="psh-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`psh psh-${tinggi} ${tarik ? 'is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={tarik > 0 ? { transform: `translateY(${tarik}px)` } : undefined}
      >
        <div className="psh-bar" onPointerDown={mulai} onPointerMove={gerak} onPointerUp={lepas} onPointerCancel={lepas}>
          <button
            type="button"
            className="psh-grip"
            aria-label={tinggi === 'mid' ? 'Expand details' : 'Shrink details'}
            onClick={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setTinggi((h) => (h === 'mid' ? 'full' : 'mid'))
              }
            }}
          />
          <button type="button" className="psh-close" onClick={onClose} aria-label="Close details">
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="psh-body">{children}</div>
      </div>
    </div>
  )
}
