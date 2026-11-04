import { usePreferensi } from '@/features/account/sinkron'
import './SidePanels.css'

/**
 * Pengaturan quick buy — jumlah default, slippage, priority fee.
 *
 * ⭐ 3 Nov: jumlah default BNB sendiri (`synt.quickbuy.bnbAmount`); slippage & "Confirm" dipakai kedua chain.
 * ⭐ 2 Nov: dipakai transaksi NYATA — tombol Buy di Trenches membeli "Default amount", dan panel trading di
 * halaman token memakai slippage, priority fee & "Confirm" yang sama (ikut akun lewat `usePreferensi`).
 */
export function QuickBuyPanel() {
  const [amount, setAmount] = usePreferensi('synt.quickbuy.amount', 0.5)
  const [bnbAmount, setBnbAmount] = usePreferensi('synt.quickbuy.bnbAmount', 0.05)
  const [slippage, setSlippage] = usePreferensi('synt.quickbuy.slippage', 15)
  const [priority, setPriority] = usePreferensi('synt.quickbuy.priority', 0.001)
  const [confirm, setConfirm] = usePreferensi('synt.quickbuy.confirm', true)

  return (
    <div className="sp">
      <Field
        label="Default amount on Solana"
        hint="Used by the Buy button on Solana rows."
      >
        <div className="sp-presets">
          {[0.1, 0.5, 1, 2, 5].map((v) => (
            <button
              key={v}
              type="button"
              className={`sp-preset ${amount === v ? 'is-active' : ''}`}
              onClick={() => setAmount(v)}
            >
              {v} SOL
            </button>
          ))}
        </div>
        <input
          type="number"
          className="sp-input"
          value={amount}
          min={0}
          step={0.1}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label="Custom amount in SOL"
        />
      </Field>

      <Field label="Default amount on BNB Chain" hint="Used by the Buy button on BNB rows.">
        <div className="sp-presets">
          {[0.01, 0.05, 0.1, 0.5].map((v) => (
            <button
              key={v}
              type="button"
              className={`sp-preset ${bnbAmount === v ? 'is-active' : ''}`}
              onClick={() => setBnbAmount(v)}
            >
              {v} BNB
            </button>
          ))}
        </div>
        <input
          type="number"
          className="sp-input"
          value={bnbAmount}
          min={0}
          step={0.01}
          onChange={(e) => setBnbAmount(Number(e.target.value))}
          aria-label="Custom amount in BNB"
        />
      </Field>

      <Field
        label="Slippage tolerance"
        hint="New pairs move fast; too low and the transaction fails."
      >
        <div className="sp-row">
          <input
            type="range"
            min={1}
            max={50}
            value={slippage}
            onChange={(e) => setSlippage(Number(e.target.value))}
            aria-label="Slippage percent"
          />
          <span className="sp-value">{slippage}%</span>
        </div>
      </Field>

      <Field label="Priority fee (Solana)" hint="Higher fee, faster inclusion. On BNB Chain your wallet sets gas.">
        <div className="sp-row">
          <input
            type="number"
            className="sp-input"
            value={priority}
            min={0}
            step={0.0001}
            onChange={(e) => setPriority(Number(e.target.value))}
            aria-label="Priority fee in SOL"
          />
          <span className="sp-value">SOL</span>
        </div>
      </Field>

      <label className="sp-check">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
        />
        <span>
          Ask for confirmation before buying
          <em>Off: the Buy button goes straight to your wallet for signing, without the review step.</em>
        </span>
      </label>

      <p className="sp-note">
        Saved with your account when you are signed in. Every trade is still signed in your own wallet, and the
        token page uses the same slippage and priority fee.
      </p>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="sp-field">
      <div className="sp-label">{label}</div>
      {hint && <p className="sp-hint">{hint}</p>}
      {children}
    </div>
  )
}
