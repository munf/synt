import { Link } from 'react-router-dom'
import { TabelPosisi } from '@/features/trade/Posisi'
import { WalletForm } from './WalletLookup'
import '@/features/trenches/SidePanels.css'
import './Wallet.css'

/**
 * Isi drawer wallet tracker & portfolio.
 *
 * Drawer sengaja RINGKAS — untuk melirik saat sedang melihat tabel. Yang
 * mendalam ada di halaman penuh, dan tombol di kaki drawer menuju ke sana.
 */

/**
 * ⭐ Butir 8 (B2): drawer tracker = form alamat NYATA → `/wallet/:addr` (dulu daftar wallet & trade contoh).
 * Cakupan ditulis singkat di sini; rinciannya di halaman.
 */
export function TrackerDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="sp">
      <div className="sp-field">
        <div className="sp-label">Look up a wallet</div>
        <WalletForm compact autoFocus onGo={onClose} />
      </div>
      <p className="sp-note">
        Shows tokens a wallet launched and pairs where it was a top 20 holder when synt audited them. Not a trade
        history or profit and loss.
      </p>
      <Link to="/wallet-tracker" className="wl-open" onClick={onClose}>
        Open wallet tracker →
      </Link>
    </div>
  )
}

export function PortfolioDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="sp">
      {/* 2 Nov: posisi NYATA dari trading lewat synt (dulu data contoh) */}
      <TabelPosisi ringkas onBuka={onClose} />
      <Link to="/portfolio" className="wl-open" onClick={onClose}>
        Open portfolio →
      </Link>
    </div>
  )
}
