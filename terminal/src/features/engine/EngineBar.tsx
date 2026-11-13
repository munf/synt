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
                title={INFO_DETECTED}
              />
              <Metric variant="stat"
                value={s.scoredPerHour.toFixed(1)}
                note="tokens / hour"
                // U24: = `scored_per_hour` bar (audit penuh gate-2, bukan AI; synt-dash api.rs) → kata yang sama dgn bar
                label="Scored"
                tone="is-accent"
                title={INFO_SCORED}
              />
              <Metric variant="stat"
                value={`${s.selectivityPct.toFixed(2)}%`}
                note="pass screening"
                label="Selectivity"
                title={INFO_SELECTIVITY}
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
                {/* U24: dulu "Errors"/"Metadata" juga di bar; kini hanya di sini, berlabel apa yang diukur (synt-dash api.rs
                    `overview`). B15 (synt-dash ce3eab0, 8 Nov): `cost.rpc_calls_this_hour` = getblock_rpc + shyft_rpc jam
                    berjalan. 0 panggilan (mis. awal jam) → "—" + "No RPC calls recorded this hour", BUKAN "0.0%";
                    `cost` tak dikirim (permintaan publik lewat Caddy membuang field internal) → tile dilepas.
                    B16 (ce3eab0): `metadata_coverage_pct` hanya menghitung `v10_meta.diambil IS TRUE` → "found" akurat. */}
                {s.rpcCallsThisHour !== null && (
                  <Metric variant="stat"
                    value={s.rpcCallsThisHour > 0 ? `${s.errorRatePct.toFixed(1)}%` : null}
                    note={s.rpcCallsThisHour > 0
                      ? `${s.errorsThisHour} of ${s.rpcCallsThisHour.toLocaleString('en-US')} ${s.rpcCallsThisHour === 1 ? 'call' : 'calls'} failed this hour`
                      : 'No RPC calls recorded this hour'}
                    label="RPC error rate"
                    title={INFO_RPC}
                  />
                )}
                <Metric variant="stat"
                  value={`${s.metadataCoveragePct.toFixed(0)}%`}
                  note="of scored tokens"
                  label="Metadata found"
                  title={INFO_METADATA}
                />
                <Metric variant="stat"
                  value={compact(s.discovered)}
                  note="since this engine version"
                  label="Discovered"
                  title={INFO_DISCOVERED}
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
        {/* ⭐ U24 (audit 7 Nov): kosakata & urutan slot = footer BNB (Detected · Scored · …). "Errors" & "Metadata" (jargon
            internal: galat RPC penyedia data, cakupan metadata) TIDAK dihapus: pindah ke panel rincian (Reliability) yang
            dibuka bar ini, dgn label & catatan yang menjelaskan. Penjelasan bar lewat `title` (bar = <button>, popover
            ketuk tak boleh bersarang di dalamnya; di layar sentuh ketuk bar membuka rincian). */}
        <span className="eb-items">
          <Metric as="span" variant="inline" className="eb-metric" label="Detected" value={v((x) => `${compact(x.processedPerHour)}/h`)} title={INFO_DETECTED} />
          <Metric as="span" variant="inline" className="eb-metric" label="Scored" value={v((x) => `${x.scoredPerHour.toFixed(1)}/h`)} title={INFO_SCORED} />
          <Metric as="span" variant="inline" className="eb-metric" label="Selectivity" value={v((x) => `${x.selectivityPct.toFixed(2)}%`)} title={INFO_SELECTIVITY} />
          <Metric as="span" variant="inline" className="eb-metric" label="Uptime" value={v((x) => `${x.uptimeHours.toFixed(1)}h`)} title={INFO_UPTIME} />
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

/* U24: penjelas metrik footer (title). Arti dicek di synt-dash api.rs `overview` (putaran 2, Reviewer): `uptime_hours` &
   laju per jam dihitung sejak `cohort` = mtime binary synt-v10 (synt-v10 config.rs, synt-dash `cohort_aktif`), BUKAN
   waktu restart: restart tanpa ganti kode tak mengatur ulang, jadi rentangnya bisa memuat waktu mati. Selectivity = lolos
   penyaringan ÷ disaring (tak semua yang lolos akhirnya dinilai). Discovered = `v10_coin` sejak cohort yang sama. */
const INFO_DETECTED = 'New pump.fun pairs the engine screened per hour, averaged since the current engine version was built.'
const INFO_SCORED = 'Pairs per hour that got a full synt audit score, averaged since the current engine version was built.'
const INFO_SELECTIVITY = 'Share of screened pairs that pass screening. Pairs are scored only after passing it.'
const INFO_UPTIME = 'Hours since the current engine version was built. A restart without a code change does not reset it, so this can include downtime. The per-hour figures are averages over this time.'
const INFO_RPC = 'Share of this hour’s calls to the Solana data provider (RPC) that failed.'
const INFO_METADATA = 'Share of scored tokens whose metadata (name, symbol, image and links) the engine fetched.'
const INFO_DISCOVERED = 'New pairs the engine detected since the current engine version was built.'

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
