import { useCallback, useSyncExternalStore } from 'react'
import { akunApi } from './akun'

/**
 * Watchlist & preferensi yang ikut akun (tahap B, 1 Nov).
 *
 * Satu penyimpanan bersama per jenis data (bukan useState per komponen): bintang di PairPanel
 * dan TokenView harus berubah bersamaan, dan data dari server harus sampai ke semua pemakai.
 *
 * Aturan sinkron:
 * - Tamu: localStorage saja, persis seperti sebelum ada akun.
 * - Masuk pertama kali di perangkat ini: watchlist lokal DIGABUNG ke akun (sekali), lalu
 *   server jadi sumber kebenaran. Tanpa penanda "sudah digabung", token yang dihapus di
 *   perangkat lain akan hidup lagi dari salinan lokal yang basi.
 * - Preferensi: akun kosong → perangkat mengunggah miliknya; akun berisi → server menang.
 * - Keluar / hapus akun: watchlist dibuang dari perangkat (perangkat bisa dipakai orang lain).
 *   Preferensi tampilan tetap; isinya bukan data pribadi.
 *
 * ⚠️ Kunci preferensi yang ikut akun = daftar putih synt-akun (`kunci_sah`): `synt.notif.*`,
 * `synt.display.*`, `synt.quickbuy.*`. Menambah awalan = ubah server DAN halaman Privacy.
 */

const KUNCI_WATCHLIST = 'synt.watchlist'
/** wallet yang watchlist lokalnya sudah digabung ke akun di perangkat ini */
const KUNCI_DIGABUNG = 'synt.watchlist.akun'
const AWALAN_PREFERENSI = ['synt.notif.', 'synt.display.', 'synt.quickbuy.']

function baca<T>(kunci: string, awal: T): T {
  try {
    const raw = localStorage.getItem(kunci)
    return raw === null ? awal : (JSON.parse(raw) as T)
  } catch {
    return awal
  }
}

function tulis(kunci: string, nilai: unknown) {
  try {
    if (nilai === undefined) localStorage.removeItem(kunci)
    else localStorage.setItem(kunci, JSON.stringify(nilai))
  } catch {
    /* localStorage bisa menolak (mode privat) — sesi ini tetap jalan */
  }
}

let akunAktif = false

// ── watchlist ───────────────────────────────────────────────────────────────

/** kontrak BNB disimpan huruf kecil oleh synt-akun → bandingkan dlm bentuk yang sama */
const norm = (m: string) => (/^0x/i.test(m) ? m.toLowerCase() : m)

let watchlist: string[] = baca<string[]>(KUNCI_WATCHLIST, []).filter((m) => typeof m === 'string').map(norm)
const pendengarWatchlist = new Set<() => void>()

function setWatchlist(baru: string[]) {
  watchlist = baru
  tulis(KUNCI_WATCHLIST, baru)
  pendengarWatchlist.forEach((f) => f())
}

export function useWatchlistBersama() {
  const mints = useSyncExternalStore(
    (f) => {
      pendengarWatchlist.add(f)
      return () => pendengarWatchlist.delete(f)
    },
    () => watchlist,
  )

  const has = useCallback((mint: string) => mints.includes(norm(mint)), [mints])

  const toggle = useCallback((asli: string) => {
    const mint = norm(asli)
    const ada = watchlist.includes(mint)
    setWatchlist(ada ? watchlist.filter((m) => m !== mint) : [...watchlist, mint])
    if (!akunAktif) return
    // optimistis: gagal di server = dikembalikan, supaya bintang tak berbohong soal apa yang tersimpan
    const kirim = ada ? akunApi.lepasPantau(mint) : akunApi.pantau(mint)
    kirim.catch(() => {
      setWatchlist(ada ? [...watchlist, mint] : watchlist.filter((m) => m !== mint))
    })
  }, [])

  return { mints, has, toggle }
}

// ── preferensi ──────────────────────────────────────────────────────────────

const preferensi = new Map<string, unknown>()
const pendengarPreferensi = new Set<() => void>()
let jedaSimpan: ReturnType<typeof setTimeout> | undefined

const ikutAkun = (k: string) => AWALAN_PREFERENSI.some((a) => k.startsWith(a))

/** semua preferensi ikut-akun yang tersimpan di perangkat ini (bukan hanya yang sudah dibaca komponen) */
function snapshotPreferensi(): Record<string, unknown> {
  const isi: Record<string, unknown> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && ikutAkun(k)) isi[k] = baca(k, null)
    }
  } catch {
    /* tanpa localStorage: kirim yang ada di memori saja */
  }
  preferensi.forEach((v, k) => (isi[k] = v))
  // server menolak SELURUH objek bila satu nilai tak sah (mis. input angka kosong → NaN → null)
  for (const [k, v] of Object.entries(isi)) {
    const sah =
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && [...v].length <= 32)
    if (!sah) delete isi[k]
  }
  return isi
}

function jadwalkanSimpan() {
  if (!akunAktif) return
  clearTimeout(jedaSimpan)
  // toggle beruntun & ketikan angka quick buy → satu PUT
  jedaSimpan = setTimeout(() => void akunApi.simpanPreferensi(snapshotPreferensi()).catch(() => undefined), 600)
}

export function usePreferensi<T>(kunci: string, awal: T) {
  const nilai = useSyncExternalStore(
    (f) => {
      pendengarPreferensi.add(f)
      return () => pendengarPreferensi.delete(f)
    },
    () => {
      if (!preferensi.has(kunci)) preferensi.set(kunci, baca(kunci, awal))
      return preferensi.get(kunci) as T
    },
  )

  const atur = useCallback(
    (v: T | ((lama: T) => T)) => {
      const lama = (preferensi.has(kunci) ? preferensi.get(kunci) : baca(kunci, awal)) as T
      const baru = typeof v === 'function' ? (v as (l: T) => T)(lama) : v
      preferensi.set(kunci, baru)
      tulis(kunci, baru)
      pendengarPreferensi.forEach((f) => f())
      if (ikutAkun(kunci)) jadwalkanSimpan()
    },
    // `awal` hanya dipakai saat kunci belum pernah dibaca
    [kunci],
  )

  return [nilai, atur] as const
}

// ── dipanggil AkunProvider ──────────────────────────────────────────────────

/** Setelah masuk (atau saat halaman dibuka dgn sesi aktif). */
export async function mulaiSinkron(wallet: string) {
  akunAktif = true
  const tugas: Promise<unknown>[] = []

  tugas.push(
    (baca<string | null>(KUNCI_DIGABUNG, null) === wallet ? akunApi.pantauan() : akunApi.gabungPantauan(watchlist)).then(
      (r) => {
        tulis(KUNCI_DIGABUNG, wallet)
        setWatchlist(r.tokens)
      },
    ),
  )

  tugas.push(
    akunApi.preferensi().then((r) => {
      if (r.data == null) return akunApi.simpanPreferensi(snapshotPreferensi())
      for (const [k, v] of Object.entries(r.data)) {
        if (!ikutAkun(k)) continue
        preferensi.set(k, v)
        tulis(k, v)
      }
      pendengarPreferensi.forEach((f) => f())
    }),
  )

  // gagal sinkron tak boleh merusak terminal: data lokal tetap dipakai
  await Promise.allSettled(tugas)
}

/** Keluar atau hapus akun. */
export function hentikanSinkron() {
  akunAktif = false
  clearTimeout(jedaSimpan)
  tulis(KUNCI_DIGABUNG, undefined)
  setWatchlist([])
}
