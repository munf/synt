import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { akunApi, masukDenganWallet, AkunGalat, type AkunProfil, type Dompet } from './akun'
import { mulaiSinkron, hentikanSinkron } from './sinkron'

/**
 * Status akun untuk seluruh terminal. Dipasang SEKALI di AppShell.
 *
 * `tak_tersedia` dibedakan dari `tamu`: build yang belum punya synt-akun di
 * belakangnya (rute /api/akun tak ada) tak boleh menampilkan tombol login yang
 * pasti gagal — ia menampilkan "belum tersedia", bukan galat setiap klik.
 */
export type StatusAkun = 'memuat' | 'tamu' | 'masuk' | 'tak_tersedia'

interface NilaiAkun {
  status: StatusAkun
  profil: AkunProfil | null
  masuk: (d: Dompet) => Promise<void>
  keluar: () => Promise<void>
  /** galat DILEMPAR (beda dgn keluar): akun yang gagal dihapus tak boleh tampak terhapus */
  hapus: () => Promise<void>
  ganti: (p: AkunProfil) => void
}

const Konteks = createContext<NilaiAkun | null>(null)

export function AkunProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StatusAkun>('memuat')
  const [profil, setProfil] = useState<AkunProfil | null>(null)

  useEffect(() => {
    let hidup = true
    akunApi
      .saya()
      .then((p) => {
        if (!hidup) return
        // 204 (belum masuk) → badan kosong
        setProfil(p ?? null)
        setStatus(p ? 'masuk' : 'tamu')
        if (p?.wallet) void mulaiSinkron(p.wallet)
      })
      .catch((e) => {
        if (!hidup) return
        setStatus(e instanceof AkunGalat && e.status === 401 ? 'tamu' : 'tak_tersedia')
      })
    return () => {
      hidup = false
    }
  }, [])

  const masuk = useCallback(async (d: Dompet) => {
    const p = await masukDenganWallet(d)
    setProfil(p)
    setStatus('masuk')
    if (p.wallet) void mulaiSinkron(p.wallet)
  }, [])

  const keluar = useCallback(async () => {
    await akunApi.keluar().catch(() => undefined)
    hentikanSinkron()
    setProfil(null)
    setStatus('tamu')
  }, [])

  const hapus = useCallback(async () => {
    await akunApi.hapus()
    hentikanSinkron()
    setProfil(null)
    setStatus('tamu')
  }, [])

  const ganti = useCallback((p: AkunProfil) => setProfil(p), [])

  const nilai = useMemo(() => ({ status, profil, masuk, keluar, hapus, ganti }), [status, profil, masuk, keluar, hapus, ganti])
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>
}

export function useAkun(): NilaiAkun {
  const k = useContext(Konteks)
  if (!k) throw new Error('useAkun dipakai di luar AkunProvider')
  return k
}

/** Nama yang ditampilkan: nama tampilan → @handle → alamat pendek. */
export function namaTampil(p: AkunProfil): string {
  return p.displayName || (p.handle ? `@${p.handle}` : p.walletShort)
}

/** "Joined Nov 2026" dari ISO. */
export function bergabung(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `Joined ${d.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`
}
