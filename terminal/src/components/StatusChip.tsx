import { InfoPopover } from './Popover'
import './StatusChip.css'

/**
 * Chip status bersama (A2, DESIGN-TERMINAL §2): TREND Solana (Held/Climbed/Fell), Authority, outcome BNB
 * (Rug/Dead/Survived/Winner/Open), tag Graduated, dan slot K2 (self-graduation "Creator-filled", klon "Clone ×N").
 * Dulu `TrendCell` (TrenchesTable) & `OutcomeChip` (BnbParts) dua implementasi dgn gaya kembar (`.tt-flag` vs
 * `.bnb-out`). Tinggi `--chip-h` 20px.
 *
 * `info` → chip jadi pemicu popover ketuk (definisi outcome / arti TREND); dulu hanya `title`, tak terjangkau sentuh.
 * ⚠️ Label & kosakata TIDAK diubah di sini (keputusan pemilik DESIGN §6 masih terbuka); pemanggil memberi teksnya.
 */
export type NadaChip = 'ok' | 'bad' | 'warn' | 'neutral' | 'muted' | 'open'

export function StatusChip({
  label,
  tone,
  prefix,
  info,
  variant = 'fill',
  className = '',
}: {
  label: string
  tone: NadaChip
  /** Awalan redup, mis. "90m" (jendela outcome BNB). */
  prefix?: string
  /** Penjelasan yang dibuka dgn ketuk. */
  info?: string
  /** `outline` = tag bergaris (Graduated, Creator-filled, Clone). */
  variant?: 'fill' | 'outline'
  className?: string
}) {
  const chip = (
    <span className={`chip chip-${variant} is-${tone} ${className}`}>
      {prefix && <span className="chip-prefix">{prefix} · </span>}
      {label}
    </span>
  )
  if (!info) return chip
  return (
    <InfoPopover info={info} label={label} className="chip-trigger">
      {chip}
    </InfoPopover>
  )
}

/* ── Chip yang sama di kedua chain (K2 menyediakan datanya; kini hanya Graduated yang punya sumber) ── */

export function GraduatedChip() {
  return <StatusChip label="Graduated" tone="ok" variant="outline" info="Left the bonding curve for a DEX pair." />
}

/** K2: flag self-graduation (creator mengisi kurva sendiri). Belum ada di API: dirender hanya bila datanya ada. */
export function SelfGradChip() {
  return (
    <StatusChip
      label="Creator-filled"
      tone="warn"
      variant="outline"
      info="The creator's own wallets bought the curve out to graduate it."
    />
  )
}

/** K2: nama/simbol kembar dgn launch lain. Belum ada di API: dirender hanya bila datanya ada. */
export function CloneChip({ n }: { n: number }) {
  return (
    <StatusChip
      label={`Clone ×${n}`}
      tone="warn"
      variant="outline"
      info={`${n} other launches used the same name or symbol.`}
    />
  )
}
