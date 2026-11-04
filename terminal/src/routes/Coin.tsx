import { useCallback, useEffect, useRef, useState } from 'react'
import { ALAMAT_MINT } from '@/lib/mint'
import { useParams } from 'react-router-dom'
import { CoinDetailView, TakDilacak } from '@/features/token/CoinDetailView'
import { adaptCoinDetail, setSolUsd as setSolUsdDetail } from '@/features/token/adaptDetail'
import { api, ApiError } from '@/api/client'
import { usePolling } from '@/lib/usePolling'
import type { CoinDetail } from '@/features/token/detail'
import { mockCoinDetail } from '@/features/token/detailMock'
import { mockTrenches } from '@/features/trenches/mock'
import { mockPositions, mockTrades } from '@/features/wallet/mock'
import { TEMPLATE } from '@/lib/template'
import { TokenSkeleton } from '@/features/token/view/TokenView'

/**
 * Detail per-coin — `/coin/:mint`.
 *
 * ⭐ TERSAMBUNG ke data nyata (2026-08-28). Tiga endpoint, dipisah karena
 * bebannya berbeda:
 *
 * | endpoint | isi | interval |
 * |---|---|---|
 * | `/api/token` | skor, tier, risiko, penjelasan | 15 detik |
 * | `/api/candles` (+ SSE `/live/stream`) | candle 1m chart, hidup (P4) | 20 detik |
 * | `/api/holders` | 20 holder + 50 swap | 30 detik |
 *
 * ⚠️ `/api/holders` paling jarang: isinya ~26 holder dan 263 swap per pair,
 * dan keduanya hampir tak berubah setelah gate-2 selesai di detik-600.
 *
 * ⛔ `reasons` & `skor2_rincian` TIDAK dipakai di sini. Keduanya menyebut nama
 * gate & ambang; tab "Score factors" diisi dari badge risiko yang sama dengan
 * tabel, plus penjelasan AI yang sudah lewat kamus penerjemah.
 */
export function CoinRoute() {
  const { mint } = useParams<{ mint: string }>()
  if (TEMPLATE && MINT_CONTOH.has(mint ?? '')) return <CoinTemplate />
  // ⭐ 1b: string yang bukan alamat base58 (mis. "notamint") tak pernah dikirim ke mesin → nol permintaan 404.
  if (!ALAMAT_MINT.test(mint ?? '')) return <TakDitemukan />
  // ⛔ 1b: `key` WAJIB. Tanpa remount, navigasi dalam-aplikasi ke mint yang 404 tetap menampilkan koin SEBELUMNYA di
  // bawah URL baru (state `coin` & usePolling menyimpan data lama).
  return <CoinNyata key={mint} />
}

function TakDitemukan() {
  return <section className="page"><p className="tr-empty">Token not found.</p></section>
}

/* Mint karangan di data contoh (baris Trenches, wallet, akun). Hanya alamat INI yang membuka halaman contoh di mode
   template; alamat lain diperlakukan seperti preview (tak dikenal mesin → "Token not found."), sehingga tak ada
   permintaan 404 ke synt-dash utk mint karangan. */
const MINT_CONTOH = new Set<string>([
  mockCoinDetail.mint,
  ...mockTrenches.map((r) => r.mint),
  ...mockTrades.map((t) => t.mint),
  ...mockPositions.map((p) => p.mint).filter((m) => m !== 'So11111111111111111111111111111111111111112'),
])

/* mode template (lab): halaman token dari data contoh features/token/detailMock.ts.
   ⭐ Sejak 2026-10-25 (AGEN-BUILD butir 1) HANYA utk mint karangan (MINT_CONTOH). Mint nyata → halaman nyata,
   termasuk di mode template: panel yang sudah tersambung tampil nyata.
   ⛔ Contoh diberi keterangan terlihat, bukan fallback diam-diam. Galat API TIDAK pernah jatuh ke contoh. */
function CoinTemplate() {
  return (
    <section className="page">
      <p className="cd-sample-note" role="note">
        Sample token. This address belongs to the sample data, so every number on this page is an example.
      </p>
      <CoinDetailView coin={mockCoinDetail} sample />
    </section>
  )
}

function CoinNyata() {
  const { mint } = useParams<{ mint: string }>()
  const m = mint ?? ''

  // ⭐ 5 detik (dari 15), selaras panel Trenches — sejak harga streaming,
  // dua panel yang tertinggal berbeda menampilkan angka berbeda.
  // ⭐ 1b: 404 = mesin tak mengenal mint ini → berhenti bertanya (polling tetap berdetak, tapi tanpa permintaan
  // jaringan; galat 404 yang sama dilempar ulang). Komponen di-remount per mint (`key`), jadi ref ini per mint.
  const tak404 = useRef<ApiError | null>(null)
  /* ⭐ 1d: keputusan halaman dari CoinDetailView — null = belum pasti, true = halaman penuh, false = "Not tracked".
     "Not tracked" tak menampilkan satu pun angka mesin → polling /api/token berhenti meminta (data terakhir dipakai
     ulang, tanpa jaringan) dan /api/holders tak pernah diminta. Komponen di-remount per mint (`key`). */
  const [pumpOk, setPumpOk] = useState<boolean | null>(null)
  const onKeputusan = useCallback((p: boolean) => setPumpOk(p), [])
  const terakhir = useRef<Awaited<ReturnType<typeof api.token>> | null>(null)
  const tok = usePolling(async (s) => {
    if (tak404.current) throw tak404.current
    if (pumpOk === false && terakhir.current) return terakhir.current
    try {
      const r = await api.token(m, s)
      terakhir.current = r
      return r
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) tak404.current = e
      throw e
    }
  }, 5_000, m)
  // ⛔⛔ PANGGILAN GANDA DICABUT 2026-09-24.
  //
  // `api.chart(mint)` dipanggil DUA KALI untuk mint yang sama: di sini tiap
  // 20 detik, dan di `PriceChartLive` (yang dirender `CoinDetailView`) tiap
  // 20 detik juga. Dua permintaan identik ke endpoint yang sama, hanya
  // bergeser fasanya.
  //
  // ⭐ Yang dipertahankan adalah milik `PriceChartLive`, karena di sanalah
  // datanya DIPAKAI menggambar. Nilai di sini hanya diteruskan ke
  // `adaptCoinDetail` untuk sparkline, dan itu bisa diambil dari `tok`.
  //
  // ⚠️ Jangan "amankan" dgn memanggil keduanya: dua sumber untuk grafik yang
  // sama adalah undangan bagi dua garis berbeda pada layar yang sama.
  const cht = { data: null } as { data: null }
  // ⭐ 1b: holders baru ditanya setelah /api/token menjawab mint ini — mint tak dikenal = SATU 404, bukan dua.
  // ⭐ 1d: DAN hanya setelah halaman penuh dipastikan (pumpOk true) — mint "Not tracked" tak pernah menampilkan holders.
  const tokOk = tok.data?.mint === m && pumpOk === true
  const hld = usePolling<Awaited<ReturnType<typeof api.holders>> | null>(
    (s) => (tokOk ? api.holders(m, s) : Promise.resolve(null)),
    30_000,
    `${m}|${tokOk}`,
  )

  /* ⚠️ Data lama dipertahankan sampai yang baru tiba — sama seperti kartu
     Trenches. Mengosongkannya membuat halaman berkedip tiap polling, dan
     pada halaman sebesar ini kedipannya jauh lebih mengganggu. */
  const [coin, setCoin] = useState<CoinDetail | null>(null)
  useEffect(() => {
    // Hanya terima data yang benar-benar milik mint yang diminta: respons
    // lama bisa tiba setelah pengguna berpindah token.
    if (tok.data && tok.data.mint === m) {
      // ⛔ DULU TAK DIPANGGIL (ditemukan 2026-10-22): halaman token memakai kurs cadangan $190 padahal kurs nyata ±$105 →
      // market cap, likuiditas & volume USD kebesaran ±80% (mis. MC $5,4K padahal harga × supply = $2,95K).
      setSolUsdDetail((tok.data as { sol_usd?: number | null }).sol_usd)
      setCoin(adaptCoinDetail(tok.data, cht.data, hld.data))
    }
  }, [tok.data, cht.data, hld.data, m])

  if (!coin) {
    // A5: kerangka kartu (bukan satu teks "Loading…")
    if (tok.loading) return <section className="page"><TokenSkeleton /></section>
    // 404 dari mesin = mesin tak mengenal mint ini, bukan mesin mati
    // ⭐ 1c putaran 2: token nyata yang tak dikenal mesin (JUP) → keadaan "Not tracked by synt" + fakta eksternal;
    // alamat yang DexScreener pun tak kenal → "Token not found."
    if (tok.error instanceof ApiError && tok.error.status === 404) {
      return <section className="page"><TakDilacak mint={m} takDikenalMesin /></section>
    }
    if (tok.error) {
      return (
        <section className="page">
          <p className="tr-empty">Cannot reach the engine.</p>
        </section>
      )
    }
    return <TakDitemukan />
  }

  return (
    <section className="page">
      <CoinDetailView
        coin={coin}
        onKeputusan={onKeputusan}
        muat={{
          // A5: polling gagal → data terakhir tetap + catatan umur data (undefined = segar)
          tokenBasi: tok.error ? tok.at : undefined,
          holders: {
            memuat: tokOk && hld.data === null && hld.error === null,
            basi: hld.error && hld.data ? hld.at : undefined,
          },
        }}
      />
    </section>
  )
}
