import { useParams } from 'react-router-dom'
import { TabelPosisi } from '@/features/trade/Posisi'
import { WalletLookup } from '@/features/wallet/WalletLookup'
import '@/features/wallet/Wallet.css'

/**
 * Wallet tracker — `/wallet-tracker` (form) & `/wallet/:addr` (hasil).
 *
 * ⭐ Butir 8 (B2, 27 Okt): NYATA di kedua build (synt-dash `/api/wallet`), read-only, tanpa wallet connect. Dulu
 * tabel wallet "Whale #1" & trade contoh: bentuk itu butuh riwayat trade per wallet yang tak ada di v10, jadi
 * diganti dgn apa yang mesin synt benar-benar lihat (lihat `features/wallet/WalletLookup.tsx`).
 */
export function WalletTrackerRoute() {
  const { addr } = useParams()
  return <WalletLookup addr={addr} />
}

/**
 * Portfolio — `/portfolio`.
 *
 * ⭐ 2 Nov: posisi NYATA dari transaksi akun lewat synt (non-custodial): saldo on-chain, modal & hasil dari
 * perubahan saldo wallet yang tercatat, nilai dari harga Jupiter. Data contoh (`mockPositions`) tak dipakai lagi.
 */
export function PortfolioRoute() {
  return (
    <section className="page">
      <div className="wp">
        <header className="wp-head">
          <div>
            <h1 className="wp-title">Portfolio</h1>
            <p className="wp-sub">Positions from trades you made on synt, valued at the latest price.</p>
          </div>
        </header>
        <div className="wp-card">
          <TabelPosisi />
        </div>
      </div>
    </section>
  )
}
