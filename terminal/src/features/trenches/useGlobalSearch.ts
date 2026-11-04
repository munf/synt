import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/api/client'
import type { SearchResponse } from '@/api/types'

/**
 * ⭐ B1 (27 Okt): pencarian global lewat synt-dash `/api/search` (indeks memori `cari.rs`, ±45 ms per permintaan).
 *
 * · Debounce 300 ms: kotak search mengetik per huruf; tanpa jeda tiap ketukan = satu permintaan.
 * · Permintaan basi DIBATALKAN (AbortController) dan jawabannya diabaikan, jadi hasil "pe" tak pernah menimpa "pepe".
 * · Kueri < 2 atau > 64 karakter tak dikirim (server menjawab 400); panjang dihitung per code point seperti server.
 * · 503 `{status:"loading"}` = indeks belum terbaca setelah restart → keadaan sendiri + coba lagi otomatis tiap 5 dtk.
 * · 429 `{status:"busy"}` (synt-dash membatasi 2 pindaian serentak, slot ditunggu 200 ms) = keadaan sementara, BUKAN
 *   "tak ada hasil": dicoba ulang SEKALI otomatis setelah 1,5 dtk; masih sibuk → "Search is busy…" + Retry (ketukan
 *   berikutnya juga mencoba lagi). 400 `{status:"bad_query"}` tak seharusnya terjadi (panjang dicek di sini) → galat.
 * · Data sebelumnya dipertahankan selama kueri baru dimuat (`stale`), supaya daftar tak berkedip tiap ketukan.
 * · Putaran 2: coba ulang 503 tak lagi berkedip ke "Searching…" (keadaan `indexLoading` dipertahankan sampai jawaban
 *   berikutnya). `segera()` (Enter) melewati sisa debounce; bila permintaan kueri yang sama sudah berjalan, tak dikirim
 *   ulang. `ok.q` = kueri yang DIKIRIM, supaya pemanggil tak membuka hasil kueri lama.
 * · Nit putaran 2: `jawaban` = penghitung jawaban yang sudah diterapkan (ok/busy/error/indexLoading). Pemanggil yang
 *   menunggu jawaban (Enter) mencatat nilainya saat itu dan hanya bertindak setelah nilainya naik, jadi status lama
 *   (mis. "busy" sebelum Enter) tak terbaca sebagai jawaban atas permintaan baru. `segera()` → true bila ada
 *   permintaan kueri ini yang akan/sedang dikirim.
 * · Nit sisa: jawaban dicatat juga di ref SINKRON (`kini()`), diperbarui di callback fetch bersamaan dengan setState.
 *   Antara callback fetch dan render berikutnya ada celah (render default-lane dijadwalkan scheduler); Enter di celah
 *   itu dulu membaca `jawaban`/`state` closure yang basi: niat tercatat dgn penghitung LAMA, lalu jawaban yang baru
 *   saja tiba (mis. busy dari permintaan sebelum Enter) dianggap jawaban atas Enter dan membatalkan niat.
 */
export const Q_MIN = 2
export const Q_MAKS = 64
const JEDA_MS = 300
const ULANG_503_MS = 5_000
const ULANG_429_MS = 1_500
export const HASIL = 20

export type GlobalSearch =
  | { status: 'idle' }
  | { status: 'tooLong' }
  | { status: 'loading'; stale: SearchResponse | null }
  | { status: 'ok'; q: string; data: SearchResponse }
  | { status: 'indexLoading' }
  | { status: 'busy' }
  | { status: 'error' }

export function useGlobalSearch(query: string): {
  state: GlobalSearch
  retry: () => void
  segera: () => boolean
  q: string
  jawaban: number
  /** Jawaban terakhir yang diterapkan, dibaca SINKRON (bisa mendahului render). */
  kini: () => { jawaban: number; state: GlobalSearch }
} {
  const q = query.trim()
  const n = [...q].length
  const [state, setState] = useState<GlobalSearch>({ status: 'idle' })
  const [ulang, setUlang] = useState(0)
  const [jawaban, setJawaban] = useState(0)
  // percobaan ulang otomatis 429 utk kueri ini (maks 1); direset saat kueri berubah
  const sibukRef = useRef<{ q: string; n: number }>({ q: '', n: 0 })
  // Enter: lewati debounce satu kali. `jalanRef` = kueri yang permintaannya sedang berjalan (sudah lewat debounce).
  const segeraRef = useRef(false)
  const jalanRef = useRef<string | null>(null)
  // salinan sinkron jawaban terakhir yang diterapkan (lihat nit sisa di atas)
  const kiniRef = useRef<{ jawaban: number; state: GlobalSearch }>({ jawaban: 0, state: { status: 'idle' } })
  const terap = (s: GlobalSearch): void => {
    kiniRef.current = { jawaban: kiniRef.current.jawaban + 1, state: s }
    setState(s)
    setJawaban((x) => x + 1)
  }

  useEffect(() => {
    // ref ikut status non-jawaban juga (tanpa menaikkan penghitung), supaya `kini().state` tak menyimpan ok kueri lama
    const atur = (s: GlobalSearch): void => { kiniRef.current = { jawaban: kiniRef.current.jawaban, state: s } }
    if (n < Q_MIN) { atur({ status: 'idle' }); setState({ status: 'idle' }); return }
    if (n > Q_MAKS) { atur({ status: 'tooLong' }); setState({ status: 'tooLong' }); return }

    if (kiniRef.current.state.status !== 'indexLoading') atur({ status: 'loading', stale: null })

    setState((s) => s.status === 'indexLoading'
      ? s
      : { status: 'loading', stale: s.status === 'ok' ? s.data : s.status === 'loading' ? s.stale : null })
    const ctl = new AbortController()
    let timer503: ReturnType<typeof setTimeout> | undefined
    const tunda = segeraRef.current ? 0 : JEDA_MS
    segeraRef.current = false
    const jeda = setTimeout(() => {
      jalanRef.current = q
      api.search(q, HASIL, ctl.signal)
        .then((data) => {
          if (ctl.signal.aborted) return
          jalanRef.current = null
          sibukRef.current = { q: '', n: 0 }
          terap({ status: 'ok', q, data })
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return
          jalanRef.current = null
          if (e instanceof ApiError && e.status === 503) {
            terap({ status: 'indexLoading' })
            timer503 = setTimeout(() => setUlang((x) => x + 1), ULANG_503_MS)
          } else if (e instanceof ApiError && e.status === 429) {
            if (sibukRef.current.q !== q) sibukRef.current = { q, n: 0 }
            if (sibukRef.current.n < 1) {
              sibukRef.current.n += 1
              timer503 = setTimeout(() => setUlang((x) => x + 1), ULANG_429_MS)
            } else {
              terap({ status: 'busy' })
            }
          } else {
            terap({ status: 'error' })
          }
        })
    }, tunda)
    return () => { ctl.abort(); clearTimeout(jeda); clearTimeout(timer503); jalanRef.current = null }
  }, [q, n, ulang])

  const segera = (): boolean => {
    if (n < Q_MIN || n > Q_MAKS) return false
    if (jalanRef.current === q) return true // sudah dikirim, tinggal menunggu jawaban
    const st = kiniRef.current.state
    if (st.status === 'ok' && st.q === q) return false
    segeraRef.current = true
    setUlang((x) => x + 1)
    return true
  }

  return { state, retry: () => setUlang((x) => x + 1), segera, q, jawaban, kini: () => kiniRef.current }
}
