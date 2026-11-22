import { api } from '@/api/client'
import { Metric } from '@/components/Metric'
import { usePolling } from '@/lib/usePolling'
import { compact, umur } from '@/lib/format'
import { useState } from 'react'
import { ChevronIcon } from './EngineBar'
import { useBnbCalibration } from '@/features/bnb/useBnb'
import './EngineBar.css'

/** `GET /api/bnb/overview` (synt-dash bnb.rs `overview`, dicek 28 Okt; field rincian dicek 22 Nov). */
interface BnbOverview {
  launches_per_hour: number | null
  scored_per_hour: number | null
  graduations_24h: number | null
  score_version: string | null
  last_block_age_secs: number | null
  launches_24h?: number | null
  scored_24h?: number | null
  last_block?: number | null
  computed_at?: string | null
}

/** Blok BSC terakhir lebih tua dari ini → status "Behind", bukan "live" (blok BSC ±3 dtk; 2 mnt = jelas tertinggal). */
const BLOK_BASI_DETIK = 120

/**
 * ⭐ A3 (DESIGN §3.1): footer engine SADAR CHAIN — dipakai saat Trenches berchain BNB / halaman `/bnb/*`.
 * Bentuk & gaya = `EngineBar` Solana (kelas `eb-*`, Metric `inline`), isinya statistik engine BNB:
 * Detected/h (U24, dulu "Born"), Scored/h, Graduated 24h, versi kalibrasi (+ provisional). Tanpa data → "—", tanpa klaim "live".
 * ⭐ T-11 (22 Nov): format per jam = Solana (Detected `compact`, Scored 1 desimal) dan bar kini BISA DIBUKA spt Solana:
 * rincian Throughput (jam terakhir & 24 jam) + Reliability (blok BSC terakhir, kalibrasi) dari respons yang sama,
 * tanpa endpoint baru. Isi slot 3-4 tetap beda dari Solana karena datanya beda.
 */
export function BnbEngineBar() {
  const { data, error } = usePolling((s) => api.bnbOverview<BnbOverview>(s), 30_000)
  const cal = useBnbCalibration()
  const calData = cal.kind === 'live' || cal.kind === 'contoh' ? cal.data : null
  const prov = calData ? calData.provisional : null
  const [open, setOpen] = useState(false)

  const ok = (v: number | null | undefined): v is number => !!data && v !== null && v !== undefined && Number.isFinite(v)
  const n = (v: number | null | undefined, f: (x: number) => string) => (ok(v) ? f(v) : '—')
  const blok = data?.last_block_age_secs ?? null
  const basi = blok !== null && blok > BLOK_BASI_DETIK
  const kelas = !data ? (error ? 'is-degraded' : 'is-idle') : error || basi ? 'is-degraded' : 'is-active'
  const teks = !data
    ? error ? 'Unavailable' : 'Loading…'
    : error ? 'Not updating'
    : basi ? `Behind, last block ${umur(blok)} ago`
    : 'BNB engine live'
  const versi = data?.score_version ? `${data.score_version}${prov ? ' · provisional' : ''}` : '—'

  return (
    <footer className={`eb ${open ? 'is-open' : ''}`}>
      {open && !data && (
        <div className="eb-panel">
          <p className="eb-empty">
            {error ? "BNB engine status couldn't be loaded. Retrying every 30 seconds." : 'Waiting for BNB engine status…'}
          </p>
        </div>
      )}

      {open && data && (
        <div className="eb-panel">
          <div className="eb-section">
            <h3 className="eb-h">Throughput</h3>
            <div className="eb-grid">
              <Metric variant="stat" label="Detected" value={n(data.launches_per_hour, compact)} note="launches in the last hour" title={INFO_DETECTED} />
              {/* nit Reviewer T-11: Scored 1 desimal per jam, sama dgn bar & panel Solana */}
              <Metric variant="stat" label="Scored" value={n(data.scored_per_hour, (x) => x.toFixed(1))} note="launches in the last hour" tone="is-accent" title={INFO_SCORED} />
              <Metric variant="stat" label="Graduated" value={n(data.graduations_24h, compact)} note="in the last 24 hours" title={INFO_GRADUATED} />
              {/* nit Reviewer T-11: hitungan 24 jam = throughput (dulu di Reliability) */}
              <Metric variant="stat" label="Detected, 24h" value={n(data.launches_24h, compact)} note="launches in the last 24 hours" />
              <Metric variant="stat" label="Scored, 24h" value={n(data.scored_24h, compact)} note="launches in the last 24 hours" />
            </div>
          </div>
          <div className="eb-section">
            <h3 className="eb-h">Reliability</h3>
            <div className="eb-grid eb-grid-2">
              <Metric
                variant="stat"
                label="Last block"
                value={ok(blok) ? `${umur(blok)} ago` : null}
                note={ok(data.last_block) ? `BNB Chain block ${data.last_block.toLocaleString('en-US')}` : 'No block reported'}
                title="Age of the newest BNB Chain block the engine has read. Blocks arrive about every 3 seconds; over 2 minutes shows as Behind."
              />
              <Metric
                variant="stat"
                className="eb-ver"
                label="Calibration"
                // kotak stat 24px: versi saja (label "provisional" pindah ke catatan agar tak meluap)
                value={data.score_version ?? null}
                note={calData ? `${prov ? 'Provisional, ' : ''}${calData.base.n.toLocaleString('en-US')} scored tokens` : 'Calibration not loaded'}
                title={prov ? 'Version of the BNB score calibration. Provisional: the table behind the scores is still being measured.' : 'Version of the BNB score calibration.'}
              />
            </div>
          </div>
        </div>
      )}

      {/* T-11: bar = <button> spt Solana (penjelas lewat `title`, popover ketuk tak boleh bersarang di tombol) */}
      <button type="button" className="eb-bar" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="eb-items">
          {/* U24: "Born" → "Detected" (kosakata & slot pertama = footer Solana); penjelas lewat `title` (bnb.rs `overview`) */}
          <Metric as="span" variant="inline" className="eb-metric" label="Detected" value={n(data?.launches_per_hour, (x) => `${compact(x)}/h`)} title={INFO_DETECTED} />
          <Metric as="span" variant="inline" className="eb-metric" label="Scored" value={n(data?.scored_per_hour, (x) => `${x.toFixed(1)}/h`)} title={INFO_SCORED} />
          <Metric as="span" variant="inline" className="eb-metric" label="Graduated" value={n(data?.graduations_24h, (x) => `${x} in 24h`)} title={INFO_GRADUATED} />
          <Metric
            as="span"
            variant="inline"
            className="eb-metric"
            label="Calibration"
            value={versi}
            title={prov ? 'Version of the BNB score calibration. Provisional: the table behind the scores is still being measured.' : 'Version of the BNB score calibration.'}
          />
        </span>
        <span className={`eb-status ${kelas}`} role="status">
          <span className="eb-dot" aria-hidden="true" />
          {teks}
          <ChevronIcon flipped={open} />
        </span>
      </button>
    </footer>
  )
}

const INFO_DETECTED = 'New BNB Chain launches (Flap and four.meme) the engine saw in the last hour.'
const INFO_SCORED = 'Launches scored in the last hour. A launch is scored at minute 2 if at least 10 outside wallets bought in its first 2 minutes.'
const INFO_GRADUATED = 'Launches that graduated from the bonding curve in the last 24 hours.'
