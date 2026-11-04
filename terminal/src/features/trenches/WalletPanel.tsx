import './SidePanels.css'

/**
 * Panel wallet.
 *
 * ⬜ KERANGKA: belum ada koneksi wallet sungguhan. PRODUK.md §2 mencatat
 * backend akun belum ada sama sekali, jadi yang ditampilkan di sini adalah
 * bentuk akhirnya — bukan keadaan tersambung yang dipalsukan.
 *
 * Sengaja TIDAK menampilkan saldo palsu: angka saldo yang salah adalah satu
 * hal yang benar-benar bisa membuat orang kehilangan uang kalau kerangka ini
 * suatu saat dikira nyata.
 */
export function WalletPanel() {
  const wallets = [
    { id: 'phantom', name: 'Phantom', hint: 'Most common on Solana' },
    { id: 'solflare', name: 'Solflare', hint: null },
    { id: 'backpack', name: 'Backpack', hint: null },
  ]

  return (
    <div className="sp">
      <div className="sp-empty">
        <WalletGlyph />
        <h3>No wallet connected</h3>
        <p>Connect a wallet to trade directly from the terminal.</p>
      </div>

      <div className="sp-field">
        <div className="sp-label">Available wallets</div>
        <div className="sp-list">
          {wallets.map((w) => (
            <button key={w.id} type="button" className="sp-item" disabled>
              <span className="sp-item-main">
                <span className="sp-item-name">{w.name}</span>
                {w.hint && <span className="sp-item-hint">{w.hint}</span>}
              </span>
              <span className="sp-item-tag">Soon</span>
            </button>
          ))}
        </div>
      </div>

      <p className="sp-note">
        Wallet connection is not part of this preview.
      </p>
    </div>
  )
}

function WalletGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" aria-hidden="true">
      <rect x="6" y="12" width="36" height="26" rx="5" stroke="currentColor" strokeWidth="2" />
      <path d="M33 25.5h4.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6 18c0-3 2-5 5-5h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
