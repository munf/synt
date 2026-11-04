import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ProfileView } from '@/features/account/ProfileView'
import { MasukPanel } from '@/features/account/MasukPanel'
import { akunApi, AkunGalat, type AkunProfil } from '@/features/account/akun'
import { useAkun, namaTampil, bergabung } from '@/features/account/useAkun'
import type { Profile } from '@/features/account/types'
import '@/features/account/Account.css'

/**
 * Profil — `/me` (sendiri) & `/profile/:handle` (orang lain).
 *
 * ⭐ 1 Nov: data NYATA dari synt-akun (login wallet Solana). Follow & angka pengikut sejak tahap C;
 * posts/audits belum punya sumber, jadi tak ditampilkan — bukan diisi angka contoh.
 */
function keTampilan(p: AkunProfil): Profile {
  return {
    handle: p.handle ? `@${p.handle}` : 'No handle yet',
    displayName: namaTampil(p),
    avatar: null,
    bio: p.bio ?? '',
    joined: bergabung(p.joined),
    walletShort: p.walletShort,
    verified: false,
    // angka follow nyata (tahap C); posts/audits belum punya sumber → tak ditampilkan
    stats: p.followers != null && p.following != null ? { followers: p.followers, following: p.following } : undefined,
  }
}

export function MyProfileRoute() {
  const { status, profil } = useAkun()
  const [sunting, setSunting] = useState(false)

  if (status === 'memuat') return <section className="page" />

  if (status !== 'masuk' || !profil) {
    return (
      <section className="page">
        <div className="ac">
          <div className="ac-card">
            <h1 className="ac-section-title">Your profile</h1>
            <div className="ac-pad">
              <MasukPanel />
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="page">
      {sunting ? (
        <FormProfil profil={profil} onSelesai={() => setSunting(false)} />
      ) : (
        <ProfileView profile={keTampilan(profil)} isMe onEdit={() => setSunting(true)} />
      )}
    </section>
  )
}

function FormProfil({ profil, onSelesai }: { profil: AkunProfil; onSelesai: () => void }) {
  const { ganti } = useAkun()
  const [handle, setHandle] = useState(profil.handle ?? '')
  const [nama, setNama] = useState(profil.displayName ?? '')
  const [bio, setBio] = useState(profil.bio ?? '')
  const [simpan, setSimpan] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault()
    setGalat(null)
    setSimpan(true)
    try {
      // handle kosong = tak diubah (handle tak bisa dihapus, hanya diganti)
      const baru = await akunApi.ubah({
        ...(handle.trim() ? { handle } : {}),
        displayName: nama,
        bio,
      })
      ganti(baru)
      onSelesai()
    } catch (err) {
      setGalat(err instanceof AkunGalat ? err.message : 'Could not save. Try again.')
    } finally {
      setSimpan(false)
    }
  }

  return (
    <div className="ac">
      <form className="ac-card" onSubmit={kirim} noValidate>
        <h1 className="ac-section-title">Edit profile</h1>
        <div className="ac-pad ac-form">
          <label className="ac-field">
            <span className="ac-label">Handle</span>
            <input
              className="ac-input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="your_handle"
              maxLength={21}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="ac-hint">3 to 20 characters: letters, numbers and underscores.</span>
          </label>
          <label className="ac-field">
            <span className="ac-label">Display name</span>
            <input className="ac-input" value={nama} onChange={(e) => setNama(e.target.value)} maxLength={40} />
          </label>
          <label className="ac-field">
            <span className="ac-label">Bio</span>
            <textarea
              className="ac-input ac-textarea"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
            />
            {/* hitung karakter (code point) seperti server, bukan unit UTF-16: emoji = 1 */}
            <span className="ac-hint">{[...bio].length} / 160</span>
          </label>
          <p className="ac-hint">
            Wallet {profil.walletShort} · your full address is never shown on your public profile.{' '}
            <Link to="/privacy">Privacy Policy</Link>
          </p>
          {galat && (
            <p className="ac-galat" role="alert">
              {galat}
            </p>
          )}
          <div className="ac-form-aksi">
            <button type="button" className="ac-btn" onClick={onSelesai} disabled={simpan}>
              Cancel
            </button>
            <button type="submit" className="ac-btn is-primary" disabled={simpan}>
              {simpan ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
      <HapusAkun />
    </div>
  )
}

/**
 * Hapus akun mandiri — janji halaman Privacy (§9). Konfirmasi DI HALAMAN, dua langkah:
 * confirm() bawaan browser bisa dimatikan pengguna/penampil, dan penghapusan ini tak bisa dibatalkan.
 */
function HapusAkun() {
  const { hapus } = useAkun()
  const pindah = useNavigate()
  const [yakin, setYakin] = useState(false)
  const [proses, setProses] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  const jalankan = async () => {
    setGalat(null)
    setProses(true)
    try {
      await hapus()
      pindah('/trenches', { replace: true })
    } catch (err) {
      setGalat(err instanceof AkunGalat ? err.message : 'Could not delete your account. Try again.')
      setProses(false)
    }
  }

  return (
    <div className="ac-card">
      <h2 className="ac-section-title">Delete account</h2>
      <div className="ac-pad ac-form">
        <p className="ac-hint">
          Removes your profile, watchlist, follows, alerts, settings and every session right away. Your handle is held for 30 days,
          then anyone can take it. This cannot be undone. Signing in again later with the same wallet starts a new,
          empty account.
        </p>
        {galat && (
          <p className="ac-galat" role="alert">
            {galat}
          </p>
        )}
        <div className="ac-form-aksi">
          {yakin ? (
            <>
              <button type="button" className="ac-btn" onClick={() => setYakin(false)} disabled={proses}>
                Keep my account
              </button>
              <button type="button" className="ac-btn is-bahaya" onClick={jalankan} disabled={proses}>
                {proses ? 'Deleting…' : 'Yes, delete it'}
              </button>
            </>
          ) : (
            <button type="button" className="ac-btn is-bahaya" onClick={() => setYakin(true)}>
              Delete account
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProfileRoute() {
  const { handle } = useParams<{ handle: string }>()
  const akun = useAkun()
  const pindah = useNavigate()
  const [galatIkuti, setGalatIkuti] = useState<string | null>(null)
  const [profil, setProfil] = useState<AkunProfil | null>(null)
  const [keadaan, setKeadaan] = useState<'memuat' | 'ada' | 'tak_ada' | 'galat'>('memuat')

  useEffect(() => {
    if (!handle) return
    let hidup = true
    setKeadaan('memuat')
    akunApi
      .profil(handle)
      .then((p) => {
        if (!hidup) return
        setProfil(p)
        setKeadaan('ada')
      })
      .catch((e) => hidup && setKeadaan(e instanceof AkunGalat && e.status === 404 ? 'tak_ada' : 'galat'))
    return () => {
      hidup = false
    }
    // status akun ikut: setelah masuk/keluar, `isFollowing` berubah
  }, [handle, akun.status])

  const sendiri = akun.profil?.handle != null && akun.profil.handle === profil?.handle
  const bisaIkuti = akun.status === 'masuk' && !sendiri && profil?.handle != null

  const toggleIkuti = async () => {
    if (!profil?.handle) return
    const ikut = !profil.isFollowing
    setGalatIkuti(null)
    // optimistis; dikembalikan bila server menolak
    const geser = (p: AkunProfil, d: boolean) => ({ ...p, isFollowing: d, followers: (p.followers ?? 0) + (d ? 1 : -1) })
    setProfil((p) => (p ? geser(p, ikut) : p))
    try {
      await (ikut ? akunApi.ikuti(profil.handle) : akunApi.berhentiIkuti(profil.handle))
    } catch (e) {
      setProfil((p) => (p ? geser(p, !ikut) : p))
      setGalatIkuti(e instanceof AkunGalat ? e.message : 'Could not update. Try again.')
    }
  }

  if (keadaan === 'memuat') return <section className="page" />

  if (keadaan !== 'ada' || !profil) {
    return (
      <section className="page">
        <div className="ac">
          <div className="ac-card">
            <p className="ac-empty">
              {keadaan === 'tak_ada' ? (
                <>
                  Profile <strong>@{handle}</strong> not found.
                </>
              ) : (
                'Profiles are not available right now.'
              )}
              <br />
              <Link to="/" style={{ color: 'var(--accent)' }}>Back to Trenches</Link>
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="page">
      <ProfileView
        profile={keTampilan(profil)}
        isMe={sendiri}
        following={profil.isFollowing}
        onToggleFollow={bisaIkuti ? toggleIkuti : undefined}
        onEdit={sendiri ? () => pindah('/me') : undefined}
      />
      {galatIkuti && (
        <p className="ac-galat ac-galat-luar" role="alert">
          {galatIkuti}
        </p>
      )}
    </section>
  )
}
