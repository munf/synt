import { api } from '@/api/client'
import { Metric } from '@/components/Metric'
import { usePolling } from '@/lib/usePolling'
import { umur } from '@/lib/format'
import { useBnbCalibration } from '@/features/bnb/useBnb'
import './EngineBar.css'

/** `GET /api/bnb/overview` (synt-dash bnb.rs `overview`, dicek 28 Okt). Field yang tak dipakai dibiarkan. */
interface BnbOverview {
  launches_per_hour: number | null
  scored_per_hour: number | null
  graduations_24h: number | null
  score_version: string | null
  last_block_age_secs: number | null
}

/** Blok BSC terakhir lebih tua dari ini → status "Behind", bukan "live" (blok BSC ±3 dtk; 2 mnt = jelas tertinggal). */
const BLOK_BASI_DETIK = 120

/**
 * ⭐ A3 (DESIGN §3.1): footer engine SADAR CHAIN — dipakai saat Trenches berchain BNB / halaman `/bnb/*`.
 * Bentuk & gaya = `EngineBar` Solana (kelas `eb-*`, Metric `inline`), isinya statistik engine BNB:
 * Born/h, Scored/h, Graduated 24h, versi kalibrasi (+ provisional). Tanpa data → "—", tanpa klaim "live".
 * Tak bisa dibuka (Solana punya panel rincian per komponen; BNB belum punya datanya).
 */
export function BnbEngineBar() {
  const { data, error } = usePolling((s) => api.bnbOverview<BnbOverview>(s), 30_000)
  const cal = useBnbCalibration()
  const prov = cal.kind === 'live' || cal.kind === 'contoh' ? cal.data.provisional : null

  const n = (v: number | null | undefined, f: (x: number) => string) => (data && v !== null && v !== undefined && Number.isFinite(v) ? f(v) : '—')
  const blok = data?.last_block_age_secs ?? null
  const basi = blok !== null && blok > BLOK_BASI_DETIK
  const kelas = !data ? (error ? 'is-degraded' : 'is-idle') : error || basi ? 'is-degraded' : 'is-active'
  const teks = !data
    ? error ? 'Unavailable' : 'Loading…'
    : error ? 'Not updating'
    : basi ? `Behind, last block ${umur(blok)} ago`
    : 'BNB engine live'

  return (
    <footer className="eb">
      <div className="eb-bar is-static">
        <span className="eb-items">
          <Metric as="span" variant="inline" className="eb-metric" label="Born" value={n(data?.launches_per_hour, (x) => `${x.toLocaleString('en-US')}/h`)} />
          <Metric as="span" variant="inline" className="eb-metric" label="Scored" value={n(data?.scored_per_hour, (x) => `${x}/h`)} />
          <Metric as="span" variant="inline" className="eb-metric" label="Graduated" value={n(data?.graduations_24h, (x) => `${x} in 24h`)} />
          <Metric
            as="span"
            variant="inline"
            className="eb-metric"
            label="Calibration"
            value={data?.score_version ? `${data.score_version}${prov ? ' · provisional' : ''}` : '—'}
          />
        </span>
        <span className={`eb-status ${kelas}`} role="status">
          <span className="eb-dot" aria-hidden="true" />
          {teks}
          <span className="eb-chev-space" aria-hidden="true" />
        </span>
      </div>
    </footer>
  )
}
