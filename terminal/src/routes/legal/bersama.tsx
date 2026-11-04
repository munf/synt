/* Kontak resmi di halaman Privacy & Terms — sama dgn synteel (eel.synt.fun/privasi), satu perusahaan. */

export const EMAIL = 'support@synt.fun'
export const TELEGRAM = '@fajarmuhammad'

/** `baris` = email & Telegram di baris terpisah (blok Kontak di akhir halaman). */
export function Kontak({ id = false, baris = false }: { id?: boolean; baris?: boolean }) {
  const email = <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
  const tg = (
    <a href={`https://t.me/${TELEGRAM.slice(1)}`} target="_blank" rel="noreferrer">
      {TELEGRAM}
    </a>
  )
  if (baris) {
    return (
      <>
        Email {email}
        <br />
        Telegram {tg}
      </>
    )
  }
  return (
    <>
      Email {email} {id ? 'atau' : 'or'} Telegram {tg}
    </>
  )
}
