import { useMemo, useState } from 'react'
import './Avatar.css'

/**
 * Avatar dgn inisial yang SELALU ada di bawah gambar (A2, DESIGN-TERMINAL §2).
 *
 * ⭐ Bentuknya: kotak berisi huruf pertama (latar --raise), gambar `object-fit: cover` DI ATASNYA yang baru
 * terlihat setelah `onLoad`. Jadi tak ada lagi keadaan "kotak kosong": gambar yang masih dimuat, yang menggantung
 * di gateway lambat, atau yang tak pernah diminta browser, semuanya menampilkan inisial (dulu kotak kosong krn
 * `<img>` telanjang tanpa isi sampai `onError`, yang tak pernah datang bila permintaan menggantung).
 *
 * ⛔ URL asli TIDAK lagi ditulis ulang ke `gateway.pinata.cloud`. Gateway itu menjawab **429** dari VPS (audit desain
 * Trenches §1b, 27 Okt), sedangkan URL asli `pump.mypinata.cloud` menjawab 200. Urutan percobaan kini:
 *   1. `src` apa adanya, berurutan (mis. `[image_thumb, image]`: proxy thumbnail K3 bila API mengirimnya, lalu asli);
 *   2. bila URL berbentuk `/ipfs/<cid>`: gateway cadangan `ipfs.filebase.io` lalu `ipfs.io` (yang belum dicoba).
 *      ⚠️ Cadangan tetap perlu: gateway publik IPFS (ipfs.io) diblokir sebagian ISP Indonesia (laporan pemilik
 *      dari laptop & tablet, padahal uji dari VPS selalu sehat), dan 74% gambar pump ada di ipfs.io.
 *   3. semua gagal → gambar dilepas, inisial tetap.
 * ⛔ `loading="lazy"` tetap TIDAK dipakai: di kontainer bergulir lazy-load sering tak pernah memicu pemuatan.
 *
 * Ukuran: `sm/md/lg/xl` = 24/32/40/48 (`--av-*`, §1.3) utk token; angka bebas hanya utk avatar orang (profil, post).
 */
const CADANGAN_IPFS = ['https://ipfs.filebase.io/ipfs/', 'https://ipfs.io/ipfs/']

export type UkuranAvatar = 'sm' | 'md' | 'lg' | 'xl'
const PX: Record<UkuranAvatar, number> = { sm: 24, md: 32, lg: 40, xl: 48 }

/** Skala font token (tokens.css) utk inisial ukuran bebas: dipilih yang terdekat dgn 40% sisi. */
const FS: Array<[number, string]> = [
  [10, 'xs'], [11, 'sm'], [12, 'base'], [13, 'md'], [14, 'lg'], [16, 'xl'], [18, '2xl'], [20, '3xl'], [24, '4xl'],
  [28, '5xl'], [32, '6xl'],
]
function fsToken(px: number): string {
  const target = px * 0.4
  let best = FS[0]!
  for (const f of FS) if (Math.abs(f[0] - target) < Math.abs(best[0] - target)) best = f
  return `var(--fs-${best[1]})`
}

/** CID dari URL IPFS apa pun; `null` bila bukan URL IPFS. */
function cidDari(src: string): string | null {
  const m = src.match(/^https?:\/\/[^/]*\/ipfs\/(.+)$/i)
  return m ? (m[1] ?? null) : null
}

/** Daftar URL yang dicoba berurutan (tanpa duplikat). Diekspor utk uji. */
export function urutanGambar(src: string | null | undefined | Array<string | null | undefined>): string[] {
  // URL apa pun yang tak kosong: absolut, relatif (logo agent `/…svg`), atau data:
  const asli = (Array.isArray(src) ? src : [src]).filter((u): u is string => typeof u === 'string' && u.trim() !== '')
  const out: string[] = [...asli]
  for (const u of asli) {
    const cid = cidDari(u)
    if (cid) for (const g of CADANGAN_IPFS) out.push(g + cid)
  }
  return [...new Set(out)]
}

/** Sumber gambar token: thumbnail proxy (K3, `image_thumb`) bila API mengirimnya, lalu `image` asli. */
export type SumberGambar = string | null | Array<string | null | undefined>

export function gambarToken(x: { image?: string | null; image_thumb?: string | null } | null | undefined): SumberGambar {
  return x ? [x.image_thumb, x.image] : []
}

export function Avatar({
  name,
  src,
  size = 'lg',
  shape = 'square',
}: {
  name: string
  /** Satu URL atau beberapa (dicoba berurutan), mis. `gambarToken(item)`. */
  src?: SumberGambar
  size?: UkuranAvatar | number
  shape?: 'square' | 'circle'
}) {
  const kunci = Array.isArray(src) ? src.join('|') : (src ?? '')
  const daftar = useMemo(() => urutanGambar(src), [kunci])
  /* Indeks URL yang sedang dicoba, terikat pada `kunci` (daftar sumber). Melewati panjang daftar = menyerah.
     ⛔ BUKAN useEffect reset: efek berjalan SETELAH gambar dari cache memori memicu onLoad, lalu menghapus status
     termuat → gambar tetap tersembunyi di atas inisial (terukur: 14 dari 16 logo agent di Discovery). Status kini
     diturunkan dari kunci/URL, jadi baris yang dipakai ulang utk token lain otomatis mulai dari awal. */
  const [gagal, setGagal] = useState<{ kunci: string; n: number }>({ kunci, n: 0 })
  const coba = gagal.kunci === kunci ? gagal.n : 0
  const [termuat, setTermuat] = useState<string | null>(null)

  const px = typeof size === 'number' ? size : PX[size]
  const kelasUkuran = typeof size === 'number' ? '' : ` avatar-${size}`
  const style = typeof size === 'number' ? { width: px, height: px, fontSize: fsToken(px) } : undefined
  const url = daftar[coba]
  const muat = url !== undefined && termuat === url

  return (
    <span className={`avatar avatar-${shape}${kelasUkuran}${muat ? ' is-loaded' : ''}`} style={style} aria-hidden="true">
      <span className="avatar-initial">{(name.trim().slice(0, 1) || '?').toUpperCase()}</span>
      {url && (
        <img
          key={url}
          className="avatar-img"
          src={url}
          alt=""
          width={px}
          height={px}
          decoding="async"
          onLoad={() => setTermuat(url)}
          // Naik ke URL berikutnya; baru setelah SEMUA gagal, gambar dilepas (inisial sudah tampil sejak awal).
          onError={() => setGagal({ kunci, n: coba + 1 })}
        />
      )}
    </span>
  )
}
