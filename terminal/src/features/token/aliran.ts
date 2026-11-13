/**
 * Kapan harga sebuah pair SOL MUNGKIN masih bergerak hidup (synt-stream menyiarkannya).
 *
 * Satu sumber utk dua pemakai yang wajib sepakat (U11 putaran 2, Reviewer):
 * - `PriceChartLive` membuka SSE `/live/stream/:mint` hanya bila ini true (chart bergerak tiap tik);
 * - `Coin.tsx` mem-poll `/api/token` tiap 5 dtk selama ini true, supaya harga/MC/likuiditas kepala (yang di synt-dash
 *   ditimpa harga synt-stream terkini) tak tertinggal dari chart yang bergerak.
 *
 * ⚠️ Aliran berhenti sendiri saat kurva lulus atau pair > 24 jam (synt-stream wss.rs / peta.rs `JENDELA_JAM` = 24):
 * pair yang lebih tua tak pernah disiarkan.
 */
export const JENDELA_ALIRAN_DETIK = 24 * 3600

export function aliranMungkinHidup(ageSecs: number | null | undefined, lulus: boolean): boolean {
  return !lulus && typeof ageSecs === 'number' && ageSecs < JENDELA_ALIRAN_DETIK
}
