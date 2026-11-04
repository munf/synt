import { labelSort, tulisSort, bacaSort, type FilterDef, type FilterId, type Sort, type SortKey } from './pairSort'
import './PairToolbar.css'

/**
 * ⭐ A6 (DESIGN-TERMINAL §3.1, bar di atas tabel): chip filter · jumlah tampil ("12 of 30") · Sort ringkas.
 * R1: chip langsung di sebelah keterangan chain ("Solana, pump.fun launches"), gaya segmen ChainSwitch preview.
 * Sort ringkas hanya di ≤900 (`showSort`): di layar lebar kepala kolom sendiri yang menyortir.
 * Jumlah TIDAK aria-live: feed hidup berubah tiap 5 dtk, pengumuman berulang akan membanjiri pembaca layar.
 */
export function PairToolbar({
  total,
  shown,
  filters,
  active,
  onToggle,
  query,
  unknownTax,
  sort,
  sortKeys,
  onSort,
  showSort,
}: {
  /** Jumlah pair tampilan ini sebelum saringan teks & chip. */
  total: number
  shown: number
  filters: FilterDef[]
  active: FilterId[]
  onToggle: (id: FilterId) => void
  /** Saringan teks `?q=` yang ikut menyaring. */
  query: string
  /** "Tax ≤ 5%" aktif: berapa pair dibuang karena pajaknya tak terukur (jujur: tak diketahui ≠ rendah). */
  unknownTax: number
  sort: Sort
  sortKeys: SortKey[]
  onSort: (s: Sort) => void
  showSort: boolean
}) {
  const q = query.trim()
  const tersaring = q !== '' || active.length > 0
  const pilihan = sortKeys.flatMap((k) => (['desc', 'asc'] as const).map((d) => ({ v: `${k}-${d}`, label: labelSort(k, d) })))

  return (
    <div className="ptb">
      {filters.length > 0 && (
        <div className="ptb-chips" role="group" aria-label="Filters">
          {filters.map((f) => {
            const on = active.includes(f.id)
            return (
              <button key={f.id} type="button" className={`ptb-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => onToggle(f.id)}>
                {on && <span className="ptb-chip-x" aria-hidden="true">✓</span>}
                {f.label}
              </button>
            )
          })}
        </div>
      )}

      <p className="ptb-count t-num-sm">
        {tersaring ? (
          <>
            <b>{shown}</b> of {total}
          </>
        ) : (
          <>
            <b>{total}</b> {total === 1 ? 'pair' : 'pairs'}
          </>
        )}
        {q && <span className="ptb-q"> matching “{q}”</span>}
        {unknownTax > 0 && (
          <span className="ptb-note"> · {unknownTax} with unknown tax left out</span>
        )}
      </p>

      {showSort && (
        <label className="ptb-sort">
          <span className="ptb-sort-l">Sort</span>
          <select
            className="ptb-select"
            value={tulisSort(sort) ?? ''}
            onChange={(e) => onSort(bacaSort(e.target.value || null, sortKeys))}
          >
            <option value="">Default order</option>
            {pilihan.map((p) => (
              <option key={p.v} value={p.v}>{p.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
