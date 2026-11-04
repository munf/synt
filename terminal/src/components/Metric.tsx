import { InfoPopover } from './Popover'
import './Metric.css'

/**
 * SATU komponen metrik (A2, DESIGN-TERMINAL §2): label (`.t-micro`) + nilai (mono) + catatan rentang/sumber.
 * Menggantikan `Metric` ×3 (CoinDetailView, BnbPanel, EngineBar) & `Stat` ×3 (CoinDetailView, EngineBar,
 * ProfileView) yang dulu ditulis terpisah, sehingga SOL & BNB menampilkan tile yang sama persis.
 *
 * ⛔ Tak terukur = "—" (--mute-2), TIDAK PERNAH 0. Bila `why` diberikan, "—" bisa diketuk (InfoPopover) dan
 * menjelaskan sebabnya; `title` saja tak terjangkau di layar sentuh.
 *
 * Varian (tampilan per konteks, tipografi sama):
 * · `tile`   kotak bergaris: panel Trenches SOL & BNB, kartu Market /bnb
 * · `plain`  tanpa kotak (kotak/ukuran dari kelas induk): strip header & kartu Market /coin
 * · `inline` label + nilai sebaris: footer engine
 * · `stat`   label, nilai besar, catatan di bawah: panel detail engine
 * · `count`  nilai lalu label sebaris ("12 Followers"): profil
 */
export type VarianMetric = 'tile' | 'plain' | 'inline' | 'stat' | 'count'

const KOSONG = '—'

export function Metric({
  label,
  value,
  note,
  delta,
  tone,
  why,
  title,
  variant = 'tile',
  as: Tag = 'div',
  className = '',
}: {
  label: React.ReactNode
  /** Teks nilai yang sudah diformat; null / "—" = tak terukur. */
  value: string | null
  /** Rentang / sumber ("first 10 min", "at audit"). tile/plain: sebaris dgn label; stat: di bawah nilai. */
  note?: React.ReactNode
  /** Elemen di sebelah nilai (mis. perubahan persen). */
  delta?: React.ReactNode
  /** Kelas warna nilai (`is-up`, `is-down`, `is-accent`). */
  tone?: string
  /** Sebab nilai kosong, ditampilkan lewat popover ketuk pada "—". */
  why?: string
  /** Tooltip tambahan utk nilai yang ADA (mis. umur harga basi). Informasi penting jangan hanya di sini. */
  title?: string
  variant?: VarianMetric
  /** `span` bila diletakkan di dalam <button> (footer engine). */
  as?: 'div' | 'span'
  className?: string
}) {
  const kosong = value === null || value === KOSONG
  const labelLabel = typeof label === 'string' ? label : undefined
  const nilai = kosong ? (
    why ? (
      <InfoPopover info={why} label={labelLabel}>{KOSONG}</InfoPopover>
    ) : (
      KOSONG
    )
  ) : (
    value
  )
  const catatanBawah = variant === 'stat'

  return (
    <Tag className={`mt mt-${variant} ${className}`} title={kosong ? undefined : title}>
      <span className="mt-label">
        {label}
        {note && !catatanBawah && <> <span className="mt-note">{note}</span></>}
      </span>
      <span className="mt-row">
        <span className={`mt-value ${kosong ? 'is-empty' : (tone ?? '')}`}>{nilai}</span>
        {!kosong && delta}
      </span>
      {note && catatanBawah && <span className="mt-caption">{note}</span>}
    </Tag>
  )
}
