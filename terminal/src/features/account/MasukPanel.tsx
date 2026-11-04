import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { WALLET_DIKENAL, dompetTerdeteksi, AkunGalat, type Dompet } from './akun'
import { useAkun, namaTampil } from './useAkun'
import '@/features/trenches/SidePanels.css'

/**
 * Isi drawer "Wallet" di menu akun: login dgn wallet Solana, atau keadaan masuk.
 * Dua kelompok: Solana (Wallet Standard + global lama; wallet terkenal yang belum terpasang = tautan "Get")
 * dan EVM (EIP-6963, alamat 0x). MetaMask bisa muncul di keduanya: alamat Solana & 0x = dua akun terpisah.
 *
 * ⚠️ Copy menyebut tegas bahwa yang diminta adalah TANDA TANGAN PESAN, bukan
 * transaksi. Itu pembeda yang dicari pengguna sebelum menyetujui apa pun di
 * wallet-nya, dan pola penipuan "connect wallet" justru mengaburkannya.
 */
export function MasukPanel({ onSelesai }: { onSelesai?: () => void }) {
  const { status, profil, masuk, keluar } = useAkun()
  const [proses, setProses] = useState<string | null>(null)
  const ada = useSyncExternalStore(dompetTerdeteksi.langgan, dompetTerdeteksi.ambil)
  const sol = ada.filter((d) => d.rantai === 'solana')
  const evm = ada.filter((d) => d.rantai === 'evm')
  const [galat, setGalat] = useState<string | null>(null)

  if (status === 'memuat') {
    return <div className="sp"><p className="sp-hint">Checking your session…</p></div>
  }

  if (status === 'tak_tersedia') {
    return (
      <div className="sp">
        <div className="sp-empty">
          <h3>Accounts are not available yet</h3>
          <p>Wallet sign-in is not open on this version of the terminal.</p>
        </div>
      </div>
    )
  }

  if (status === 'masuk' && profil) {
    return (
      <div className="sp">
        <div className="sp-empty">
          <h3>Signed in as {namaTampil(profil)}</h3>
          <p className="sp-mono">{profil.walletShort}</p>
        </div>
        <div className="sp-list">
          <Link className="sp-item" to="/me" onClick={onSelesai}>
            <span className="sp-item-main"><span className="sp-item-name">My profile</span></span>
          </Link>
          <button type="button" className="sp-item" onClick={() => keluar().then(onSelesai)}>
            <span className="sp-item-main"><span className="sp-item-name">Sign out</span></span>
          </button>
        </div>
      </div>
    )
  }

  const pilih = async (d: Dompet) => {
    setGalat(null)
    setProses(d.id)
    try {
      await masuk(d)
      onSelesai?.()
    } catch (e) {
      setGalat(e instanceof AkunGalat ? e.message : 'Sign-in failed. Try again.')
    } finally {
      setProses(null)
    }
  }

  return (
    <div className="sp">
      <div className="sp-field">
        <div className="sp-label">Sign in with your wallet</div>
        <p className="sp-hint">
          Your wallet will ask you to sign a short message. It is not a transaction, it moves no funds and it costs
          nothing.
        </p>
      </div>

      <div className="sp-rantai">Solana</div>
      <div className="sp-list">
        {sol.map((d) => (
          <TombolDompet key={d.id} d={d} proses={proses} onPilih={pilih} />
        ))}
        {WALLET_DIKENAL.filter((k) => !sol.some((d) => d.id === k.id)).map((k) => (
          <a key={k.id} className="sp-item" href={k.pasang} target="_blank" rel="noreferrer">
            <span className="sp-item-main">
              <span className="sp-item-name">{k.nama}</span>
              <span className="sp-item-hint">Not installed</span>
            </span>
            <span className="sp-item-tag">Get</span>
          </a>
        ))}
      </div>

      <div className="sp-rantai">BNB Chain · EVM</div>
      {evm.length > 0 ? (
        <div className="sp-list">
          {evm.map((d) => (
            <TombolDompet key={d.id} d={d} proses={proses} onPilih={pilih} />
          ))}
        </div>
      ) : (
        <p className="sp-hint">No EVM wallet found in this browser. MetaMask works for both.</p>
      )}

      <p className="sp-note">
        A Solana address and a 0x address sign in to two separate synt accounts, even inside the same wallet.
      </p>

      {galat && (
        <p className="sp-galat" role="alert">
          {galat}
        </p>
      )}

      <p className="sp-note">
        On a phone, open this page in your wallet app's browser. synt never asks for your seed phrase or private
        key.
      </p>
      <p className="sp-note">
        By signing in you agree to the{' '}
        <Link to="/terms" onClick={onSelesai}>Terms of Use</Link> and the{' '}
        <Link to="/privacy" onClick={onSelesai}>Privacy Policy</Link>.
      </p>
    </div>
  )
}

function TombolDompet({ d, proses, onPilih }: { d: Dompet; proses: string | null; onPilih: (d: Dompet) => void }) {
  return (
    <button type="button" className="sp-item" disabled={proses !== null} onClick={() => onPilih(d)}>
      {d.ikon && <img className="sp-item-ikon" src={d.ikon} alt="" width={24} height={24} />}
      <span className="sp-item-main">
        <span className="sp-item-name">{d.nama}</span>
        <span className="sp-item-hint">{proses === d.id ? 'Waiting for signature…' : 'Detected'}</span>
      </span>
    </button>
  )
}
