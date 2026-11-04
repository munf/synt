import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useAkun } from '@/features/account/useAkun'
import { ASLI, dagangApi, dariMentah, jumlahRingkas, toko, type Chain, type Posisi, type Transaksi } from './dagang'
import { bnbApi } from './dagangBnb'
import { BUKA_MASUK } from './TradePanel'
import './Trade.css'

/**
 * Posisi & riwayat dari transaksi yang dibuat LEWAT synt (2 Nov). Transfer token dari luar synt tak terhitung,
 * jadi modal & untung/rugi hanya jujur untuk token yang seluruhnya diperdagangkan di sini — ditulis di kaki tabel.
 */

/** Muat ulang saat sebuah transaksi selesai (status kartu berubah ke berhasil). */
function useSelesaiTerbaru(): number {
  const jalan = useSyncExternalStore(toko.langgan, toko.jalan)
  return jalan.filter((j) => j.tahap === 'berhasil').length
}

/** Akun yang masuk & chain-nya: alamat 0x = BNB Chain, selain itu Solana (dua akun terpisah, 1 Nov). */
function useMasuk() {
  const akun = useAkun()
  const wallet = akun.status === 'masuk' ? akun.profil?.wallet ?? null : null
  const chain: Chain | null = wallet ? (wallet.startsWith('0x') ? 'bnb' : 'sol') : null
  return { status: akun.status, wallet, chain }
}

const tautanToken = (mint: string, chain: Chain) => (chain === 'bnb' ? `/bnb/${mint}` : `/coin/${mint}`)

/** Angka koin asli (sudah desimal) → "0.12 SOL" / "0.0123 BNB". */
function teksN(n: number, chain: Chain): string {
  const a = Math.abs(n)
  return `${n.toLocaleString('en-US', { maximumFractionDigits: a >= 1 ? 3 : a >= 0.01 ? 4 : 6 })} ${ASLI[chain].simbol}`
}

function Ajak({ teks }: { teks: string }) {
  return (
    <div className="tr-kosong">
      <p>{teks}</p>
      <button type="button" className="tr-masuk" onClick={() => window.dispatchEvent(new Event(BUKA_MASUK))}>
        Sign in with wallet
      </button>
    </div>
  )
}

export interface NilaiPosisi {
  p: Posisi
  chain: Chain
  pegang: number
  modalSol: number
  hasilSol: number
  nilaiSol: number | null
  untungSol: number | null
  untungPct: number | null
}

/** `solSpent`/`solReceived`/`solUsd` = koin asli chain itu (BNB wei & harga BNB utk akun 0x). */
export function hitung(p: Posisi, solUsd: number | null, chain: Chain = 'sol'): NilaiPosisi {
  const desimal = p.decimals ?? (chain === 'bnb' ? 18 : 6)
  const pegang = dariMentah(p.balance, desimal)
  const modalSol = dariMentah(p.solSpent, ASLI[chain].desimal)
  const hasilSol = dariMentah(p.solReceived, ASLI[chain].desimal)
  const nilaiSol = p.priceUsd && solUsd ? (pegang * p.priceUsd) / solUsd : pegang === 0 ? 0 : null
  const untungSol = nilaiSol == null ? null : hasilSol + nilaiSol - modalSol
  const untungPct = untungSol == null || modalSol <= 0 ? null : (untungSol / modalSol) * 100
  return { p, chain, pegang, modalSol, hasilSol, nilaiSol, untungSol, untungPct }
}

const bertanda = (n: number, chain: Chain) => `${n >= 0 ? '+' : '−'}${teksN(Math.abs(n), chain)}`
const kelas = (n: number | null) => (n == null ? '' : n >= 0 ? 'is-up' : 'is-down')

/** Daftar posisi akun (halaman Portfolio & drawer). */
export function usePosisi() {
  const { chain } = useMasuk()
  const selesai = useSelesaiTerbaru()
  const [data, setData] = useState<{ daftar: NilaiPosisi[]; solUsd: number | null; chain: Chain } | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const muat = useCallback(() => {
    if (!chain) return
    ;(chain === 'bnb' ? bnbApi.posisi() : dagangApi.posisi())
      .then((r) => {
        setData({ daftar: r.positions.map((p) => hitung(p, r.solUsd, chain)), solUsd: r.solUsd, chain })
        setGalat(null)
      })
      .catch((e: Error) => setGalat(e.message))
  }, [chain])
  useEffect(() => {
    setData(null)
    muat()
    if (!chain) return
    const t = setInterval(() => document.visibilityState === 'visible' && muat(), 30_000)
    return () => clearInterval(t)
  }, [muat, chain, selesai])
  return { data, galat, chain }
}

export function TabelPosisi({ ringkas, onBuka }: { ringkas?: boolean; onBuka?: () => void }) {
  const { status } = useMasuk()
  const { data, galat, chain } = usePosisi()
  if (status === 'memuat') return null
  if (!chain) return <Ajak teks="Sign in with your wallet to see positions from trades you make on synt." />
  if (galat && !data) return <p className="tr-kosong">{galat}</p>
  if (!data) return <p className="tr-kosong">Loading positions…</p>
  if (data.daftar.length === 0) return <p className="tr-kosong">No trades yet. Buy a token from its page to open a position.</p>

  const c = data.chain
  const total = data.daftar.reduce((n, x) => n + (x.nilaiSol ?? 0), 0)
  const untung = data.daftar.reduce((n, x) => n + (x.untungSol ?? 0), 0)
  return (
    <div className="tr-tabel">
      <div className="tr-ringkas">
        <span>
          <b>{teksN(total, c)}</b>
          {data.solUsd ? ` ≈ $${(total * data.solUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''}
        </span>
        <span className={kelas(untung)}>{bertanda(untung, c)} all time</span>
      </div>
      <div className="tr-baris is-kepala">
        <span>Token</span>
        <span className="ta-r">Holding</span>
        <span className="ta-r">Value</span>
        <span className="ta-r">P/L</span>
      </div>
      {data.daftar.map((x) => (
        <div key={x.p.mint} className="tr-baris">
          <span>
            <Link to={tautanToken(x.p.mint, c)} onClick={onBuka}>
              {x.p.symbol ?? `${x.p.mint.slice(0, 4)}…${x.p.mint.slice(-4)}`}
            </Link>
          </span>
          <span className="ta-r">{jumlahRingkas(x.pegang)}</span>
          <span className="ta-r">{x.nilaiSol == null ? '—' : teksN(x.nilaiSol, c)}</span>
          <span className={`ta-r ${kelas(x.untungSol)}`}>
            {x.untungSol == null
              ? '—'
              : ringkas
                ? x.untungPct == null
                  ? bertanda(x.untungSol, c)
                  : `${x.untungPct >= 0 ? '+' : ''}${x.untungPct.toFixed(1)}%`
                : `${bertanda(x.untungSol, c)}${x.untungPct == null ? '' : ` (${x.untungPct >= 0 ? '+' : ''}${x.untungPct.toFixed(1)}%)`}`}
          </span>
        </div>
      ))}
      <p className="tr-kaki">
        {c === 'bnb'
          ? 'Counts trades made through synt only. Cost includes gas. Value uses the latest price synt recorded'
          : 'Counts trades made through synt only. Cost includes network fees and token account rent. Value uses the latest Jupiter price'}
        {data.solUsd ? '' : ' (not available right now)'}.
      </p>
    </div>
  )
}

/** Tab "Positions" di halaman token: posisi & riwayat akun untuk mint ini. */
export function PosisiToken({ mint, symbol, chain = 'sol' }: { mint: string; symbol: string; chain?: Chain }) {
  const { status, chain: akunChain } = useMasuk()
  const cocok = akunChain === chain
  const selesai = useSelesaiTerbaru()
  const [trades, setTrades] = useState<Transaksi[] | null>(null)
  const [saldo, setSaldo] = useState<{ amount: string; decimals: number } | null>(null)
  useEffect(() => {
    if (!cocok) return
    dagangApi
      .riwayat(mint)
      .then((r) => setTrades(r.trades))
      .catch(() => setTrades([]))
    ;(chain === 'bnb' ? bnbApi.saldo(mint) : dagangApi.saldo(mint))
      .then((r) => setSaldo(r.token))
      .catch(() => undefined)
  }, [mint, cocok, chain, selesai])

  if (status === 'memuat') return null
  if (!cocok) {
    const jenis = chain === 'bnb' ? 'an EVM wallet (BNB Chain)' : 'a Solana wallet'
    return <Ajak teks={`Sign in with ${jenis} to trade ${symbol} and see your position here.`} />
  }
  if (!trades) return <p className="tr-kosong">Loading your trades…</p>
  if (trades.length === 0) return <p className="tr-kosong">You have not traded {symbol} on synt yet.</p>

  const desimal = saldo?.decimals ?? (chain === 'bnb' ? 18 : 6)
  return (
    <div className="tr-tabel">
      <div className="tr-ringkas">
        <span>
          Holding <b>{jumlahRingkas(dariMentah(saldo?.amount, desimal))} {symbol}</b>
        </span>
      </div>
      <div className="tr-baris is-kepala">
        <span>Trade</span>
        <span className="ta-r">{symbol}</span>
        <span className="ta-r">{ASLI[chain].simbol}</span>
        <span className="ta-r">Status</span>
      </div>
      {trades.map((t) => {
        const tok = t.tokenDelta != null ? dariMentah(t.tokenDelta, desimal) : null
        const asli = t.nativeDelta ?? t.solDelta
        const sol = asli != null ? dariMentah(asli, ASLI[chain].desimal) : null
        return (
          <div key={t.id} className="tr-baris">
            <span>
              <span className={t.side === 'buy' ? 'is-up' : 'is-down'}>{t.side === 'buy' ? 'Buy' : 'Sell'}</span>{' '}
              <time dateTime={t.createdAt}>{new Date(t.createdAt).toLocaleString()}</time>
            </span>
            <span className="ta-r">{tok == null ? '—' : `${tok >= 0 ? '+' : '−'}${jumlahRingkas(Math.abs(tok))}`}</span>
            <span className="ta-r">{sol == null ? '—' : bertanda(sol, chain)}</span>
            <span className="ta-r">
              {t.signature ? (
                <a href={ASLI[chain].tx(t.signature)} target="_blank" rel="noreferrer" title={t.error ?? undefined}>
                  {LABEL[t.status]}
                </a>
              ) : (
                LABEL[t.status]
              )}
            </span>
          </div>
        )
      })}
      <p className="tr-kaki">Amounts are the actual changes in your wallet, including fees.</p>
    </div>
  )
}

const LABEL: Record<Transaksi['status'], string> = {
  prepared: 'Prepared',
  sent: 'Pending',
  confirmed: 'Confirmed',
  failed: 'Failed',
  expired: 'Expired',
}
