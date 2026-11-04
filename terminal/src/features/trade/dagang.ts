import { AkunGalat, minta, penandaUntuk } from '@/features/account/akun'
import type { KutipanBnb } from './dagangBnb'

/**
 * Trading terminal (lab, 2 Nov — izin pemilik): beli/jual token Solana dari terminal.
 *
 * Alur satu transaksi:
 *   wallet (cari/sambung) → `siapkan` (server: kutipan Jupiter + transaksi TAK bertanda + simulasi)
 *   → tinjau (opsional, pengaturan "Confirm before trading") → tanda tangan DI WALLET
 *   → `kirim` (server meneruskan ke RPC) atau `lacak` (wallet sudah mengirim) → status sampai terkonfirmasi.
 *
 * ⚠️ Non-custodial: synt tak pernah memegang kunci atau dana. synt tak memungut biaya (keputusan pemilik 2 Nov).
 * Transaksi selalu dibangun ulang di server dari kutipan segar; angka di layar sebelum "Buy" hanya perkiraan.
 */

export const SOL_DESIMAL = 9
export const LAMPORT = 1_000_000_000

/** Chain trading. Akun Solana memperdagangkan token Solana, akun 0x token BNB Chain (dua akun terpisah, 1 Nov). */
export type Chain = 'sol' | 'bnb'

export const ASLI: Record<Chain, { simbol: string; desimal: number; penjelajah: string; tx: (h: string) => string }> = {
  sol: { simbol: 'SOL', desimal: SOL_DESIMAL, penjelajah: 'Solscan', tx: (h) => `https://solscan.io/tx/${h}` },
  bnb: { simbol: 'BNB', desimal: 18, penjelajah: 'BscScan', tx: (h) => `https://bscscan.com/tx/${h}` },
}

/** Jumlah koin asli (satuan terkecil, string) → "0.123 SOL" / "0.0123 BNB". */
export function teksAsli(mentah: string | null | undefined, chain: Chain): string {
  const n = dariMentah(mentah, ASLI[chain].desimal)
  return `${n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1 ? 3 : Math.abs(n) >= 0.01 ? 4 : 6 })} ${ASLI[chain].simbol}`
}

export interface Kutipan {
  id: string
  transaction: string
  side: 'buy' | 'sell'
  mint: string
  inAmount: string
  outAmount: string
  minOut: string
  priceImpactPct: number | null
  route: string
  computeUnits: number
  networkFeeLamports: string
  lastValidBlockHeight: number
  /** desimal token dari mint on-chain; null = tak terbaca */
  decimals: number | null
  /** jual habis: akun token yang kosong ikut ditutup, sewanya (~0,002 SOL) kembali ke wallet */
  closesTokenAccount?: boolean
}

export interface Transaksi {
  id: string
  chain?: Chain
  /** lamport (Solana) / wei (BNB) */
  nativeDelta?: string | null
  mint: string
  side: 'buy' | 'sell'
  inAmount: string
  outAmount: string
  minOut: string
  status: 'prepared' | 'sent' | 'confirmed' | 'failed' | 'expired'
  signature: string | null
  error: string | null
  solDelta: string | null
  tokenDelta: string | null
  createdAt: string
  settledAt: string | null
}

export interface Saldo {
  wallet: string
  solLamports: string
  token: { amount: string; decimals: number } | null
}

export interface Posisi {
  mint: string
  solSpent: string
  solReceived: string
  tokensBought: string
  tokensSold: string
  trades: number
  lastTradeAt: string | null
  balance: string | null
  decimals: number | null
  priceUsd: number | null
  symbol: string | null
  name: string | null
  icon: string | null
}

const B = '/dagang'

export const dagangApi = {
  saldo: (mint?: string) => minta<Saldo>('GET', `${B}/saldo${mint ? `?mint=${encodeURIComponent(mint)}` : ''}`),
  siapkan: (b: {
    mint: string
    side: 'buy' | 'sell'
    amount?: string
    percent?: number
    slippageBps: number
    priorityLamports: number
  }) => minta<Kutipan>('POST', `${B}/siapkan`, b),
  kirim: (id: string, transaction: string) => minta<{ signature: string }>('POST', `${B}/kirim`, { id, transaction }),
  lacak: (id: string, signature: string) => minta<{ signature: string }>('POST', `${B}/lacak`, { id, signature }),
  status: (id: string) => minta<Transaksi>('GET', `${B}/${encodeURIComponent(id)}`),
  riwayat: (mint?: string) =>
    minta<{ trades: Transaksi[] }>('GET', `${B}/riwayat${mint ? `?mint=${encodeURIComponent(mint)}` : ''}`),
  posisi: () => minta<{ positions: Posisi[]; solUsd: number | null }>('GET', `${B}/posisi`),
}

// ── angka ───────────────────────────────────────────────────────────────────

/** Satuan mentah (string, bisa > 2^53) → angka desimal untuk tampilan. */
export function dariMentah(mentah: string | null | undefined, desimal: number): number {
  if (!mentah) return 0
  const neg = mentah.startsWith('-')
  const d = neg ? mentah.slice(1) : mentah
  const pad = d.padStart(desimal + 1, '0')
  const n = Number(`${pad.slice(0, pad.length - desimal)}.${pad.slice(pad.length - desimal)}`)
  return neg ? -n : n
}

/** Angka SOL dari input pengguna → lamport (string, tanpa pembulatan float). null = bukan angka sah. */
export function keLamport(teks: string): string | null {
  const t = teks.trim().replace(',', '.')
  if (!/^\d*(\.\d*)?$/.test(t) || t === '' || t === '.') return null
  const [utuh = '0', pecahan = ''] = t.split('.')
  const s = (utuh + pecahan.slice(0, SOL_DESIMAL).padEnd(SOL_DESIMAL, '0')).replace(/^0+/, '')
  return s === '' ? null : s
}

/** Tampilan jumlah token: 1.234, 12.3K, 4.56M … */
export function jumlahRingkas(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
  if (a === 0) return '0'
  return n.toPrecision(3)
}

export const teksSol = (lamport: number | string | null | undefined) => {
  const n = typeof lamport === 'string' ? dariMentah(lamport, SOL_DESIMAL) : (lamport ?? 0) / LAMPORT
  return `${n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1 ? 3 : 4 })} SOL`
}

/** Pengaturan Quick buy (persen / SOL, bisa kosong atau NaN saat diketik) → nilai sah untuk server. */
export const bpsSlippage = (persen: number) =>
  Math.round(Math.min(Math.max(Number.isFinite(persen) ? persen : 15, 0.1), 50) * 100)
export const lamportPrioritas = (sol: number) =>
  Math.round(Math.min(Math.max(Number.isFinite(sol) ? sol : 0.001, 0), 0.1) * LAMPORT)

export const solscan = (tanda: string) => `https://solscan.io/tx/${tanda}`

// ── base64 ──────────────────────────────────────────────────────────────────

const dariB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
function keB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

// ── status bersama (toast + dialog tinjau) ─────────────────────────────────

export type Tahap = 'menyiapkan' | 'tinjau' | 'tanda' | 'kirim' | 'tunggu' | 'berhasil' | 'gagal'

export interface Jalan {
  kunci: number
  chain: Chain
  judul: string
  tahap: Tahap
  pesan: string | null
  tanda: string | null
  hasil: Transaksi | null
}

export type Tinjauan = {
  simbol: string
  desimal: number
  slippageBps: number
  prioritasLamports: number
  segar: boolean
  jawab: (ok: boolean) => void
} & ({ chain: 'sol'; kutipan: Kutipan } | { chain: 'bnb'; kutipan: KutipanBnb })

let jalan: Jalan[] = []
let tinjauan: Tinjauan | null = null
const pendengar = new Set<() => void>()
const kabari = () => pendengar.forEach((f) => f())

export const toko = {
  langgan(f: () => void) {
    pendengar.add(f)
    return () => {
      pendengar.delete(f)
    }
  },
  jalan: () => jalan,
  tinjauan: () => tinjauan,
  tutup(kunci: number) {
    jalan = jalan.filter((j) => j.kunci !== kunci)
    kabari()
  },
}

let urut = 0

/** Kartu status baru (pojok kanan bawah) → kuncinya. Dipakai jalur Solana & BNB. */
export function mulaiJalan(judul: string, chain: Chain): number {
  const kunci = ++urut
  jalan = [...jalan, { kunci, chain, judul, tahap: 'menyiapkan', pesan: null, tanda: null, hasil: null }]
  kabari()
  return kunci
}

export function ubah(kunci: number, u: Partial<Jalan>) {
  jalan = jalan.map((j) => (j.kunci === kunci ? { ...j, ...u } : j))
  kabari()
}

type TanpaJawab<T> = T extends unknown ? Omit<T, 'jawab'> : never

export function mintaTinjau(t: TanpaJawab<Tinjauan>): Promise<boolean> {
  return new Promise((jawab) => {
    tinjauan = {
      ...t,
      jawab: (ok: boolean) => {
        tinjauan = null
        kabari()
        jawab(ok)
      },
    } as Tinjauan
    kabari()
  })
}

/** Ikuti status di server sampai terkonfirmasi / gagal; perbarui kartu. */
export async function ikutiStatus(
  kunci: number,
  id: string,
  ringkas: (t: Transaksi) => string,
  penjelajah: string,
): Promise<Transaksi | null> {
  const mulai = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 1_500))
    let t: Transaksi
    try {
      t = await dagangApi.status(id)
    } catch {
      if (Date.now() - mulai > BATAS_TUNGGU_MS) throw new AkunGalat('Lost track of the transaction. Check your wallet.', 0)
      continue
    }
    if (t.status === 'confirmed') {
      ubah(kunci, { tahap: 'berhasil', hasil: t, pesan: ringkas(t) })
      setTimeout(() => toko.tutup(kunci), 12_000)
      return t
    }
    if (t.status === 'failed' || t.status === 'expired') {
      ubah(kunci, { tahap: 'gagal', hasil: t, pesan: t.error ?? 'The transaction did not go through.' })
      return t
    }
    if (Date.now() - mulai > BATAS_TUNGGU_MS) {
      ubah(kunci, { tahap: 'gagal', pesan: `Still not confirmed. Check the transaction on ${penjelajah}.` })
      return null
    }
  }
}

// ── satu transaksi ──────────────────────────────────────────────────────────

export interface Pesanan {
  /** alamat wallet akun yang masuk (Solana) */
  alamat: string
  mint: string
  simbol: string
  /** desimal token; pump.fun = 6. Dipakai tampilan saja — server memakai unit mentah. */
  desimal: number
  side: 'buy' | 'sell'
  /** buy: lamport. sell: unit token mentah (atau pakai `percent`) */
  amount?: string
  percent?: number
  slippageBps: number
  prioritasLamports: number
  tinjau: boolean
}

/** Kutipan lebih tua dari ini saat pengguna menekan Confirm → disiapkan ulang (blockhash berlaku ±60-90 dtk). */
export const UMUR_KUTIPAN_MS = 40_000
const BATAS_TUNGGU_MS = 150_000

export async function jalankan(p: Pesanan): Promise<Transaksi | null> {
  const judul =
    p.side === 'buy'
      ? `Buy ${p.simbol} with ${teksSol(p.amount ?? '0')}`
      : `Sell ${p.percent ? `${p.percent}% of` : jumlahRingkas(dariMentah(p.amount, p.desimal))} ${p.simbol}`
  const kunci = mulaiJalan(judul, 'sol')

  try {
    // wallet DULU: jendela sambung bisa memakan waktu, dan blockhash mulai menua sejak kutipan dibuat
    const penanda = await penandaUntuk(p.alamat)
    let kutipan: Kutipan
    for (let coba = 0; ; coba++) {
      kutipan = await dagangApi.siapkan({
        mint: p.mint,
        side: p.side,
        amount: p.percent ? undefined : p.amount,
        percent: p.percent,
        slippageBps: p.slippageBps,
        priorityLamports: p.prioritasLamports,
      })
      if (!p.tinjau) break
      const sejak = Date.now()
      ubah(kunci, { tahap: 'tinjau' })
      const ok = await mintaTinjau({
        chain: 'sol',
        kutipan,
        simbol: p.simbol,
        desimal: p.desimal,
        slippageBps: p.slippageBps,
        prioritasLamports: p.prioritasLamports,
        segar: coba > 0,
      })
      if (!ok) {
        toko.tutup(kunci)
        return null
      }
      if (Date.now() - sejak < UMUR_KUTIPAN_MS || coba >= 2) break
      ubah(kunci, { tahap: 'menyiapkan', pesan: 'Quote expired. Getting a fresh one…' })
    }

    ubah(kunci, { tahap: 'tanda', pesan: `Confirm in ${penanda.nama}…` })
    const h = await penanda.tandatangani(dariB64(kutipan.transaction))
    ubah(kunci, { tahap: 'kirim', pesan: null })
    const { signature } =
      'tx' in h ? await dagangApi.kirim(kutipan.id, keB64(h.tx)) : await dagangApi.lacak(kutipan.id, h.tanda)
    ubah(kunci, { tahap: 'tunggu', tanda: signature })
    const k = kutipan
    return await ikutiStatus(kunci, k.id, (t) => ringkasHasil(t, { ...p, desimal: k.decimals ?? p.desimal }), 'Solscan')
  } catch (e) {
    const pesan = e instanceof AkunGalat ? e.message : 'Something went wrong. Nothing was sent.'
    ubah(kunci, { tahap: 'gagal', pesan })
    return null
  }
}

function ringkasHasil(t: Transaksi, p: Pesanan): string {
  const tok = Math.abs(dariMentah(t.tokenDelta, p.desimal))
  const sol = Math.abs(dariMentah(t.solDelta, SOL_DESIMAL))
  if (!t.tokenDelta || !t.solDelta) return p.side === 'buy' ? 'Bought.' : 'Sold.'
  return p.side === 'buy'
    ? `Bought ${jumlahRingkas(tok)} ${p.simbol} for ${teksSol(sol * LAMPORT)}`
    : `Sold ${jumlahRingkas(tok)} ${p.simbol} for ${teksSol(sol * LAMPORT)}`
}
