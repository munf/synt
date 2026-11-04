import { Link } from 'react-router-dom'
import { TEMPLATE } from '@/lib/template'
import type { BnbCalibrationResponse, BnbTrenchItem } from '@/api/types'
import { gambarToken } from '@/components/Avatar'
import { TokenIdentity } from '@/components/TokenIdentity'
import { Metric } from '@/components/Metric'
import { alamatPendek, umur } from '@/lib/format'
import { ARTI_SKOR, BaseRateLine, LaunchpadTag, OutcomeChip, SampleTag, SignalList } from './BnbParts'
import {
  DETIK_SKOR,
  keadaanSkor,
  tandaAngka,
  hargaBasi,
  judulPasar,
  judulUsd,
  tandaHargaPair,
  tandaLikuiditas,
  tandaPersen,
  tandaUsd,
  teksSkor,
} from './bnbFormat'
import { BSCSCAN_TOKEN } from './useBnb'
import '@/features/token/TokenPanel.css'
import './Bnb.css'

/**
 * Panel detail pair BNB di Trenches (butir 14). Seluruh isi dari baris feed `/api/bnb/trenches` yang dipilih, jadi
 * tak ada permintaan tambahan per klik. Tiga kartu: identitas & pasar → skor detik-120 + alasan → fakta detik-120.
 * ⛔ Tanpa Quick buy / swap / wallet (di luar wewenang). Alamat contoh (`sample`) tak diberi tautan BscScan.
 */
export function BnbPanel({ it, cal, contoh, children }: {
  it: BnbTrenchItem
  cal: BnbCalibrationResponse | null
  contoh: boolean
  /** Kartu tambahan di kaki panel (kartu kalibrasi). */
  children?: React.ReactNode
}) {
  const sym = it.symbol || alamatPendek(it.token)

  return (
    <div className="tp bnb-panel">
      <section className="tp-card">
        {/* A2: `TokenIdentity` bersama (= panel Solana): simbol, nama, alamat 0x+4…4 + salin, tag launchpad sebaris. */}
        <header className="tp-head">
          <TokenIdentity
            size="panel"
            symbol={sym}
            name={it.name}
            address={it.token}
            src={gambarToken(it)}
            href={`/bnb/${it.token}`}
            avatarLink
            badges={TEMPLATE && contoh && <SampleTag />}
            tags={<LaunchpadTag it={it} />}
          />
        </header>

        <div className="bnb-addr-row">
          {TEMPLATE && contoh ? (
            <span className="bnb-muted bnb-small">Sample address, not on BscScan</span>
          ) : (
            <a className="bnb-ext" href={`${BSCSCAN_TOKEN}${it.token}`} target="_blank" rel="noreferrer noopener">
              BscScan ↗
            </a>
          )}
        </div>

        <div className="tp-metrics">
          <MetrikPasar it={it} />
        </div>
        <HargaBasiNote it={it} />
        <p className="bnb-small bnb-muted bnb-gap">{teksQuote(it)}</p>

        <Link to={`/bnb/${it.token}`} className="bnb-open">Open token page →</Link>
      </section>

      <ScoreCard it={it} cal={cal} />

      <section className="tp-card">
        <h3 className="card-title">At 2 minutes</h3>
        <Facts it={it} />
      </section>

      {children}
    </div>
  )
}

/**
 * 14b (preseden P2 Solana): harga yang terekam lama ditulis terang-terangan, bukan seolah live.
 * ⛔ Putaran 2 (Reviewer): TANPA sebab & durasi. Klaim "pool hanya di-poll ±100 mnt" dibantah data live (token lulus
 * 18 jam bercandle s/d menit 1077) dan engine sedang diubah → yang ditulis hanya umur harga apa adanya.
 */
export function HargaBasiNote({ it }: {
  it: Pick<BnbTrenchItem, 'price_at' | 'price_usd' | 'price_quote' | 'quote_symbol' | 'mcap_usd' | 'liquidity_usd'>
}) {
  const t = hargaBasi(it)
  if (!t) return null
  // 14c nit: harga, MC & likuiditas semuanya "—" → tak ada angka yang "berasal dari saat itu"; catatan disembunyikan
  if (tandaHargaPair(it) === '—' && tandaUsd(it.mcap_usd) === '—' && tandaLikuiditas(it.liquidity_usd) === '—') return null
  return (
    <p className="bnb-price-stale" role="note">
      {t}. Price, market cap and liquidity are from that moment.
    </p>
  )
}

/** Keterangan quote di bawah metrik: kenapa USD bisa "—". */
export function teksQuote(it: Pick<BnbTrenchItem, 'quote_symbol' | 'price_usd' | 'price_quote'>): string {
  const q = it.quote_symbol ?? 'an unknown token'
  if (it.price_usd === null && it.price_quote !== null) {
    return `Quoted in ${q}. Its USD rate is unknown, so price is shown in ${q} and USD values are left blank.`
  }
  // nit Reviewer: tanpa harga sama sekali, "Values in USD." tak berarti apa-apa
  if (it.price_usd === null) return `Quoted in ${q}.`
  return `Quoted in ${q}. Values in USD.`
}

/**
 * Enam tile pasar BNB (panel Trenches & kartu Market /bnb) dgn komponen `Metric` bersama (A2): tampil sama dgn tile
 * Solana. "—" membawa sebabnya lewat popover ketuk (dulu hanya `title`, tak terjangkau sentuh).
 */
export function MetrikPasar({ it }: { it: BnbTrenchItem }) {
  const liq = tandaLikuiditas(it.liquidity_usd)
  return (
    <>
      <Metric label="Price" value={tandaHargaPair(it)} title={hargaBasi(it) ?? undefined} why="No trade price has been recorded for this pair yet." />
      <Metric label="Market cap" value={tandaUsd(it.mcap_usd)} title={judulPasar(it, it.mcap_usd)} why={judulUsd(it, it.mcap_usd)} />
      <Metric
        label="Liquidity"
        value={liq}
        title={judulPasar(it, it.liquidity_usd)}
        why={judulUsd(it, it.liquidity_usd) ?? 'Liquidity is under $1, so it is not shown as a figure.'}
      />
      <Metric label="Age" value={umur(it.age_secs)} />
      <Metric label="Buyers" value={tandaAngka(it.buyers)} why="Distinct buying wallets were not measured yet." />
      <Metric label="Buys / sells" value={`${tandaAngka(it.buys)} / ${tandaAngka(it.sells)}`} />
    </>
  )
}

/** Kartu skor detik-120 + base rate + alasan. Dipakai juga halaman token. */
export function ScoreCard({ it, cal }: { it: BnbTrenchItem; cal: BnbCalibrationResponse | null }) {
  const k = keadaanSkor(it)
  return (
    <section className="tp-card">
      <div className="bnb-score-head">
        <h3 className="card-title">Score at 2 minutes</h3>
        <OutcomeChip outcome={it.outcome} ageSecs={it.age_secs} />
      </div>
      {k.kind === 'scored' && it.score ? (
        <>
          <p className="bnb-score-big" title={ARTI_SKOR}>
            {k.value}<span className="bnb-score-max">/{k.max}</span>
            {teksSkor(k).terukur && <span className="bnb-score-measured">{teksSkor(k).terukur}</span>}
          </p>
          <p className="bnb-score-what">Rug risk check. A low score means higher rug risk; it does not predict winners.</p>
          {k.measured !== null && k.measured < k.max && (
            <p className="bnb-muted bnb-small">
              Only {k.measured} of {k.max} checks could be measured for this pair.
            </p>
          )}
          <BaseRateLine cal={cal} value={k.value} />
          <h4 className="bnb-sub card-subtitle">Why</h4>
          <SignalList score={it.score} />
        </>
      ) : k.kind === 'pending' ? (
        <p className="bnb-muted">
          Scoring at 2m.{' '}
          {it.age_secs < DETIK_SKOR
            ? `This pair is ${umur(it.age_secs)} old; the score appears once it is ${Math.round(DETIK_SKOR / 60)} minutes old.`
            : 'The score is being computed and appears shortly.'}
        </p>
      ) : k.kind === 'quiet' ? (
        <p className="bnb-muted">
          Quiet, not scored. Too few outside buyers by minute 2 to score this launch.
        </p>
      ) : (
        <p className="bnb-muted">
          {/* 14b: `score_status` scored tapi `value` null (Option di bnb.rs) ≠ tak dinilai */}
          {it.score_status === 'scored' ? 'This pair was scored, but its score value was not reported.' : 'This pair was not scored.'}
        </p>
      )}
    </section>
  )
}

/**
 * Fakta beku detik-120, dihitung dari TRADE (synt-bnb 005_fitur.sql), bukan dari suplai token:
 * · `holders_120` = wallet non-creator dgn posisi bersih (beli − jual) > 0;
 * · `top1_pct_120` = posisi bersih terbesar seorang pembeli non-creator / Σ posisi bersih pembeli non-creator;
 * · `creator_pct_120` = posisi creator / Σ posisi positif (termasuk creator).
 * ⛔ Putaran 2 (Reviewer): dulu berlabel "Largest holder"/"Creator holding" = terbaca porsi SUPLAI. Penyebut di tooltip.
 */
export function Facts({ it }: { it: BnbTrenchItem }) {
  return (
    <>
    <dl className="bnb-facts">
      <div title="Wallets other than the creator with a positive net position (bought minus sold) after the first 2 minutes of trades.">
        <dt>Buyers still holding (first 2m)</dt><dd>{tandaAngka(it.holders_120)}</dd>
      </div>
      <div title="The largest net position of one buyer other than the creator, out of all net positions of buyers other than the creator, from trades in the first 2 minutes. Not a share of total supply.">
        <dt>Top buyer's share (first 2m)</dt><dd>{tandaPersen(it.top1_pct_120)}</dd>
      </div>
      <div title="The creator's position, out of all positive positions including the creator's, from trades in the first 2 minutes. Not a share of total supply.">
        <dt>Creator's share of positions (first 2m)</dt><dd>{tandaPersen(it.creator_pct_120)}</dd>
      </div>
    </dl>
    <p className="bnb-facts-note">Shares of the tokens bought in the first 2 minutes, not of total supply.</p>
    </>
  )
}
