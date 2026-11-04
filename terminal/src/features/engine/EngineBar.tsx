import { useState } from 'react'
import type { EngineStatus, ComponentState } from './types'
import { compact } from '@/lib/format'
import { Metric } from '@/components/Metric'
import './EngineBar.css'

/**
 * Footer status engine.
 *
 * ⭐ Terminal lain menaruh harga BTC/ETH di sini. synt menaruh performa
 * mesinnya sendiri — throughput audit, tingkat error, cakupan metadata.
 * Harga BTC ada di mana-mana dan tidak memberi tahu apa pun tentang produk
 * ini; angka di bawah adalah bukti bahwa yang dijual synt sedang bekerja.
 *
 * Sesuai BRAND.md §3, tiap klaim membawa angkanya: bukan "engine healthy"
 * melainkan "1.2K tokens/hour · 1.0% error · 98.9% metadata".
 *
 * Bar selalu terlihat; klik untuk membuka detail per-komponen.
 */
export function EngineBar({
  status: s,
  gagal = false,
}: {
  /** null = belum ada respons nyata `/api/overview` → nilai "—", TANPA "Engine live". */
  status: EngineStatus | null
  /** Permintaan terakhir gagal. Tanpa data → "Unavailable"; dgn data lama → angka lama + "Not updating". */
  gagal?: boolean
}) {
  const [open, setOpen] = useState(false)

  /* ⛔ 2026-10-25 (orkestrator): dulu `mockEngine` tampil sampai respons pertama, padahal /api/overview dingin butuh
     ±11 dtk → ±11 dtk angka contoh di bawah "Engine live", juga di preview publik. Kini: belum ada data = netral. */
  const worst = s?.components.reduce<ComponentState>((acc, c) => {
    if (c.state === 'down' || acc === 'down') return 'down'
    if (c.state === 'degraded' || acc === 'degraded') return 'degraded'
    return 'active'
  }, 'active')

  const v = (f: (x: EngineStatus) => string) => (s ? f(s) : '—')
  const statusKelas = !s ? 'is-idle' : gagal ? 'is-degraded' : `is-${worst}`
  const statusTeks = !s
    ? gagal ? 'Unavailable' : 'Loading…'
    : gagal ? 'Not updating'
    : worst === 'active' ? 'Engine live' : worst === 'degraded' ? 'Degraded' : 'Down'

  return (
    <footer className={`eb ${open ? 'is-open' : ''}`}>
      {open && !s && (
        <div className="eb-panel">
          <p className="eb-empty">
            {gagal ? "Engine status couldn't be loaded. Retrying every 30 seconds." : 'Waiting for engine status…'}
          </p>
        </div>
      )}

      {open && s && (
        <div className="eb-panel">
          <div className="eb-section">
            <h3 className="eb-h">Throughput</h3>
            <div className="eb-grid">
              <Metric variant="stat"
                value={compact(s.processedPerHour)}
                note="tokens / hour"
                label="Detected"
              />
              <Metric variant="stat"
                value={s.scoredPerHour.toFixed(1)}
                note="tokens / hour"
                label="AI-scored"
                tone="is-accent"
              />
              <Metric variant="stat"
                value={`${s.selectivityPct.toFixed(2)}%`}
                note="reach scoring"
                label="Selectivity"
              />
            </div>
          </div>

          <div className="eb-section">
            <h3 className="eb-h">Reliability</h3>
            <div className="eb-split">
              <ul className="eb-components">
                {s.components.map((c) => (
                  <li key={c.id}>
                    <span className="eb-comp-name">{c.label}</span>
                    <span className={`eb-state is-${c.state}`}>
                      <span className="eb-dot" aria-hidden="true" />
                      {c.state}
                    </span>
                    <span className="eb-comp-note">{c.note}</span>
                  </li>
                ))}
              </ul>

              <div className="eb-grid eb-grid-2">
                <Metric variant="stat"
                  value={`${s.errorRatePct.toFixed(1)}%`}
                  note={`${s.errorsThisHour} rejected this hour`}
                  label="Error rate"
                />
                <Metric variant="stat"
                  value={`${s.metadataCoveragePct.toFixed(0)}%`}
                  note="of scored tokens"
                  label="Metadata"
                />
                <Metric variant="stat"
                  value={compact(s.discovered)}
                  note="this session"
                  label="Discovered"
                />
                <Metric variant="stat"
                  value={compact(s.labelled)}
                  note="outcome recorded"
                  label="Labelled"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="eb-bar"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="eb-items">
          <Metric as="span" variant="inline" className="eb-metric" label="Detected" value={v((x) => `${compact(x.processedPerHour)}/h`)} />
          <Metric as="span" variant="inline" className="eb-metric" label="Scored" value={v((x) => `${x.scoredPerHour.toFixed(1)}/h`)} />
          <Metric as="span" variant="inline" className="eb-metric" label="Selectivity" value={v((x) => `${x.selectivityPct.toFixed(2)}%`)} />
          <Metric as="span" variant="inline" className="eb-metric" label="Errors" value={v((x) => `${x.errorRatePct.toFixed(1)}%`)} />
          <Metric as="span" variant="inline" className="eb-metric" label="Metadata" value={v((x) => `${x.metadataCoveragePct.toFixed(0)}%`)} />
          <Metric as="span" variant="inline" className="eb-metric" label="Uptime" value={v((x) => `${x.uptimeHours.toFixed(1)}h`)} />
        </span>

        <span className={`eb-status ${statusKelas}`}>
          <span className="eb-dot" aria-hidden="true" />
          {statusTeks}
          <ChevronIcon flipped={open} />
        </span>
      </button>
    </footer>
  )
}

/* A2: `Metric` & `Stat` lokal dihapus → komponen bersama `@/components/Metric` (varian `inline` & `stat`). */

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      viewBox="0 0 10 6"
      width="9"
      height="6"
      fill="none"
      aria-hidden="true"
      style={flipped ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path d="m1 1 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
