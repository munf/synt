import { useRef } from 'react'
import { VIEWS, type TrenchView, type ViewDef } from './stages'
import './ViewBar.css'

/**
 * Pengganti rail di layar sempit (≤1100px) — butir 2m AGEN-BUILD, 2026-10-25.
 *
 * ⛔ Masalahnya: `SideRail.css` menyembunyikan seluruh `.rail` di ≤1100px, padahal rail memegang empat tombol
 * tampilan Trenches + tombol Search. Tanpa pengganti, pengguna ponsel/tablet terkunci pada tampilan yang tersimpan
 * di localStorage (default "new") dan tak bisa mencari sama sekali (search topbar juga hilang di ≤900px).
 *
 * ⭐ State-nya SAMA dgn rail (`view` / `onViewChange` dari TrenchesRoute → `synt.trenches.view`), jadi pilihan di
 * sini bertahan & ikut dipakai rail saat layar dilebarkan. Search membuka Drawer + SearchPanel yang sama.
 * Quick buy & wallet sengaja tidak dibawa ke sini (di luar wewenang agen).
 *
 * Aksesibilitas: pola radiogroup ARIA — hanya pilihan aktif yang masuk urutan Tab; panah kiri/kanan (atas/bawah)
 * memindah DAN memilih, Home/End ke ujung, sama seperti radio bawaan browser.
 */
export function ViewBar({
  view,
  onViewChange,
  query,
  onSearch,
  views = VIEWS,
  chain,
}: {
  view: TrenchView
  onViewChange: (v: TrenchView) => void
  /** Pencarian aktif — ditampilkan di tombol supaya jelas daftar sedang disaring. */
  query: string
  /** Butir 14: tanpa onSearch (chain BNB) tombol search tak dirender. */
  onSearch?: () => void
  /** Butir 14: tampilan yang tersedia (BNB = new & graduated). */
  views?: ViewDef[]
  /** Butir 14: pilihan chain (SOL | BNB) — di layar sempit ia di sini, sebelum panel & tabel. */
  chain?: React.ReactNode
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const pindah = (e: React.KeyboardEvent, i: number) => {
    const n = views.length
    let j: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = n - 1
    if (j === null) return
    e.preventDefault()
    onViewChange(views[j]!.id)
    refs.current[j]?.focus()
  }

  const q = query.trim()

  return (
    <div className={`tvb ${chain ? 'has-chain' : ''}`}>
      {chain}
      <div className="tvb-seg" role="radiogroup" aria-label="Token views">
        {views.map((v, i) => {
          const aktif = view === v.id
          return (
            <button
              key={v.id}
              ref={(el) => { refs.current[i] = el }}
              type="button"
              role="radio"
              aria-checked={aktif}
              tabIndex={aktif ? 0 : -1}
              className={`tvb-opt ${aktif ? 'is-active' : ''}`}
              title={`${v.label}: ${v.hint}`}
              onClick={() => onViewChange(v.id)}
              onKeyDown={(e) => pindah(e, i)}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      {onSearch && <button
        type="button"
        className={`tvb-search ${q ? 'is-active' : ''}`}
        onClick={onSearch}
        aria-haspopup="dialog"
        aria-label={q ? `Search tokens, filtering by ${q}` : 'Search tokens'}
        title="Search tokens"
      >
        <SearchIcon />
        {q && <span className="tvb-search-q">{q}</span>}
      </button>}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
