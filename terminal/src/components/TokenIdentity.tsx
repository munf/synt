import { Link } from 'react-router-dom'
import { Avatar, type SumberGambar } from './Avatar'
import { alamatPendek } from '@/lib/format'
import { useCopy } from '@/lib/useCopy'
import './TokenIdentity.css'

/**
 * Identitas token bersama (A2, DESIGN-TERMINAL §2), sama utk Solana & BNB:
 *   [Avatar] simbol (+ lencana)          ← baris tabel `.t-body-lg` · panel `.t-title` · halaman `.t-h1`
 *            nama                         ← hanya panel & halaman, `.t-meta`
 *            alamat 4…4 / 0x+4…4 · tag     ← `.t-num-sm` --mute, SATU baris tanpa wrap (overflow hidden)
 * Dulu ditulis ulang di 6 tempat (baris SOL/BNB, panel SOL/BNB, /coin, /bnb) dgn 3 gaya alamat dan baris BNB tanpa
 * alamat sama sekali (simbol kembar tak terbedakan).
 *
 * Tata letak di sekitarnya (bintang, tautan explorer, harga) tetap milik pemanggil (A3/A4).
 */
export function TokenIdentity({
  size,
  symbol,
  name,
  address,
  src,
  href,
  symbolTitle,
  badges,
  tags,
  note,
  copy = size !== 'row',
  avatarLink = false,
}: {
  size: 'row' | 'panel' | 'page'
  symbol: string
  /** Nama lengkap; kosong → tak ditulis. Baris tabel tak menampilkannya (pakai `symbolTitle`). */
  name?: string | null
  address: string
  src?: SumberGambar
  /** Tujuan tautan simbol (halaman token). Halaman token sendiri: tanpa tautan, simbol = <h1>. */
  href?: string
  symbolTitle?: string
  /** Elemen sebaris dgn simbol (mis. SAMPLE, tag ALPHA). */
  badges?: React.ReactNode
  /** Chip/teks sebaris dgn alamat (launchpad, pajak, Graduated, umur, catatan pasar). */
  tags?: React.ReactNode
  /** Catatan di baris sendiri di bawah alamat (mis. "Post-graduation market not loaded"), boleh membungkus. */
  note?: React.ReactNode
  /** Tombol salin alamat (bawaan: panel & halaman). Baris tabel: alamat teks biasa (klik baris = pilih). */
  copy?: boolean
  /** Avatar ikut menjadi tautan ke `href` (panel). */
  avatarLink?: boolean
}) {
  const { copy: salin, copied } = useCopy()
  const av = <Avatar name={symbol} src={src} size={size === 'row' ? 'md' : size === 'panel' ? 'lg' : 'xl'} />
  const kelasSimbol = `ti-symbol ${size === 'row' ? 't-body-lg' : size === 'panel' ? 't-title' : 't-h1'}`
  const simbol =
    size === 'page' ? (
      <h1 className={kelasSimbol} title={symbolTitle}>{symbol}</h1>
    ) : href ? (
      <Link to={href} className={kelasSimbol} title={symbolTitle} onClick={(e) => e.stopPropagation()}>
        {symbol}
      </Link>
    ) : (
      <span className={kelasSimbol} title={symbolTitle}>{symbol}</span>
    )

  return (
    <div className={`ti ti-${size}`}>
      {avatarLink && href ? (
        <Link to={href} aria-label={`Open ${symbol}`} className="ti-av" onClick={(e) => e.stopPropagation()}>
          {av}
        </Link>
      ) : (
        av
      )}
      <div className="ti-id">
        <div className="ti-line1">
          {simbol}
          {badges}
        </div>
        {name && size !== 'row' && <p className="ti-name t-meta">{name}</p>}
        <div className="ti-line2">
          {copy ? (
            <button
              type="button"
              className="ti-addr t-num-sm"
              onClick={(e) => {
                e.stopPropagation()
                salin(address, 'addr')
              }}
              title={`Copy contract address\n${address}`}
              aria-label={copied === 'addr' ? 'Address copied' : `Copy contract address ${address}`}
            >
              {copied === 'addr' ? 'Copied' : alamatPendek(address)}
              <CopyIcon />
            </button>
          ) : (
            <span className="ti-addr t-num-sm" title={address}>{alamatPendek(address)}</span>
          )}
          {tags}
        </div>
        {note}
      </div>
    </div>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}
