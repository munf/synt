import { useEffect, useRef, useSyncExternalStore } from 'react'
import { api, ApiError } from '@/api/client'
import type { BnbCalibrationResponse, BnbTokenDetail, BnbTrenchesResponse } from '@/api/types'
import { usePolling } from '@/lib/usePolling'
import { TEMPLATE } from '@/lib/template'
import { contohKalibrasi, contohToken, contohTrenches } from './mock'

/**
 * ⭐ Sumber data BNB (butir 14, B11) — SATU tempat yang memutuskan nyata / contoh / kosong.
 *
 * | jawaban endpoint (synt-dash `bnb.rs`) | build biasa | mode template |
 * |---|---|---|
 * | 200 | nyata | nyata (panel tersambung tampil nyata juga di template) |
 * | 503 `loading` (sebelum hitungan pertama) | `loading` → "Loading…" (bukan "Cannot reach") | sama |
 * | 404 tanpa badan / bukan JSON (rute belum ada), 503 `bnb_unavailable` | `missing` `unavailable` → "BNB data is not available yet" | contoh berlabel |
 * | 404 `not_found`, 400 `bad_address` | `missing` `not_found` → token tak direkam | contoh bila alamat contoh |
 * | galat lain (503 `unavailable`, jaringan) | `error` → "Cannot reach…" | contoh berlabel |
 *
 * ⛔ Build biasa TIDAK PERNAH jatuh ke contoh. Data nyata yang sudah pernah tiba dipertahankan saat galat (`stale`).
 * ⚠️ Setelah `missing` permintaan berikutnya ditahan 60 dtk (galat yang sama dilempar ulang tanpa jaringan), supaya
 * tab terbuka tak menembak synt-dash tiap 5 dtk selama BNB belum aktif.
 */
export type BnbSumber<T> =
  | { kind: 'loading' }
  | { kind: 'live'; data: T; stale: boolean; /** A5: epoch ms jawaban sukses terakhir */ at: number | null }
  | { kind: 'contoh'; data: T }
  | { kind: 'missing'; reason: 'unavailable' | 'not_found' }
  | { kind: 'error' }

const JEDA_404_MS = 60_000

/** Arti galat BNB; null = galat biasa (tak terjangkau). */
function golongan(e: unknown): 'loading' | 'unavailable' | 'not_found' | null {
  if (!(e instanceof ApiError)) return null
  if (e.status === 503 && e.detail === 'loading') return 'loading'
  if (e.status === 503 && e.detail === 'bnb_unavailable') return 'unavailable'
  if (e.status === 404 && e.detail === 'not_found') return 'not_found'
  if (e.status === 400 && e.detail === 'bad_address') return 'not_found'
  // 404 tanpa badan JSON = rute belum ada; 200 berbadan bukan JSON = fallback HTML synt-dash utk path tak dikenal
  if (e.status === 404 || (e.status === 200 && e.message === 'Respons bukan JSON')) return 'unavailable'
  return null
}

function hilang(e: unknown): boolean {
  const g = golongan(e)
  return g === 'unavailable' || g === 'not_found'
}

/** Galat yang membawa kunci permintaannya — galat tampilan lama tak boleh dibaca sbg galat tampilan baru. */
class GalatKunci extends Error {
  constructor(readonly kunci: string, readonly asal: unknown) {
    super(asal instanceof Error ? asal.message : String(asal))
    this.name = asal instanceof Error && asal.name === 'AbortError' ? 'AbortError' : 'GalatKunci'
  }
}

/**
 * ⛔ Putaran 2 (Reviewer): data & galat DITANDAI kuncinya (pola Trenches SOL `{view, res}`). `usePolling` tak
 * mengosongkan state saat kunci berganti, jadi tanpa tanda ini baris tampilan New sempat tampil di bawah tab
 * Graduated sampai jawaban baru tiba.
 * `contoh` = null di build biasa (pemanggil menulis `TEMPLATE ? … : null`) → `mock.ts` terbuang dari bundle.
 */
function useSumber<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  kunci: string,
  contoh: (() => T | null) | null,
): BnbSumber<T> {
  const tahan = useRef<{ kunci: string; sampai: number; err: unknown } | null>(null)
  const poll = usePolling<{ kunci: string; data: T }>(async (signal) => {
    const t = tahan.current
    if (t && t.kunci === kunci && Date.now() < t.sampai) throw new GalatKunci(kunci, t.err)
    try {
      return { kunci, data: await fetcher(signal) }
    } catch (e) {
      if (hilang(e)) tahan.current = { kunci, sampai: Date.now() + JEDA_404_MS, err: e }
      throw new GalatKunci(kunci, e)
    }
  }, intervalMs, kunci)

  const data = poll.data?.kunci === kunci ? poll.data.data : null
  const err = poll.error instanceof GalatKunci && poll.error.kunci === kunci ? poll.error.asal : null
  if (data !== null) return { kind: 'live', data, stale: err !== null, at: poll.at }
  if (err === null) return { kind: 'loading' }
  const g = golongan(err)
  if (g === 'loading') return { kind: 'loading' }
  const c = contoh ? contoh() : null
  if (c) return { kind: 'contoh', data: c }
  if (g === 'unavailable' || g === 'not_found') return { kind: 'missing', reason: g }
  return { kind: 'error' }
}

export type BnbView = 'new' | 'graduated'

/* ── 14e: status feed BNB utk DevNotice, TANPA permintaan tambahan ─────────────────────────────────────────────
   Feed (`/api/bnb/trenches`) & token (`/api/bnb/token`) yang SUDAH dipoll halaman melaporkan statusnya ke penyimpan
   modul ini; DevNotice (AppShell) membacanya lewat useSyncExternalStore. `ada` = endpoint menjawab data (termasuk
   404 `not_found`: feed hidup, token saja yang tak direkam); `tidak` = 503 `bnb_unavailable` / 404 tanpa badan /
   galat; `contoh` = data contoh (mode template); `menunggu` = belum ada jawaban pasti. */
export type StatusFeedBnb = 'menunggu' | 'ada' | 'tidak' | 'contoh'
let statusFeed: StatusFeedBnb = 'menunggu'
const pendengar = new Set<() => void>()

function laporStatus<T>(s: BnbSumber<T>) {
  const baru: StatusFeedBnb | null =
    s.kind === 'live' ? 'ada'
      : s.kind === 'contoh' ? 'contoh'
        : s.kind === 'missing' ? (s.reason === 'not_found' ? 'ada' : 'tidak')
          : s.kind === 'error' ? 'tidak'
            : null // loading: status terakhir dipertahankan
  if (baru !== null) setelStatus(baru)
}

function setelStatus(baru: StatusFeedBnb) {
  if (baru === statusFeed) return
  statusFeed = baru
  pendengar.forEach((f) => f())
}

/**
 * 14f: kembali ke `menunggu` — dipanggil saat pelapor unmount dan saat pathname berganti (DevNotice), supaya
 * setelah back/forward pembuka tak sempat menampilkan status halaman LAMA sebelum feed halaman baru menjawab.
 */
export function resetStatusFeedBnb() {
  setelStatus('menunggu')
}

/* 14f: subscribe & snapshot di tingkat modul (identitas stabil) — dulu fungsi inline baru tiap render membuat
   useSyncExternalStore berlangganan ulang di setiap render. */
function langganStatus(f: () => void): () => void {
  pendengar.add(f)
  return () => { pendengar.delete(f) }
}

function ambilStatus(): StatusFeedBnb {
  return statusFeed
}

export function useStatusFeedBnb(): StatusFeedBnb {
  return useSyncExternalStore(langganStatus, ambilStatus)
}

function useLaporStatus<T>(s: BnbSumber<T>) {
  const tanda = s.kind === 'missing' ? `missing:${s.reason}` : s.kind
  // kunci efek = `tanda` (jenis + alasan): data baru tiap polling tak perlu melapor ulang
  useEffect(() => laporStatus(s), [tanda])
  // 14f: pelapor dilepas (pindah halaman / chain) → status halaman ini tak boleh tertinggal utk halaman berikutnya
  useEffect(() => resetStatusFeedBnb, [])
}

export function useBnbTrenches(view: BnbView): BnbSumber<BnbTrenchesResponse> {
  const s = useSumber((s) => api.bnbTrenches(view, 50, s), 5_000, `trenches|${view}`, TEMPLATE ? () => contohTrenches(view) : null)
  useLaporStatus(s)
  return s
}

export function useBnbToken(addr: string): BnbSumber<BnbTokenDetail> {
  /* ⚠️ Respons wajib milik alamat yang diminta (respons lama bisa tiba setelah berpindah baris). */
  const s0 = useSumber((sig) => api.bnbToken(addr, sig), 15_000, `token|${addr}`, TEMPLATE ? () => contohToken(addr) : null)
  const s: BnbSumber<BnbTokenDetail> =
    s0.kind === 'live' && s0.data.token.toLowerCase() !== addr.toLowerCase() ? { kind: 'loading' } : s0
  useLaporStatus(s)
  return s
}

/* ⭐ U12 (audit 7 Nov): `/api/bnb/calibration` dulu diminta 3× saat mount (DevNotice, BnbEngineBar, Trenches/halaman
   token BNB: tiap pemakai hook punya polling sendiri). Kini SATU permintaan bersama di tingkat modul: permintaan yang
   masih terbang, atau yang selesai < KAL_BERSAMA_MS lalu, dipakai ulang oleh semua pemakai. Polling 300 dtk tiap
   pemakai tetap; karena jawaban bersama selesai bersamaan, tik berikutnya juga jatuh bersamaan → tetap satu permintaan.
   Galat tidak disimpan (tik berikutnya bertanya lagi). Pembatalan per pemakai (unmount) TIDAK membatalkan permintaan
   bersama; hanya penantian pemakai itu yang berhenti. */
const KAL_BERSAMA_MS = 30_000
let kalBersama: { p: Promise<BnbCalibrationResponse>; selesai: number | null; gagal: boolean } | null = null

function ambilKalibrasiBersama(signal: AbortSignal): Promise<BnbCalibrationResponse> {
  const k = kalBersama
  const pakaiUlang = k && !k.gagal && (k.selesai === null || Date.now() - k.selesai < KAL_BERSAMA_MS)
  if (!pakaiUlang) {
    const baru: NonNullable<typeof kalBersama> = { p: api.bnbCalibration(), selesai: null, gagal: false }
    baru.p.then(
      () => { baru.selesai = Date.now() },
      () => { baru.gagal = true },
    )
    kalBersama = baru
  }
  return denganSinyal(kalBersama!.p, signal)
}

/** Janji bersama dgn pembatalan milik satu pemakai: abort → pemakai ini menerima AbortError, janji bersama jalan terus. */
function denganSinyal<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  const batalErr = () => new DOMException('Aborted', 'AbortError')
  if (signal.aborted) return Promise.reject(batalErr())
  return new Promise<T>((res, rej) => {
    const batal = () => rej(batalErr())
    signal.addEventListener('abort', batal, { once: true })
    p.then(
      (v) => { signal.removeEventListener('abort', batal); res(v) },
      (e) => { signal.removeEventListener('abort', batal); rej(e) },
    )
  })
}

/** Kalibrasi berubah paling cepat tiap hitung ulang server → 5 mnt cukup. U12: satu permintaan bersama utk semua pemakai. */
export function useBnbCalibration(): BnbSumber<BnbCalibrationResponse> {
  return useSumber(ambilKalibrasiBersama, 300_000, 'calibration', TEMPLATE ? contohKalibrasi : null)
}

/** Alamat kontrak BSC/EVM: 0x + 40 hex. Selain ini tak pernah dikirim ke synt-dash. */
export const ALAMAT_EVM = /^0x[0-9a-fA-F]{40}$/

export const BSCSCAN_TOKEN = 'https://bscscan.com/token/'
export const BSCSCAN_ADDRESS = 'https://bscscan.com/address/'
