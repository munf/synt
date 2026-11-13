/* Lampiran otomatis tiket support (4 Nov, keputusan pemilik: konteks dilampirkan tanpa diminta).

   Yang dilampirkan hanya yang membantu melacak masalah, dan semuanya TAMPIL di form sebelum dikirim: pengguna
   boleh melepas tiap butir. Server menyaring ulang bentuknya (synt-akun `dukungan.rs`), jadi daftar di sini
   bukan satu-satunya penjaga. ⛔ Tanpa user-agent, tanpa IP: Privacy menjanjikan keduanya tak disimpan. */

import { ASLI, toko, type Jalan } from '@/features/trade/dagang'

/** Event pembuka drawer Support; `detail.tradeKunci` = kartu trade asal tombol "Report a problem". */
export const BUKA_DUKUNGAN = 'synt:dukungan'

export function bukaDukungan(tradeKunci?: number) {
  window.dispatchEvent(new CustomEvent(BUKA_DUKUNGAN, { detail: { tradeKunci } }))
}

export type KunciLampiran = 'page' | 'token' | 'trade' | 'wallet' | 'build' | 'screen'

export interface Lampiran {
  kunci: KunciLampiran
  label: string
  nilai: string
}

/** Bentuk `context` yang diterima `POST /api/akun/dukungan`. */
export type KonteksKirim = {
  page?: string
  chain?: 'sol' | 'bnb'
  token?: string
  tx?: string
  tradeId?: string
  tradeStatus?: string
  tradeError?: string
  build?: string
  screen?: string
}

// Kartu trade yang sukses hilang sendiri setelah 12 dtk: trade terakhir diingat di sini supaya orang yang baru
// membuka Support sesudahnya tetap melampirkannya. Hanya 30 menit, hanya di memori tab ini.
const INGAT_MS = 30 * 60_000
let terakhir: { j: Jalan; pada: number } | null = null
const semua = new Map<number, Jalan>()
toko.langgan(() => {
  for (const j of toko.jalan()) {
    semua.set(j.kunci, j)
    if (j.hasil || j.tanda || j.tahap === 'gagal') terakhir = { j, pada: Date.now() }
  }
})

const pendek = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)

const LABEL_STATUS: Record<string, string> = {
  prepared: 'prepared',
  sent: 'sent',
  confirmed: 'confirmed',
  failed: 'failed',
  expired: 'expired',
}

function tradeDipilih(tradeKunci?: number): Jalan | null {
  if (tradeKunci != null) return semua.get(tradeKunci) ?? null
  return terakhir && Date.now() - terakhir.pada < INGAT_MS ? terakhir.j : null
}

/** Konteks + daftar yang ditampilkan di form. `walletPendek` = null bila belum masuk. */
export function kumpulkan(
  lokasi: { pathname: string; search: string },
  walletPendek: string | null,
  tradeKunci?: number,
): { konteks: KonteksKirim; lampiran: Lampiran[] } {
  const k: KonteksKirim = {}
  const l: Lampiran[] = []

  // pathname dari router sudah ter-encode; decodeURI bisa melempar pada % yatim → pakai apa adanya
  let page = lokasi.pathname + lokasi.search
  try {
    page = encodeURI(decodeURI(page))
  } catch {
    /* biarkan */
  }
  k.page = page.slice(0, 200)
  l.push({ kunci: 'page', label: 'Page', nilai: k.page })

  const sol = lokasi.pathname.match(/^\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})/)
  const bnb = lokasi.pathname.match(/^\/bnb\/(0x[0-9a-fA-F]{40})/)
  if (sol?.[1]) Object.assign(k, { chain: 'sol', token: sol[1] })
  else if (bnb?.[1]) Object.assign(k, { chain: 'bnb', token: bnb[1].toLowerCase() })

  const j = tradeDipilih(tradeKunci)
  if (j) {
    k.chain = j.chain
    if (!k.token && j.hasil?.mint) k.token = j.hasil.mint
    if (j.hasil?.id) k.tradeId = String(j.hasil.id)
    if (j.tanda) k.tx = j.tanda
    const status = j.hasil?.status ?? (j.tahap === 'gagal' ? 'failed' : j.tahap === 'berhasil' ? 'confirmed' : 'sent')
    k.tradeStatus = status
    const galat = j.hasil?.error ?? (j.tahap === 'gagal' ? j.pesan : null)
    if (galat) k.tradeError = galat.slice(0, 200)
    l.push({
      kunci: 'trade',
      label: 'Last trade',
      nilai: [
        j.judul,
        LABEL_STATUS[status] ?? status,
        j.tanda ? `${ASLI[j.chain].penjelajah} ${pendek(j.tanda)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }
  if (k.token) l.push({ kunci: 'token', label: 'Token', nilai: `${pendek(k.token)} (${k.chain === 'bnb' ? 'BNB Chain' : 'Solana'})` })

  if (walletPendek) l.push({ kunci: 'wallet', label: 'Wallet', nilai: `${walletPendek} (signed in)` })

  k.build = __BUILD__
  l.push({ kunci: 'build', label: 'Version', nilai: __BUILD__ })
  k.screen = `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}`
  l.push({ kunci: 'screen', label: 'Screen', nilai: k.screen.replace('x', ' × ') })

  return { konteks: k, lampiran: l }
}

/** Konteks setelah butir yang dilepas pengguna dibuang. */
export function tanpa(k: KonteksKirim, dibuang: ReadonlySet<KunciLampiran>): KonteksKirim {
  const h = { ...k }
  if (dibuang.has('page')) delete h.page
  if (dibuang.has('token')) delete h.token
  if (dibuang.has('trade')) {
    delete h.tradeId
    delete h.tx
    delete h.tradeStatus
    delete h.tradeError
  }
  if (dibuang.has('token') && dibuang.has('trade')) delete h.chain
  if (dibuang.has('build')) delete h.build
  if (dibuang.has('screen')) delete h.screen
  return h
}
