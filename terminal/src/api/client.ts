import type { FeedPost } from '@/features/discovery/types'
import type {
  CandlesResponse,
  ChartResponse,
  HoldersResponse,
  OverviewResponse,
  ScoresResponse,
  TokenDetail,
  TrenchesResponse,
  SearchResponse,
  CreatorsResponse,
  BnbTrenchesResponse,
  BnbTokenDetail,
  BnbCalibrationResponse,
  WalletResponse,
} from './types'

/* Relatif, bukan absolut: dev dilayani proxy Vite, produksi oleh reverse-proxy.
   Keduanya same-origin, jadi tak ada CORS dan tak ada origin backend yang
   ikut ter-bundle ke klien. */
const BASE = '/api'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    /** Butir 14b: `status` dari badan JSON galat bila ada (synt-dash bnb.rs: "loading", "bnb_unavailable",
        "unavailable", "not_found", "bad_address"). null = badan kosong / bukan JSON (mis. rute belum ada). */
    readonly detail: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Pembungkus fetch. Menormalkan dua kegagalan yang bentuknya berbeda —
 * HTTP non-2xx dan body yang bukan JSON — menjadi satu ApiError, supaya
 * pemanggil tak perlu menangani keduanya secara terpisah.
 */
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    signal,
    headers: { accept: 'application/json' },
  })

  if (!res.ok) {
    let detail: string | null = null
    try {
      const b = (await res.json()) as { status?: unknown }
      if (typeof b?.status === 'string') detail = b.status
    } catch {
      // badan kosong / HTML: detail tetap null
    }
    throw new ApiError(`${res.status} ${res.statusText}`, res.status, url, detail)
  }

  try {
    return (await res.json()) as T
  } catch {
    // Umumnya berarti fallback_service synt-dash mengembalikan HTML untuk
    // path yang tak dikenal — endpoint salah ketik, bukan server mati.
    throw new ApiError('Respons bukan JSON', res.status, url)
  }
}

export const api = {
  /** Post Discovery dari agent synt — dilayani synt-ops (bukan synt-dash), lewat Caddy /api/posts (preview & lab). */
  posts: (signal?: AbortSignal) => get<{ items: FeedPost[]; total: number }>('/posts', signal),

  scores: (signal?: AbortSignal) => get<ScoresResponse>('/scores', signal),

  /**
   * Feed Trenches untuk satu tampilan.
   *
   * ⚠️ `view` dikirim sebagai parameter permintaan, BUKAN difilter di klien.
   * ~52.000 coin terdeteksi per hari; mengirim seluruh tabel lalu menyaring
   * di browser tidak akan terskala, dan tiap tampilan punya jendela waktu
   * berbeda di sisi server (graduated 24 jam vs new 40 menit) yang tak bisa
   * direproduksi dari satu respons.
   */
  trenches: (view: string, limit = 50, signal?: AbortSignal) =>
    get<TrenchesResponse>(
      `/trenches?view=${encodeURIComponent(view)}&limit=${limit}`,
      signal,
    ),

  /** Status mesin — isi footer. */
  overview: (signal?: AbortSignal) => get<OverviewResponse>('/overview', signal),

  /** Detail satu pair — kartu terminal. */
  token: (mint: string, signal?: AbortSignal) =>
    get<TokenDetail>(`/token?mint=${encodeURIComponent(mint)}`, signal),

  /**
   * Candle OHLCV. `tf` = menit per candle (1, 5, 15, 60…).
   *
   * ⭐ Timeframe digabung di SERVER dari baris menit, bukan disimpan
   * terpisah — data yang sama tak ditulis berkali-kali.
   */
  candles: (mint: string, tf = 1, signal?: AbortSignal) =>
    get<CandlesResponse>(
      `/candles?mint=${encodeURIComponent(mint)}&tf=${tf}`,
      signal,
    ),

  /** Holder & swap — hanya halaman detail pair. */
  holders: (mint: string, signal?: AbortSignal) =>
    get<HoldersResponse>(`/holders?mint=${encodeURIComponent(mint)}`, signal),

  /**
   * ⭐ B1 (27 Okt): pencarian global simbol/nama/mint atas indeks memori synt-dash (`cari.rs`): setiap launch
   * pump.fun yang terdeteksi sejak `index.since`. 400 bila q < 2 / > 64 karakter; 503 `{status:"loading"}` sesaat
   * setelah restart (indeks belum terbaca).
   */
  search: (q: string, limit = 20, signal?: AbortSignal) =>
    get<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`, signal),

  /** ⭐ B3 (27 Okt): leaderboard creator (`kreator.rs`), dihitung ulang server tiap 15 mnt; 503 sebelum hitungan pertama. */
  creators: (signal?: AbortSignal) => get<CreatorsResponse>('/leaderboard/creators', signal),

  /**
   * ⭐ B11 (BNB, BELUM ADA di synt-dash; kontrak AGEN-BUILD): feed pair BSC (Flap.sh + four.meme). Sampai endpoint
   * dipasang jawabannya 404 → `features/bnb/useBnb.ts` menampilkan keadaan kosong (template: contoh berlabel).
   */
  bnbTrenches: (view: 'new' | 'graduated', limit = 50, signal?: AbortSignal) =>
    get<BnbTrenchesResponse>(`/bnb/trenches?view=${view}&limit=${limit}`, signal),

  /** B11: detail + candle USD 1m satu token BNB. 404 = token tak dikenal ATAU endpoint belum ada. */
  bnbToken: (addr: string, signal?: AbortSignal) =>
    get<BnbTokenDetail>(`/bnb/token/${encodeURIComponent(addr)}`, signal),

  /** B11: tabel kalibrasi skor BNB (provisional selama kalibrasi v1). */
  bnbCalibration: (signal?: AbortSignal) => get<BnbCalibrationResponse>('/bnb/calibration', signal),

  /** A3: statistik engine BNB utk footer sadar chain (synt-dash bnb.rs `overview`; bentuk di `BnbEngineBar.tsx`). */
  bnbOverview: <T,>(signal?: AbortSignal) => get<T>('/bnb/overview', signal),

  /** ⭐ B2 (butir 8): wallet tracker read-only. 400 = alamat tak sah, 503 = DB tak menjawab. */
  wallet: (addr: string, signal?: AbortSignal) =>
    get<WalletResponse>(`/wallet?addr=${encodeURIComponent(addr)}`, signal),

  /** Deret harga + evolusi skor untuk satu mint. */
  chart: (mint: string, signal?: AbortSignal) =>
    get<ChartResponse>(`/chart?mint=${encodeURIComponent(mint)}`, signal),
}
