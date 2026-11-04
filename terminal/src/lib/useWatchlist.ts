import { useWatchlistBersama } from '@/features/account/sinkron'

/**
 * Watchlist token.
 *
 * ⭐ 1 Nov (tahap B): satu penyimpanan bersama (`features/account/sinkron.ts`) — localStorage untuk tamu,
 * ikut akun saat masuk. Bentuk API (mints/has/toggle) tetap, jadi pemanggil tak berubah.
 */
export function useWatchlist() {
  return useWatchlistBersama()
}
