import { useEffect, useRef, useSyncExternalStore } from 'react'
import { ASLI, dariMentah, jumlahRingkas, teksSol, toko, type Jalan, type Tinjauan } from './dagang'
import { teksBnb, type KutipanBnb } from './dagangBnb'
import { bukaDukungan } from '@/features/support/konteks'
import './Trade.css'

/**
 * Lapisan trading di atas semua halaman (dipasang sekali di AppShell): kartu status tiap transaksi
 * (pojok kanan bawah) + dialog tinjau sebelum wallet diminta menandatangani.
 */
export function TradeLayer() {
  const jalan = useSyncExternalStore(toko.langgan, toko.jalan)
  const tinjauan = useSyncExternalStore(toko.langgan, toko.tinjauan)
  return (
    <>
      {jalan.length > 0 && (
        <div className="tr-toasts" role="region" aria-label="Trades" aria-live="polite">
          {jalan.map((j) => (
            <KartuJalan key={j.kunci} j={j} />
          ))}
        </div>
      )}
      {tinjauan && <Tinjau t={tinjauan} />}
    </>
  )
}

const LABEL: Record<Jalan['tahap'], string> = {
  menyiapkan: 'Getting a quote…',
  tinjau: 'Review the trade',
  tanda: 'Confirm in your wallet…',
  kirim: 'Sending…',
  tunggu: 'Waiting for confirmation…',
  berhasil: 'Confirmed',
  gagal: 'Not completed',
}

function KartuJalan({ j }: { j: Jalan }) {
  const selesai = j.tahap === 'berhasil' || j.tahap === 'gagal'
  return (
    <div className={`tr-toast is-${j.tahap}`}>
      <span className="tr-toast-ikon" aria-hidden="true">
        {j.tahap === 'berhasil' ? <Centang /> : j.tahap === 'gagal' ? <Silang /> : <span className="tr-putar" />}
      </span>
      <div className="tr-toast-isi">
        <strong>{j.judul}</strong>
        <span>{j.pesan ?? LABEL[j.tahap]}</span>
        {j.tanda && (
          <a href={ASLI[j.chain].tx(j.tanda)} target="_blank" rel="noreferrer">
            View on {ASLI[j.chain].penjelajah}
          </a>
        )}
        {/* 4 Nov: trade gagal → tiket support dgn trade ini terlampir (id, tanda, galat) */}
        {j.tahap === 'gagal' && (
          <button type="button" className="tr-toast-lapor" onClick={() => bukaDukungan(j.kunci)}>
            Report a problem
          </button>
        )}
      </div>
      {selesai && (
        <button type="button" className="tr-toast-tutup" aria-label="Dismiss" onClick={() => toko.tutup(j.kunci)}>
          <Silang />
        </button>
      )}
    </div>
  )
}

function useKendaliDialog(t: Tinjauan) {
  const ok = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    ok.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && t.jawab(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [t])
  return ok
}

function Tinjau({ t }: { t: Tinjauan }) {
  return t.chain === 'bnb' ? <TinjauBnb t={t} k={t.kutipan} /> : <TinjauSol t={t} />
}

function TinjauSol({ t }: { t: Tinjauan & { chain: 'sol' } }) {
  const k = t.kutipan
  const beli = k.side === 'buy'
  const desimal = k.decimals ?? t.desimal
  const ok = useKendaliDialog(t)

  const bayar = beli ? teksSol(k.inAmount) : `${jumlahRingkas(dariMentah(k.inAmount, desimal))} ${t.simbol}`
  const terima = (x: string) =>
    beli ? `${jumlahRingkas(dariMentah(x, desimal))} ${t.simbol}` : teksSol(x)
  const dampak = k.priceImpactPct == null ? 'Not reported' : `${(k.priceImpactPct * 100).toFixed(2)}%`
  const dampakBesar = (k.priceImpactPct ?? 0) >= 0.05

  return (
    <div className="tr-latar" onClick={(e) => e.target === e.currentTarget && t.jawab(false)}>
      <div className="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="tr-judul">
        <h2 id="tr-judul">{beli ? `Buy ${t.simbol}` : `Sell ${t.simbol}`}</h2>
        {t.segar && <p className="tr-segar">The first quote expired. These are fresh numbers.</p>}
        <dl className="tr-rincian">
          <div>
            <dt>You pay</dt>
            <dd>{bayar}</dd>
          </div>
          <div>
            <dt>You receive (estimate)</dt>
            <dd className="tr-utama">{terima(k.outAmount)}</dd>
          </div>
          <div>
            <dt>Minimum received</dt>
            <dd>{terima(k.minOut)}</dd>
          </div>
          <div>
            <dt>Price impact</dt>
            <dd className={dampakBesar ? 'tr-awas' : undefined}>{dampak}</dd>
          </div>
          <div>
            <dt>Slippage</dt>
            <dd>{(t.slippageBps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%</dd>
          </div>
          <div>
            <dt>Network and priority fee</dt>
            <dd>{teksSol(k.networkFeeLamports)}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{k.route || 'Jupiter'}</dd>
          </div>
          {k.closesTokenAccount && (
            <div>
              <dt>Rent refund</dt>
              <dd>about 0.002 SOL</dd>
            </div>
          )}
        </dl>
        {dampakBesar && (
          <p className="tr-peringatan">
            This trade moves the price by {dampak}. Thin liquidity means you get noticeably less than the current price.
          </p>
        )}
        <p className="tr-catatan">
          synt charges no fee. Your wallet shows the final transaction before you sign it.{' '}
          {k.closesTokenAccount
            ? 'Selling everything also closes the empty token account, so its rent comes back to your wallet.'
            : 'A new token account can add about 0.002 SOL of rent on the first buy.'}
        </p>
        <div className="tr-aksi">
          <button type="button" className="tr-batal" onClick={() => t.jawab(false)}>
            Cancel
          </button>
          <button type="button" ref={ok} className={`tr-ok ${beli ? 'is-buy' : 'is-sell'}`} onClick={() => t.jawab(true)}>
            {beli ? 'Buy' : 'Sell'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Tinjauan BNB: tanpa price impact dari router — gantinya uji beli-lalu-jual di server (pajak & biaya kurva terlihat). */
function TinjauBnb({ t, k }: { t: Tinjauan; k: KutipanBnb }) {
  const beli = k.side === 'buy'
  const desimal = k.decimals ?? t.desimal
  const ok = useKendaliDialog(t)
  const tok = (x: string) => `${jumlahRingkas(dariMentah(x, desimal))} ${t.simbol}`
  const bayar = beli ? teksBnb(k.inAmount) : tok(k.inAmount)
  const terima = (x: string) => (beli ? tok(x) : teksBnb(x))
  const masuk = dariMentah(k.inAmount, 18)
  const balik = k.roundTripWei == null ? null : dariMentah(k.roundTripWei, 18)
  const rugiPct = balik == null || masuk <= 0 ? null : (1 - balik / masuk) * 100
  const rugiBesar = (rugiPct ?? 0) >= 15

  return (
    <div className="tr-latar" onClick={(e) => e.target === e.currentTarget && t.jawab(false)}>
      <div className="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="tr-judul">
        <h2 id="tr-judul">{beli ? `Buy ${t.simbol}` : `Sell ${t.simbol}`}</h2>
        {t.segar && <p className="tr-segar">The first quote expired. These are fresh numbers.</p>}
        <dl className="tr-rincian">
          <div>
            <dt>You pay</dt>
            <dd>{bayar}</dd>
          </div>
          <div>
            <dt>You receive (test run)</dt>
            <dd className="tr-utama">{terima(k.outAmount)}</dd>
          </div>
          <div>
            <dt>Minimum received</dt>
            <dd>{terima(k.minOut)}</dd>
          </div>
          {balik != null && (
            <div>
              <dt>If you sold it all right away</dt>
              <dd className={rugiBesar ? 'tr-awas' : undefined}>
                {teksBnb(k.roundTripWei)}
                {rugiPct != null ? ` (${rugiPct >= 0 ? '−' : '+'}${Math.abs(rugiPct).toFixed(1)}%)` : ''}
              </dd>
            </div>
          )}
          <div>
            <dt>Slippage</dt>
            <dd>{(t.slippageBps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%</dd>
          </div>
          <div>
            <dt>Gas (estimate)</dt>
            <dd>{teksBnb(k.networkFeeWei)}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{k.route}</dd>
          </div>
        </dl>
        {rugiBesar && (
          <p className="tr-peringatan">
            Selling right after buying returns {Math.abs(rugiPct!).toFixed(1)}% less. Token tax, curve fees and thin
            liquidity all count.
          </p>
        )}
        <p className="tr-catatan">
          synt charges no fee.{' '}
          {beli
            ? 'synt tested selling this token back before showing you this quote.'
            : k.approval
              ? `Your wallet asks twice: first to let ${k.venue} use exactly this amount of ${t.simbol}, then for the sale.`
              : 'Your wallet shows the final transaction before you send it.'}
        </p>
        <div className="tr-aksi">
          <button type="button" className="tr-batal" onClick={() => t.jawab(false)}>
            Cancel
          </button>
          <button type="button" ref={ok} className={`tr-ok ${beli ? 'is-buy' : 'is-sell'}`} onClick={() => t.jawab(true)}>
            {beli ? 'Buy' : k.approval ? 'Approve and sell' : 'Sell'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Centang() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="m3 8.5 3.2 3L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Silang() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true">
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
