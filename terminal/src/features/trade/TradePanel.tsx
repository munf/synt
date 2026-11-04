import { useCallback, useEffect, useState } from 'react'
import { useAkun } from '@/features/account/useAkun'
import { usePreferensi } from '@/features/account/sinkron'
import { kursSolUsd } from '@/features/token/adaptDetail'
import {
  ASLI,
  bpsSlippage,
  dagangApi,
  dariMentah,
  jalankan,
  jumlahRingkas,
  keLamport,
  lamportPrioritas,
  teksAsli,
  type Chain,
} from './dagang'
import { bnbApi, jalankanBnb, keWei, WEI_JAGA } from './dagangBnb'
import './Trade.css'

/** Event yang membuka drawer masuk di AppShell (panel ini tak memegang state drawer). */
export const BUKA_MASUK = 'synt:buka-masuk'

/** Per chain: jumlah koin asli yang disisakan saat "Use max", minimum beli, preset & kunci jumlah bawaan Quick buy. */
const ATURAN: Record<Chain, { jaga: bigint; min: bigint; preset: number[]; kunciBawaan: string; bawaan: number; keMentah: (t: string) => string | null }> = {
  // biaya jaringan + sewa akun token baru
  sol: { jaga: 10_000_000n, min: 1_000_000n, preset: [0.1, 0.5, 1, 2], kunciBawaan: 'synt.quickbuy.amount', bawaan: 0.5, keMentah: keLamport },
  // gas (approve + swap)
  bnb: { jaga: WEI_JAGA, min: 1_000_000_000_000_000n, preset: [0.01, 0.05, 0.1, 0.5], kunciBawaan: 'synt.quickbuy.bnbAmount', bawaan: 0.05, keMentah: keWei },
}

/** Saldo yang dibutuhkan panel, sama bentuknya di kedua chain (satuan terkecil). */
interface SaldoPanel {
  asli: string
  token: { amount: string; decimals: number } | null
}

/**
 * Panel beli/jual di halaman token (Solana 2 Nov, BNB Chain 3 Nov; menggantikan pratinjau `KartuTrade`).
 * Angka sebelum menekan tombol hanya perkiraan dari harga terakhir synt; kutipan pasti datang dari server.
 * `kurs` = harga USD koin asli (SOL / BNB); Solana bawaannya kurs dari `/api/token`.
 */
export function TradePanel({
  mint,
  symbol,
  priceUsd,
  peringatan,
  chain = 'sol',
  kurs: kursProp,
}: {
  mint: string
  symbol: string
  priceUsd: number | null
  peringatan?: React.ReactNode
  chain?: Chain
  kurs?: number | null
}) {
  const akun = useAkun()
  const atur = ATURAN[chain]
  const asli = ASLI[chain]
  const [sisi, setSisi] = useState<'buy' | 'sell'>('buy')
  const [jumlah, setJumlah] = useState('')
  const [persen, setPersen] = useState<number | null>(null)
  const [saldo, setSaldo] = useState<SaldoPanel | null>(null)
  const [sibuk, setSibuk] = useState(false)
  const [aturan, setAturan] = useState(false)
  const [bawaan] = usePreferensi(atur.kunciBawaan, atur.bawaan)
  const [slippage, setSlippage] = usePreferensi('synt.quickbuy.slippage', 15)
  const [prioritas, setPrioritas] = usePreferensi('synt.quickbuy.priority', 0.001)
  const [tinjau] = usePreferensi('synt.quickbuy.confirm', true)

  const wallet = akun.status === 'masuk' ? akun.profil?.wallet ?? null : null
  // akun 0x memperdagangkan BNB Chain, akun Solana memperdagangkan Solana (dua akun terpisah)
  const cocok = !!wallet && wallet.startsWith('0x') === (chain === 'bnb')

  const muat = useCallback(() => {
    if (!cocok) return
    const janji: Promise<SaldoPanel> =
      chain === 'bnb'
        ? bnbApi.saldo(mint).then((r) => ({ asli: r.bnbWei, token: r.token }))
        : dagangApi.saldo(mint).then((r) => ({ asli: r.solLamports, token: r.token }))
    janji.then(setSaldo).catch(() => undefined)
  }, [mint, cocok, chain])

  useEffect(() => {
    setSaldo(null)
    muat()
    if (!cocok) return
    const t = setInterval(() => document.visibilityState === 'visible' && muat(), 20_000)
    return () => clearInterval(t)
  }, [muat, cocok])

  const desimal = saldo?.token?.decimals ?? (chain === 'bnb' ? 18 : 6)
  const punyaToken = dariMentah(saldo?.token?.amount, desimal)
  const asliSaldo = saldo ? BigInt(saldo.asli) : 0n
  const kurs = chain === 'sol' ? kursProp ?? kursSolUsd() : kursProp ?? null

  // kolom kosong = jumlah bawaan Quick buy (yang tampil sbg placeholder)
  const jumlahBeli = jumlah.trim() === '' ? String(bawaan) : jumlah
  const mentahBeli = sisi === 'buy' ? atur.keMentah(jumlahBeli) : null
  const mentahJual =
    sisi === 'sell' && persen == null ? keMentah(jumlah, desimal) : null

  const perkiraan = (() => {
    if (!priceUsd || !kurs) return null
    if (sisi === 'buy') {
      const n = Number(jumlahBeli)
      return n > 0 ? `≈ ${jumlahRingkas((n * kurs) / priceUsd)} ${symbol}` : null
    }
    const tok = persen != null ? (punyaToken * persen) / 100 : Number(jumlah)
    if (!(tok > 0)) return null
    const n = (tok * priceUsd) / kurs
    return `≈ ${n.toLocaleString('en-US', { maximumFractionDigits: n >= 1 ? 3 : 5 })} ${asli.simbol}`
  })()

  const sah =
    sisi === 'buy'
      ? mentahBeli != null && BigInt(mentahBeli) >= atur.min
      : persen != null
        ? punyaToken > 0
        : mentahJual != null && punyaToken > 0

  const kirim = async () => {
    if (!wallet || !sah || sibuk) return
    setSibuk(true)
    const amount = sisi === 'buy' ? mentahBeli! : persen != null ? undefined : mentahJual!
    const percent = sisi === 'sell' && persen != null ? persen : undefined
    const hasil =
      chain === 'bnb'
        ? await jalankanBnb({ alamat: wallet, token: mint, simbol: symbol, desimal, side: sisi, amount, percent, slippageBps: bpsSlippage(slippage), tinjau })
        : await jalankan({
            alamat: wallet,
            mint,
            simbol: symbol,
            desimal,
            side: sisi,
            amount,
            percent,
            slippageBps: bpsSlippage(slippage),
            prioritasLamports: lamportPrioritas(prioritas),
            tinjau,
          })
    setSibuk(false)
    if (hasil?.status === 'confirmed') {
      setJumlah('')
      setPersen(null)
    }
    muat()
  }

  const tombol = (() => {
    if (akun.status === 'memuat') return { teks: 'Loading…', aksi: undefined }
    if (!wallet) return { teks: 'Sign in to trade', aksi: () => window.dispatchEvent(new Event(BUKA_MASUK)) }
    if (!cocok) {
      return { teks: chain === 'bnb' ? 'Sign in with an EVM wallet to trade' : 'Sign in with a Solana wallet to trade', aksi: undefined }
    }
    if (sibuk) return { teks: 'Trade in progress…', aksi: undefined }
    if (sisi === 'sell' && saldo && punyaToken === 0) return { teks: `You hold no ${symbol}`, aksi: undefined }
    return { teks: `${sisi === 'buy' ? 'Buy' : 'Sell'} ${symbol}`, aksi: sah ? kirim : undefined }
  })()

  return (
    <section className="cd-card cd-trade" aria-label="Trade">
      <div className="cd-trade-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={sisi === 'buy'}
          className={`is-buy ${sisi === 'buy' ? 'is-active' : ''}`}
          onClick={() => {
            setSisi('buy')
            setPersen(null)
            setJumlah('')
          }}
        >
          Buy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sisi === 'sell'}
          className={`is-sell ${sisi === 'sell' ? 'is-active' : ''}`}
          onClick={() => {
            setSisi('sell')
            setJumlah('')
            setPersen(null)
          }}
        >
          Sell
        </button>
      </div>

      {cocok && saldo && (
        <p className="tr-saldo">
          <span>{teksAsli(saldo.asli, chain)}</span>
          <span>
            {jumlahRingkas(punyaToken)} {symbol}
          </span>
        </p>
      )}

      <label className="cd-amount">
        <span className="sr-only">{sisi === 'buy' ? `Amount in ${asli.simbol}` : `Amount of ${symbol}`}</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder={sisi === 'buy' ? String(bawaan) : persen != null ? `${persen}%` : '0'}
          value={persen != null ? '' : jumlah}
          onChange={(e) => {
            setPersen(null)
            setJumlah(e.target.value)
          }}
        />
        <span className="cd-amount-unit">{sisi === 'buy' ? asli.simbol : symbol.slice(0, 6)}</span>
      </label>

      <div className="cd-presets">
        {sisi === 'buy'
          ? atur.preset.map((v) => (
              <button key={v} type="button" onClick={() => setJumlah(String(v))}>
                {v}
              </button>
            ))
          : [25, 50, 75, 100].map((p) => (
              <button
                key={p}
                type="button"
                className={persen === p ? 'is-active' : undefined}
                disabled={punyaToken === 0}
                onClick={() => {
                  setJumlah('')
                  setPersen(p)
                }}
              >
                {p === 100 ? 'Max' : `${p}%`}
              </button>
            ))}
      </div>
      {sisi === 'buy' && cocok && asliSaldo > atur.jaga && (
        <button
          type="button"
          className="tr-maks"
          onClick={() => setJumlah(dariMentah(String(asliSaldo - atur.jaga), asli.desimal).toFixed(4).replace(/\.?0+$/, ''))}
        >
          Use max ({teksAsli(String(asliSaldo - atur.jaga), chain)})
        </button>
      )}

      {perkiraan && <p className="tr-perkiraan">{perkiraan} at the last price synt saw</p>}

      <button
        type="button"
        className={`cd-buy-btn ${sisi === 'sell' ? 'is-sell' : ''}`}
        disabled={!tombol.aksi}
        aria-disabled={!tombol.aksi}
        onClick={tombol.aksi}
      >
        {tombol.teks}
      </button>

      <button type="button" className="tr-aturan-tombol" aria-expanded={aturan} onClick={() => setAturan((x) => !x)}>
        Slippage {slippage}%{chain === 'sol' ? ` · Priority ${prioritas} SOL` : ''}{tinjau ? '' : ' · No review'}
      </button>
      {aturan && (
        <div className="tr-aturan">
          <label>
            <span>Slippage %</span>
            <input
              type="number"
              inputMode="decimal"
              min={0.1}
              max={50}
              step={0.5}
              value={slippage}
              onChange={(e) => setSlippage(Number(e.target.value))}
            />
          </label>
          {chain === 'bnb' ? (
            <p className="tr-aturan-ket">Gas is set by your wallet.</p>
          ) : (
          <label>
            <span>Priority fee SOL</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={0.1}
              step={0.0005}
              value={prioritas}
              onChange={(e) => setPrioritas(Number(e.target.value))}
            />
          </label>
          )}
        </div>
      )}

      {peringatan}
      <p className="cd-trade-note">
        {cocok
          ? 'Non-custodial: you sign every trade in your own wallet. synt charges no fee.'
          : 'Trades run through your own wallet. synt never holds your funds.'}
      </p>
    </section>
  )
}

/** Jumlah token dari input → unit mentah (string). */
function keMentah(teks: string, desimal: number): string | null {
  const t = teks.trim().replace(',', '.')
  if (!/^\d*(\.\d*)?$/.test(t) || t === '' || t === '.') return null
  const [utuh = '0', pecahan = ''] = t.split('.')
  const s = (utuh + pecahan.slice(0, desimal).padEnd(desimal, '0')).replace(/^0+/, '')
  return s === '' ? null : s
}
