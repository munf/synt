import { useState } from 'react'
import { useAkun } from '@/features/account/useAkun'
import { usePreferensi } from '@/features/account/sinkron'
import { ASLI, bpsSlippage, jalankan, keLamport, lamportPrioritas, type Chain } from './dagang'
import { jalankanBnb, keWei } from './dagangBnb'
import { BUKA_MASUK } from './TradePanel'

/**
 * Tombol quick buy (baris Trenches & panel pair, 2 Nov; BNB 3 Nov): beli sejumlah "Default amount" dari pengaturan
 * Quick buy (SOL & BNB punya jumlah sendiri). Dengan "Confirm before trading" menyala, dialog tinjau tetap muncul
 * sebelum wallet diminta tanda tangan.
 */
export function QuickBuy({
  mint,
  symbol,
  className,
  label = 'Buy',
  chain = 'sol',
}: {
  mint: string
  symbol: string
  className: string
  label?: string
  chain?: Chain
}) {
  const akun = useAkun()
  const bnb = chain === 'bnb'
  const [bawaan] = usePreferensi(bnb ? 'synt.quickbuy.bnbAmount' : 'synt.quickbuy.amount', bnb ? 0.05 : 0.5)
  const [slippage] = usePreferensi('synt.quickbuy.slippage', 15)
  const [prioritas] = usePreferensi('synt.quickbuy.priority', 0.001)
  const [tinjau] = usePreferensi('synt.quickbuy.confirm', true)
  const [sibuk, setSibuk] = useState(false)
  const wallet = akun.status === 'masuk' ? akun.profil?.wallet ?? null : null
  const mentah = bnb ? keWei(String(bawaan)) : keLamport(String(bawaan))
  const simbol = ASLI[chain].simbol

  const klik = async (e: React.MouseEvent) => {
    e.stopPropagation()
    // akun yang salah jenis (Solana di baris BNB, 0x di baris Solana) → buka drawer masuk
    if (!wallet || wallet.startsWith('0x') !== bnb) {
      window.dispatchEvent(new Event(BUKA_MASUK))
      return
    }
    if (!mentah || sibuk) return
    setSibuk(true)
    if (bnb) {
      await jalankanBnb({ alamat: wallet, token: mint, simbol: symbol, desimal: 18, side: 'buy', amount: mentah, slippageBps: bpsSlippage(slippage), tinjau })
    } else {
      await jalankan({
        alamat: wallet,
        mint,
        simbol: symbol,
        desimal: 6,
        side: 'buy',
        amount: mentah,
        slippageBps: bpsSlippage(slippage),
        prioritasLamports: lamportPrioritas(prioritas),
        tinjau,
      })
    }
    setSibuk(false)
  }

  return (
    <button
      type="button"
      className={className}
      disabled={sibuk}
      aria-label={`Buy ${bawaan} ${simbol} of ${symbol}`}
      title={wallet ? `Buy ${bawaan} ${simbol} of ${symbol}` : 'Sign in to trade'}
      onClick={klik}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {sibuk ? '…' : label}
    </button>
  )
}
