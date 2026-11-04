import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { TrenchRow } from './types'
import { alamatMint } from '@/lib/mint'
import { Avatar } from '@/components/Avatar'
import { alamatPendek, usd, pct, trendClass, umur } from '@/lib/format'
import type { SearchHit } from '@/api/types'
import { useGlobalSearch, Q_MAKS, type GlobalSearch } from './useGlobalSearch'
import './SidePanels.css'

/**
 * Pencarian token (butir 6 AGEN-BUILD).
 *
 * Dua bagian:
 * 1. "In this view": menyaring baris NYATA tampilan aktif (/api/trenches, maks 50); klik → panel kanan.
 * 2. ⭐ B1 (27 Okt) "All tokens": `/api/search` (synt-dash `cari.rs`) = setiap launch pump.fun yang terdeteksi mesin
 *    sejak `index.since`; klik → `/coin/:mint`. Token di luar indeks itu (non-pump.fun, atau sebelum `since`) tetap
 *    bisa dibuka lewat alamat → copy menyebut cakupan itu, bukan "all tokens on Solana".
 * ⭐ Input berupa alamat mint base58 yang sah → tawaran lompat ke `/coin/:mint` (halaman token menangani mint yang
 * tak dilacak / tak dikenal). Enter: alamat sah → lompat; selain itu → baris teratas tampilan ini, lalu hasil global
 * teratas. Esc ditangani Drawer (tutup + fokus kembali ke pemicu).
 */
export function SearchPanel({
  query,
  onQueryChange,
  results,
  onPick,
  viewLabel,
}: {
  query: string
  onQueryChange: (q: string) => void
  results: TrenchRow[]
  onPick: (mint: string) => void
  /** Nama tampilan aktif (mis. "New pairs") utk judul bagian pertama. */
  viewLabel: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const q = query.trim()
  const mint = alamatMint(q) ? q : null
  const global = useGlobalSearch(query)
  // Putaran 2: Enter sebelum debounce selesai (atau saat busy/galat) → cari segera, buka hasil teratas begitu jawaban
  // KUERI ITU tiba (bukan hasil kueri lama). Niat mencatat penghitung `jawaban` saat Enter: status yang sudah tampil
  // sebelum Enter (busy/error) tak dihitung; hanya jawaban SESUDAHNYA yang memutuskan (ok → buka, lain → pesan saja).
  // Ketikan lagi membatalkan niat itu. Nit sisa: penghitung & status dibaca dari ref sinkron `kini()` saat Enter.
  const [bukaSaatTiba, setBukaSaatTiba] = useState<{ q: string; jawaban: number } | null>(null)
  useEffect(() => {
    if (bukaSaatTiba === null) return
    if (bukaSaatTiba.q !== global.q) { setBukaSaatTiba(null); return }
    // `<=`, bukan `===`: niat bisa mencatat penghitung sinkron yang mendahului render (lihat `kini()`)
    if (global.jawaban <= bukaSaatTiba.jawaban) return // belum ada jawaban baru
    setBukaSaatTiba(null)
    const st = global.state
    if (st.status === 'ok' && st.q === bukaSaatTiba.q && st.data.results[0]) navigate(`/coin/${st.data.results[0].mint}`)
  }, [bukaSaatTiba, global.q, global.jawaban, global.state, navigate])

  // Fokus otomatis: panel ini dibuka justru untuk mengetik.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="sp">
      <div className="sp-search">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          className="sp-input sp-input-search"
          placeholder="Symbol, name, or contract address"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (mint) navigate(`/coin/${mint}`)
            else if (q && results[0]) onPick(results[0].mint)
            else if (q) {
              // baca jawaban terakhir SINKRON: Enter bisa jatuh di antara tibanya jawaban dan render berikutnya
              const kini = global.kini()
              const st = kini.state
              if (st.status === 'ok' && st.q === global.q) {
                if (st.data.results[0]) navigate(`/coin/${st.data.results[0].mint}`)
              } else if (global.segera()) {
                setBukaSaatTiba({ q: global.q, jawaban: kini.jawaban })
              }
            }
          }}
          aria-label="Search tokens"
        />
        {query && (
          <button
            type="button"
            className="sp-clear"
            onClick={() => {
              // tombol ini hilang begitu kueri kosong → fokus dipindah ke input, bukan jatuh ke BODY di dalam dialog
              onQueryChange('')
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {mint && (
        <Link to={`/coin/${mint}`} className="sp-item sp-jump">
          <span className="sp-item-main">
            <span className="sp-item-name">Open token page</span>
            <span className="sp-item-hint sp-jump-addr">{alamatPendek(mint)}</span>
          </span>
          <span className="sp-jump-key" aria-hidden="true">Enter</span>
        </Link>
      )}

      <section className="sp-sec" aria-label={`Matches in ${viewLabel}`}>
        <h3 className="sp-sec-title">In this view <span>{viewLabel}</span></h3>
        {results.length === 0 ? (
          <p className="sp-sec-note">
            {mint ? 'This address is not in the current view.' : 'No matches in this view.'}
          </p>
        ) : (
          <div className="sp-list">
            {results.slice(0, 20).map((r) => (
              <button
                key={r.mint}
                type="button"
                className="sp-item"
                onClick={() => onPick(r.mint)}
              >
                <Avatar name={r.symbol} src={r.avatar} size={30} />
                <span className="sp-item-main">
                  <span className="sp-item-name">{r.symbol}</span>
                  {r.handle && <span className="sp-item-hint">{r.handle}</span>}
                </span>
                <span className="sp-item-nums">
                  <span className="sp-item-mc">{r.marketCap === null ? '—' : usd(r.marketCap)}</span>
                  {r.marketCapChange !== null && (
                    <span className={trendClass(r.marketCapChange)}>
                      {pct(r.marketCapChange)}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {q && <GlobalSection q={q} state={global.state} onRetry={global.retry} />}
    </div>
  )
}

/** Tanggal pendek UTC ("9 Oct") utk awal cakupan indeks. */
function tglPendek(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const angka = (n: number) => n.toLocaleString('en-US')

/** Bagian "All tokens" (B1). Hanya identitas token: simbol, nama, mint pendek, umur sejak terdeteksi. */
function GlobalSection({ q, state, onRetry }: { q: string; state: GlobalSearch; onRetry: () => void }) {
  const data = state.status === 'ok' ? state.data : state.status === 'loading' ? state.stale : null
  const sejak = tglPendek(data?.index.since ?? null)
  const hits = data?.results ?? []

  let status: React.ReactNode = null
  if (state.status === 'idle') status = 'Type at least 2 characters to search all tokens.'
  else if (state.status === 'tooLong') status = `Search up to ${Q_MAKS} characters.`
  else if (state.status === 'indexLoading') status = 'Search index is loading, try again shortly.'
  else if (state.status === 'busy') status = (
    <>
      Search is busy, try again shortly.{' '}
      <button type="button" className="sp-retry" onClick={onRetry}>Retry</button>
    </>
  )
  else if (state.status === 'error') status = (
    <>
      Couldn't search all tokens right now.{' '}
      <button type="button" className="sp-retry" onClick={onRetry}>Retry</button>
    </>
  )
  else if (state.status === 'loading' && !data) status = 'Searching all tokens…'
  else if (state.status === 'ok' && hits.length === 0) {
    status = <>No token matches <strong>{q}</strong>.</>
  }

  return (
    <section className="sp-sec" aria-label="All tokens" aria-busy={state.status === 'loading'}>
      <h3 className="sp-sec-title">
        All tokens
        {state.status === 'loading' && data && <span>Searching…</span>}
      </h3>
      {status && <p className="sp-sec-note" role="status">{status}</p>}
      {hits.length > 0 && (
        <div className={`sp-list ${state.status === 'loading' ? 'is-stale' : ''}`}>
          {hits.map((h) => <GlobalHit key={h.mint} h={h} />)}
        </div>
      )}
      {data && data.total > hits.length && hits.length > 0 && (
        <p className="sp-sec-note">
          Showing {angka(hits.length)} of {angka(data.total)} matches, closest first. Type more to narrow it down.
        </p>
      )}
      <p className="sp-note">
        {data
          ? <>Covers {angka(data.index.coins)} pump.fun launches synt detected{sejak ? ` since ${sejak}` : ''}. </>
          : <>Covers pump.fun launches synt detected. </>}
        For any other token, paste its contract address.
      </p>
    </section>
  )
}

function GlobalHit({ h }: { h: SearchHit }) {
  return (
    <Link to={`/coin/${h.mint}`} className="sp-item sp-hit">
      <Avatar name={h.symbol || '?'} src={null} size={30} />
      <span className="sp-item-main">
        <span className="sp-item-name">{h.symbol || '—'}</span>
        {/* nama panjang yang dipotong, mint pendek selalu utuh */}
        <span className="sp-item-hint sp-hit-hint">
          {h.name && <span className="sp-hit-name">{h.name}</span>}
          {h.name && <span aria-hidden="true">·</span>}
          <span className="sp-hit-mint">{alamatPendek(h.mint)}</span>
        </span>
      </span>
      <span className="sp-item-nums">
        <span className="sp-item-mc" title={`Detected ${new Date(h.detected_at).toLocaleString()}`}>{umur(h.age_secs)} ago</span>
      </span>
    </Link>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
