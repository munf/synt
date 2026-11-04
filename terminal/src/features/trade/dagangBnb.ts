import { AkunGalat, minta, penandaEvmUntuk, type TxEvm } from '@/features/account/akun'
import {
  ASLI,
  dariMentah,
  ikutiStatus,
  jumlahRingkas,
  mintaTinjau,
  mulaiJalan,
  teksAsli,
  toko,
  ubah,
  UMUR_KUTIPAN_MS,
  type Posisi,
  type Transaksi,
} from './dagang'

/**
 * Trading BNB Chain (lab, 3 Nov — izin pemilik): beli/jual token four.meme, Flap.sh & yang sudah lulus ke PancakeSwap.
 *
 * Alur satu transaksi:
 *   wallet EVM (cari/sambung, pindah ke BNB Chain) → `siapkan` (server: deteksi jalur + calldata + simulasi, beli = uji
 *   beli-lalu-jual) → tinjau (opsional) → [jual: approve sebesar jumlah jual, tunggu receipt] → wallet MENGIRIM swap
 *   (`eth_sendTransaction`) → `lacak` (server memeriksa pengirim & isi) → status sampai terkonfirmasi.
 *
 * ⚠️ Non-custodial: wallet yang menandatangani & mengirim; synt tak memegang kunci atau dana, tanpa biaya synt.
 */

export interface KutipanBnb {
  id: string
  chain: 'bnb'
  side: 'buy' | 'sell'
  mint: string
  inAmount: string
  outAmount: string
  minOut: string
  priceImpactPct: null
  route: string
  /** four.meme · Flap.sh · KyberSwap */
  venue: string
  tx: TxEvm
  /** jual: approve yang dikirim lebih dulu (izin < jumlah jual) */
  approval: TxEvm | null
  /** beli: BNB (wei) yang kembali bila seluruh hasil langsung dijual lagi (uji di server) */
  roundTripWei: string | null
  networkFeeWei: string
  decimals: number | null
}

export interface SaldoBnb {
  wallet: string
  bnbWei: string
  token: { amount: string; decimals: number } | null
}

const B = '/dagang/bnb'

export const bnbApi = {
  saldo: (token?: string) => minta<SaldoBnb>('GET', `${B}/saldo${token ? `?token=${encodeURIComponent(token)}` : ''}`),
  siapkan: (b: { token: string; side: 'buy' | 'sell'; amount?: string; percent?: number; slippageBps: number }) =>
    minta<KutipanBnb>('POST', `${B}/siapkan`, b),
  lacak: (id: string, hash: string) => minta<{ signature: string }>('POST', `${B}/lacak`, { id, hash }),
  posisi: () => minta<{ positions: Posisi[]; solUsd: number | null }>('GET', `${B}/posisi`),
}

export const WEI = 1e18

/** Angka BNB dari input pengguna → wei (string, tanpa pembulatan float). null = bukan angka sah. */
export function keWei(teks: string): string | null {
  const t = teks.trim().replace(',', '.')
  if (!/^\d*(\.\d*)?$/.test(t) || t === '' || t === '.') return null
  const [utuh = '0', pecahan = ''] = t.split('.')
  const s = (utuh + pecahan.slice(0, 18).padEnd(18, '0')).replace(/^0+/, '')
  return s === '' ? null : s
}

export const teksBnb = (wei: string | null | undefined) => teksAsli(wei, 'bnb')

export interface PesananBnb {
  /** alamat 0x akun yang masuk */
  alamat: string
  token: string
  simbol: string
  /** desimal token (four.meme & Flap = 18); tampilan saja */
  desimal: number
  side: 'buy' | 'sell'
  /** buy: wei. sell: unit token mentah (atau pakai `percent`) */
  amount?: string
  percent?: number
  slippageBps: number
  tinjau: boolean
}

export async function jalankanBnb(p: PesananBnb): Promise<Transaksi | null> {
  const judul =
    p.side === 'buy'
      ? `Buy ${p.simbol} with ${teksBnb(p.amount ?? '0')}`
      : `Sell ${p.percent ? `${p.percent}% of` : jumlahRingkas(dariMentah(p.amount, p.desimal))} ${p.simbol}`
  const kunci = mulaiJalan(judul, 'bnb')

  try {
    const penanda = await penandaEvmUntuk(p.alamat)
    const siapkan = () =>
      bnbApi.siapkan({
        token: p.token,
        side: p.side,
        amount: p.percent ? undefined : p.amount,
        percent: p.percent,
        slippageBps: p.slippageBps,
      })

    let kutipan = await siapkan()
    let sejak = Date.now()
    if (p.tinjau && !(await tinjau(kunci, kutipan, p, false))) return null

    if (kutipan.approval) {
      // approve SEBESAR jumlah jual ke kontrak jalur; swap baru dikirim setelah approve masuk blok
      ubah(kunci, { tahap: 'tanda', pesan: `Approve ${p.simbol} in ${penanda.nama} (step 1 of 2)…` })
      const h = await penanda.kirim(kutipan.approval)
      ubah(kunci, { tahap: 'tunggu', pesan: 'Waiting for the approval…', tanda: h })
      if (!(await penanda.tunggu(h))) throw new AkunGalat('The approval failed on-chain. Nothing was sold.', 0)
      ubah(kunci, { tanda: null })
    }

    // kutipan menua selama approve / tinjau → kutip ulang; angka baru ditinjau lagi
    if (Date.now() - sejak > UMUR_KUTIPAN_MS) {
      ubah(kunci, { tahap: 'menyiapkan', pesan: 'Getting a fresh quote…' })
      kutipan = await siapkan()
      sejak = Date.now()
      if (p.tinjau && !(await tinjau(kunci, kutipan, p, true))) return null
    }

    ubah(kunci, { tahap: 'tanda', pesan: `Confirm in ${penanda.nama}${kutipan.approval ? ' (step 2 of 2)' : ''}…` })
    const hash = await penanda.kirim(kutipan.tx)
    ubah(kunci, { tahap: 'kirim', pesan: null, tanda: hash })
    await bnbApi.lacak(kutipan.id, hash)
    ubah(kunci, { tahap: 'tunggu' })
    const desimal = kutipan.decimals ?? p.desimal
    return await ikutiStatus(kunci, kutipan.id, (t) => ringkasHasil(t, p, desimal), ASLI.bnb.penjelajah)
  } catch (e) {
    const pesan = e instanceof AkunGalat ? e.message : 'Something went wrong. Nothing was sent.'
    ubah(kunci, { tahap: 'gagal', pesan })
    return null
  }
}

async function tinjau(kunci: number, kutipan: KutipanBnb, p: PesananBnb, segar: boolean): Promise<boolean> {
  ubah(kunci, { tahap: 'tinjau', pesan: null })
  const ok = await mintaTinjau({ chain: 'bnb', kutipan, simbol: p.simbol, desimal: p.desimal, slippageBps: p.slippageBps, prioritasLamports: 0, segar })
  if (!ok) toko.tutup(kunci)
  return ok
}

function ringkasHasil(t: Transaksi, p: PesananBnb, desimal: number): string {
  if (!t.tokenDelta || !t.nativeDelta) return p.side === 'buy' ? 'Bought.' : 'Sold.'
  const tok = jumlahRingkas(Math.abs(dariMentah(t.tokenDelta, desimal)))
  const bnb = teksBnb(t.nativeDelta.replace('-', ''))
  return p.side === 'buy' ? `Bought ${tok} ${p.simbol} for ${bnb}` : `Sold ${tok} ${p.simbol} for ${bnb}`
}

/** BNB (wei) yang disisakan untuk gas saat "Use max". */
export const WEI_JAGA = 2_000_000_000_000_000n
