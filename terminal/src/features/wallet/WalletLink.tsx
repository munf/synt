import { Link } from 'react-router-dom'
import { alamatPendek } from '@/lib/format'

/** Tautan alamat → wallet tracker (Leaderboard creator, Top holders halaman token). */
export function WalletLink({ addr, children, className = '' }: { addr: string; children?: React.ReactNode; className?: string }) {
  return (
    <Link to={`/wallet/${addr}`} className={className} title={`Open ${addr} in the wallet tracker`}>
      {children ?? alamatPendek(addr)}
    </Link>
  )
}
