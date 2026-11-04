import { useRef } from 'react'
import './ChainSwitch.css'

export type Chain = 'sol' | 'bnb'

const CHAINS: Array<{ id: Chain; label: string; hint: string }> = [
  { id: 'sol', label: 'SOL', hint: 'Solana, pump.fun launches' },
  { id: 'bnb', label: 'BNB', hint: 'BNB Chain, Flap and four.meme launches' },
]

/**
 * Pilihan chain Trenches (butir 14). Pola radiogroup ARIA sama dgn ViewBar: hanya pilihan aktif di urutan Tab,
 * panah memindah & memilih. Dirender dua kali oleh TrenchesRoute (kepala tabel di layar lebar, ViewBar di ≤1100px);
 * state-nya satu (`synt.trenches.chain`).
 */
export function ChainSwitch({ chain, onChange, caption = false }: {
  chain: Chain
  onChange: (c: Chain) => void
  /** Tampilkan keterangan chain di sebelahnya (kepala tabel layar lebar). */
  caption?: boolean
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const pindah = (e: React.KeyboardEvent, i: number) => {
    let j: number | null = null
    if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) j = 1 - i
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = 1
    if (j === null) return
    e.preventDefault()
    onChange(CHAINS[j]!.id)
    refs.current[j]?.focus()
  }
  const aktif = CHAINS.find((c) => c.id === chain) ?? CHAINS[0]!

  return (
    <div className="tcs">
      <div className="tcs-seg" role="radiogroup" aria-label="Chain">
        {CHAINS.map((c, i) => (
          <button
            key={c.id}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={chain === c.id}
            tabIndex={chain === c.id ? 0 : -1}
            className={`tcs-opt ${chain === c.id ? 'is-active' : ''}`}
            title={c.hint}
            onClick={() => onChange(c.id)}
            onKeyDown={(e) => pindah(e, i)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {caption && <span className="tcs-caption">{aktif.hint}</span>}
    </div>
  )
}
