import { gambarToken } from '@/components/Avatar'
import type { TrenchItem } from '@/api/types'
import type { CoinBrief } from './types'
import { umur } from '@/lib/format'
import { pasarPascaLulusBelumDimuat } from '@/features/token/labels'

/* Kolom koin Discovery dari feed Trenches (/api/trenches).

   ⭐ Sumbernya SAMA dengan Trenches — setiap pair di feed itu sudah lolos
   audit gate-2 — jadi "Newly audited" = view `new` (terdeteksi ≤40 menit)
   dan "Trending" = view `trending`, tanpa endpoint baru.

   ⚠️ Kartu tetap ringkas (simbol · skor · MC). Likuiditas, holder, riwayat
   skor milik Trenches — CLAUDE.md "Pemisahan konten". */

/* A2: umur dari formatter tunggal `@/lib/format` (dulu salinan sendiri, "0m" utk < 1 menit). */

/**
 * ⛔ Pair tanpa skor DIBUANG, bukan diberi 0: kartu ini berjanji "sudah
 * teraudit", dan 0 akan terbaca sebagai skor terburuk (jebakan #10 synt-v10).
 */
export function adaptBrief(it: TrenchItem, solUsd: number | null | undefined): CoinBrief | null {
  if (it.score == null) return null
  return {
    mint: it.mint,
    symbol: it.symbol,
    avatar: gambarToken(it),
    score: it.score,
    // Tanpa mcap atau kurs dari server, MC tak ditebak dgn konstanta → null (kartu menulis "—", bukan "$0").
    // P2: harga pasca-lulus belum dimuat synt → MC = angka kelulusan beku → null juga
    marketCap: !pasarPascaLulusBelumDimuat(it) && it.mcap_sol != null && it.mcap_sol > 0 && solUsd ? it.mcap_sol * solUsd : null,
    age: umur(it.age_secs),
    collapseRatePct: it.collapse_rate_pct ?? null,
    rose3xRatePct: it.rose3x_rate_pct ?? null,
  }
}
