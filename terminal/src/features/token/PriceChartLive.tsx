import { Suspense, lazy, useCallback } from 'react'
import type { LanggananTik } from './PriceChartPro'
import { ChartGagal, ChartSkeleton } from './chart/ChartRingan'
import { SUB_GAGAL_UNDUH, muatChartSol } from './chart/muat'
import { BatasGalat } from '@/lib/potongan'
import { kursSolUsd } from './adaptDetail'
import { api } from '@/api/client'
import { usePolling } from '@/lib/usePolling'
import { aliranMungkinHidup } from './aliran'

/**
 * Chart yang mengambil datanya sendiri, plus langganan harga hidup.
 *
 * Dua lapis, dan pemisahannya disengaja:
 *
 * 1. **Candle** lewat `/api/candles` (polling 20 detik) — `v10_candle` 1m, ditulis synt-stream candle.rs (menit
 *    berjalan di-flush tiap 20 dtk, jadi polling membawa candle baru selama pair masih diperdagangkan di kurva).
 * 2. **Harga hidup** lewat SSE `/live/stream/:mint` — hanya selama chart ini tergambar. Menggerakkan candle menit
 *    berjalan di antara dua polling.
 *
 * ⭐ P4 (AGEN-BUILD): keduanya kini benar-benar sampai ke chart lewat datafeed `subscribe` Pro (lihat
 * `DatafeedLokal` di PriceChartPro). Dulu titik SSE digabung lalu dibuang (`void gabung`) dan polling tak membangun
 * ulang chart → chart beku di saat halaman dibuka.
 *
 * ⛔ Polling `/api/chart` (yang hanya mengisi `gabung` tadi) DICABUT: datanya tak pernah digambar, dan candle.rs
 * menyerap setiap titik yang sama (termasuk menit 0-10), jadi `/api/candles` sudah memuat semuanya.
 *
 * ⚠️ Aliran SSE berhenti sendiri saat kurva lulus atau pair > 24 jam (synt-stream wss.rs / peta.rs). Itu bukan
 * gangguan: chart pair seperti itu memang diam.
 */
/**
 * U1 (7 Nov): klinecharts + @klinecharts/pro (+ CSS Pro) dimuat MALAS bersama komponen chart → kepala & kartu halaman
 * token tampil tanpa menunggu ±370 KB pustaka chart. Selama potongan itu dimuat tampil `ChartSkeleton` yang sama dgn
 * keadaan "candle belum datang" (A5), jadi tak ada lompatan tata letak. Data candle & SSE di bawah sudah jalan paralel.
 * Putaran 2: potongan tak terunduh → `ChartGagal` di kartu chart saja (BatasGalat), sisa halaman tetap.
 */
const PriceChartPro = lazy(() => muatChartSol().then((m) => ({ default: m.PriceChartPro })))


export function PriceChartLive({ mint, symbol, ageSecs, lulus = false, akhirKurva = false, sample = false }: {
  mint: string
  symbol: string
  /** P3: umur pair (detik) dari /api/token; null/tak sah → chart tanpa jam (lihat PriceChartPro). */
  ageSecs: number | null
  /** Mesin mencatat kurva sudah lulus (`complete`) → aliran kurva sudah berhenti, SSE tak dibuka. */
  lulus?: boolean
  /** U7: token lulus menurut halaman (mesin ATAU RugCheck, sama dgn catatan amber chart) → candle terakhir = akhir
   *  data kurva, bukan harga kini (penanda netral, strip "end of curve data"). */
  akhirKurva?: boolean
  /** Halaman contoh (mint karangan, mode template): tanpa `/api/candles` & tanpa SSE. */
  sample?: boolean
}) {
  /* ⚠️ Selalu tf=1: periode tampilan (1m/5m/15m/1H) milik KLineChart Pro dan digabung di klien dari candle 1m
     (`DatafeedLokal.candle`). Kunci memuat mint supaya ganti pair memulai polling baru. */
  const { data: candles, loading, error, at } = usePolling(
    // mint contoh: tak ada di mesin → tak ditanyakan (dulu 1 permintaan sia-sia per 20 dtk); keadaan kosong sama
    (signal) => (sample ? Promise.resolve(null) : api.candles(mint, 1, signal)),
    20_000,
    `${mint}|${sample}`,
  )

  /* Putaran 2: SSE hanya dibuka bila synt-stream MUNGKIN masih menyiarkan pair ini (belum lulus, umur < 24 jam).
     Dibaca saat chart dibuat; pair yang lulus SAAT halaman terbuka: aliran berhenti sendiri. */
  // U11 putaran 2: syarat yang SAMA dipakai Coin.tsx utk interval /api/token (`aliran.ts`)
  const bisaHidup = !sample && aliranMungkinHidup(ageSecs, lulus)

  const langganTik = useCallback<LanggananTik>(
    (cb, sambung) => {
      const es = new EventSource(`/live/stream/${encodeURIComponent(mint)}`)
      // juga saat menyambung ulang: titik selama putus hilang (lihat DatafeedLokal.sambung)
      es.onopen = () => sambung()
      es.onmessage = (ev) => {
        try {
          // bentuk = synt-stream langganan.rs `Tik` {mint, pair_age_secs, harga_sol, real_sol, complete}
          const t = JSON.parse(ev.data) as {
            mint?: string
            pair_age_secs: number
            harga_sol: number
            real_sol: number
          }
          if (t.mint !== undefined && t.mint !== mint) return
          cb({ detik: t.pair_age_secs, harga: t.harga_sol, liq: t.real_sol })
        } catch {
          // Baris rusak dilewati; satu pesan cacat bukan alasan memutus aliran.
        }
      }
      // ⚠️ Sengaja TANPA onerror yang menutup: EventSource menyambung ulang
      // sendiri. Menutupnya saat error pertama akan mematikan aliran pada
      // gangguan jaringan sesaat.
      return () => es.close()
    },
    [mint],
  )


  // /api/candles berisi harga dlm SOL. Chart mengonversinya ke USD supaya sejalan dgn harga di header — HANYA bila kurs
  // asli dari API sudah ada; tanpa itu chart tetap SOL & berlabel SOL (2026-10-22, dulu SOL berlabel USD = salah ±100×).
  // P4: konversi pindah ke datafeed, dgn kurs dipatok saat chart dibuat (candle riwayat & hidup sekurs).
  const kurs = kursSolUsd()

  return (
    <BatasGalat cadangan={<ChartGagal sub={SUB_GAGAL_UNDUH} />}>
      <Suspense fallback={<ChartSkeleton />}>
        <PriceChartPro
          mint={mint}
          symbol={symbol}
          candles={candles?.candles ?? null}
          kurs={kurs}
          mulaiMs={ageSecs !== null && Number.isFinite(ageSecs) && ageSecs >= 0 ? Date.now() - ageSecs * 1000 : null}
          langganTik={bisaHidup ? langganTik : undefined}
          // A5: skeleton saat muat pertama; galat → data terakhir tetap + "Couldn't refresh, showing data from N ago"
          memuat={!sample && loading}
          gagal={!sample && error !== null}
          basiSejak={at}
          akhirKurva={akhirKurva}
        />
      </Suspense>
    </BatasGalat>
  )
}
