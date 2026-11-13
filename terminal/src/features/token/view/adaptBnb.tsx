import { Suspense, lazy } from 'react'
import type { BnbCalibrationResponse, BnbTokenDetail } from '@/api/types'
import { gambarToken } from '@/components/Avatar'
import { StatusChip } from '@/components/StatusChip'
import { alamatPendek, uang, umur } from '@/lib/format'
import { TEMPLATE } from '@/lib/template'
import { ChartGagal, ChartSkeleton } from '@/features/token/chart/ChartRingan'
import { SUB_GAGAL_UNDUH, muatChartBnb } from '@/features/token/chart/muat'
import { BatasGalat } from '@/lib/potongan'
import { CalibrationCard, N_MIN_BARIS, OutcomeChip, SampleNote, SampleTag } from '@/features/bnb/BnbParts'
import {
  DETIK_SKOR,
  LAUNCHPAD,
  hargaBasi,
  hariKalibrasi,
  judulUsd,
  keadaanSkor,
  pajak,
  persenBase,
  tandaAngka,
  tandaHargaPair,
  tandaLikuiditas,
  tandaPersen,
  tandaUsd,
  teksKurs,
  kalimatPlafon,
  tanggaBnb,
  teksSkor,
  tingkatBnb,
} from '@/features/bnb/bnbFormat'
import { BSCSCAN_ADDRESS, BSCSCAN_TOKEN } from '@/features/bnb/useBnb'
import { PosisiToken } from '@/features/trade/Posisi'
import { TradePanel } from '@/features/trade/TradePanel'
import { DaftarFaktor, TabKosong, kelasDelta, teksPersen } from './TokenView'
import { rapikanTeks, sebabJendelaMuda, tautanSosial, type AnakTangga, type BarisFakta, type ModelSkor, type TokenViewModel } from './model'

// U1 (7 Nov): chart BNB (KLineChart Pro + CSS Pro) dimuat malas; skeleton chart A5 tampil selama potongannya dimuat.
// Putaran 2: potongan tak terunduh → `ChartGagal` di kartu chart saja (BatasGalat), skor/base rate/trade tetap.
const BnbChart = lazy(() => muatChartBnb().then((m) => ({ default: m.BnbChart })))

/* ─────────────────────────────────────────────────────────────────────────
   A4: adapter BNB → `TokenView` (halaman `/bnb/:token`), sama bentuknya dgn `/coin`.

   Field K1-K5 (synt-dash bnb.rs, JALAN 27-28 Okt) dibaca langsung di sini; tipe `BnbTokenDetail` di api/types.ts
   belum memuatnya (A3 menyusun tipe feed paralel), jadi diperluas lokal & semuanya OPSIONAL (respons lama → "—"):
     image/image_thumb (K3, proxy /api/img) · socials (K3) · price_change {m5,h1,h24} persen, SATUAN QUOTE (K4) ·
     curve_progress 0-100 (K4) · price_source pool|curve · liquidity_usd = 2× cadangan quote, HANYA pool (K2) ·
     curve_funds_usd = quote terkumpul di kurva, satu sisi, BUKAN likuiditas (K2) · flags self_graduated|clone +
     clone_count (urutan launch bersimbol sama dlm 24 jam, termasuk dirinya; clone ⇔ ≥3) (K2) · usd_null_reason.
   ⛔ Skor BNB = risiko RUNTUH di detik-120, bukan peluang winner. Base rate dari `/api/bnb/calibration` (provisional).
   ⛔ Tanpa Quick buy / swap / wallet (di luar wewenang).
   ───────────────────────────────────────────────────────────────────────── */

export type BnbTokenK = BnbTokenDetail & {
  socials?: { twitter?: string | null; website?: string | null; telegram?: string | null } | null
  price_change?: { m5?: number | null; h1?: number | null; h24?: number | null } | null
  curve_progress?: number | null
  curve_funds_usd?: number | null
  price_source?: 'pool' | 'curve' | null
  flags?: string[] | null
  clone_count?: number | null
  usd_null_reason?: string | null
}

/** Judul pendek sinyal per `key` (kalimat lengkap tetap dari engine). Kunci tak dikenal → judul umum. */
const SINYAL_BURUK: Record<string, string> = {
  price_not_pumped: 'Pumped by 2m',
  holders_not_thin: 'Thin holders',
  not_a_clone: 'Clone name',
  creator_not_serial: 'Serial creator',
}
const SINYAL_BAIK: Record<string, string> = {
  price_not_pumped: 'Price not pumped',
  holders_not_thin: 'Holders not thin',
  not_a_clone: 'Original name',
  creator_not_serial: 'First launch in a day',
}
const SINYAL_NETRAL: Record<string, string> = {
  price_not_pumped: 'Price run-up',
  holders_not_thin: 'Holder spread',
  not_a_clone: 'Name',
  creator_not_serial: 'Creator history',
}

/** Progres kurva BNB (K4): "Graduated" / "x.x%" / null = tak tercatat. */
function teksKurva(d: BnbTokenK): string | null {
  if (d.graduated) return 'Graduated'
  const cp = d.curve_progress
  return cp == null || !Number.isFinite(cp) ? null : `${cp.toFixed(1)}%`
}

const ARTI_SKOR_BNB = 'Rug risk check at 2 minutes, on the same 0 to 100 scale as Solana: the score is 100 minus the share of tokens with that score that turned out to be rugs. It does not predict winners.'

export function modelBnb(d: BnbTokenK, o: {
  contoh: boolean
  stale: boolean
  /** A5: epoch ms jawaban token terakhir (catatan "showing data from N ago"). */
  staleAt?: number | null
  cal: BnbCalibrationResponse | null
  calContoh: boolean
  calState: 'loading' | 'missing' | 'error'
}): TokenViewModel {
  const { cal } = o
  const contoh = TEMPLATE && o.contoh
  const simbol = rapikanTeks(d.symbol) ?? alamatPendek(d.token)
  const nama = rapikanTeks(d.name)
  const flags = d.flags ?? []
  const q = rapikanTeks(d.quote_symbol)
  const qUpper = q?.toUpperCase() ?? null
  const diKurva = d.price_source === 'curve' || (!d.graduated && d.price_source !== 'pool')

  /* Tag sebaris alamat, urutan §2: peringatan (Creator-filled, Clone) → quote non-BNB → pajak → launchpad. */
  const tags = (
    <span className="tv-tags">
      {flags.includes('self_graduated') && (
        <StatusChip label="Creator-filled" tone="warn" variant="outline"
          info="Graduated with at most one outside buyer over the whole curve: the creator's own buying filled it." />
      )}
      {flags.includes('clone') && d.clone_count != null && d.clone_count >= 3 && (
        <StatusChip label={`Clone ×${d.clone_count - 1}`} tone="warn" variant="outline"
          info={`${d.clone_count - 1} earlier launches used the same symbol in the 24 hours before this one.`} />
      )}
      {q && qUpper !== 'BNB' && qUpper !== 'WBNB' && <StatusChip label={`Quote ${q}`} tone="neutral" variant="outline" info={teksQuote(d)} />}
      {pajak(d.tax_bps) && <StatusChip label={pajak(d.tax_bps)!} tone="neutral" variant="outline" info="Transfer tax set by the token contract." />}
      <StatusChip label={LAUNCHPAD[d.launchpad] ?? d.launchpad} tone="neutral" variant="outline" />
      {d.graduated && <StatusChip label="Graduated" tone="ok" variant="outline" info="Left the bonding curve for a DEX pair." />}
    </span>
  )

  const tautan: TokenViewModel['tautan'] = contoh ? [] : [
    { label: 'BscScan', href: `${BSCSCAN_TOKEN}${d.token}`, jenis: 'explorer' },
    ...(d.creator ? [{ label: 'Creator', href: `${BSCSCAN_ADDRESS}${d.creator}`, jenis: 'creator' as const }] : []),
    ...(d.tx_hash ? [{ label: 'Launch tx', href: `https://bscscan.com/tx/${d.tx_hash}`, jenis: 'tx' as const }] : []),
    ...tautanSosial(d.socials),
  ]

  const hp = tandaHargaPair(d)
  const pc = d.price_change ?? null
  const whyDelta = 'Not measured: no recorded price at the start of this window, or the current price is not recent.'
  const deltas = (
    pc
      ? (['m5', 'h1', 'h24'] as const).map((k, i) => ({ label: ['5m', '1h', '24h'][i]!, value: pc[k] ?? null, why: whyDelta }))
      : [{ label: '5m', value: null, why: 'Price change is not reported for this pair yet.' }, { label: '1h', value: null }, { label: '24h', value: null }]
  ).map((x): { label: string; value: number | null; why?: string } => {
    // U3: aturan umur yang sama dgn SOL (jendela lebih panjang dari umur pair → "—" + umur)
    const muda = sebabJendelaMuda(x.label, d.age_secs)
    return muda ? { label: x.label, value: null, why: muda } : x
  })
  // 24h utk kartu harga & tile kepala: hanya bila terukur DAN pair sudah berumur ≥ 24 jam (U3)
  const muda24 = sebabJendelaMuda('24h', d.age_secs)
  const h24 = !muda24 && pc?.h24 != null && Number.isFinite(pc.h24) ? pc.h24 : null

  const basi = hargaBasi(d)
  const liqSel = diKurva
    ? {
        key: 'liq', label: 'Curve funds',
        value: uang(d.curve_funds_usd ?? null, 'kosong'),
        title: 'Quote collected on the bonding curve, in USD. One side only, not DEX liquidity.',
        why: d.curve_funds_usd == null ? (judulUsd(d, null) ?? 'Not measured yet') : 'Under $1 collected on the curve so far.',
      }
    : {
        key: 'liq', label: 'Liquidity',
        value: tandaLikuiditas(d.liquidity_usd),
        why: judulUsd(d, d.liquidity_usd) ?? 'Liquidity is under $1, so it is not shown as a figure.',
      }

  return {
    chain: 'bnb',
    id: d.token,
    identitas: {
      symbol: simbol,
      name: nama && nama !== simbol ? nama : null,
      address: d.token,
      src: gambarToken(d),
      badges: contoh ? <SampleTag /> : undefined,
      tags,
    },
    tautan,
    tautanCatatan: contoh ? 'Sample address, not on BscScan' : undefined,
    kembali: '/trenches?chain=bnb',
    harga: {
      teks: hp === '—' ? null : hp,
      why: 'No trade price has been recorded for this pair yet.',
      title: basi ?? undefined,
      deltas,
      utama: h24 !== null ? { label: '24h', value: h24 } : null,
    },
    /* R2: tile kepala ala preview. Slot SOL "Since launch / Net flow / Holders / Top 10" → padanan BNB yang terukur
       (24h, Buyers, posisi di menit 2); tak terukur → "—" + sebab (DESIGN §4). */
    metrik: [
      { key: 'mc', label: 'Market cap', value: tandaUsd(d.mcap_usd), why: judulUsd(d, d.mcap_usd) ?? 'Market cap is not available for this pair yet.' },
      // U17: > 1080 px harga besar kartu harga menggantikan tile ini, dan Δ 24h di sampingnya menggantikan tile 24h (hanya
      // bila ada; "—" + sebab U3 tetap di tile)
      { key: 'price', label: 'Price', value: hp === '—' ? null : hp, why: 'No trade price has been recorded for this pair yet.', title: basi ?? undefined, hanyaSampai: 1080 },
      {
        key: 'h24', label: '24h',
        value: h24 !== null ? teksPersen(h24) : null,
        tone: h24 !== null ? kelasDelta(h24) : undefined,
        why: muda24 ?? (pc ? whyDelta : 'Price change is not reported for this pair yet.'),
        ...(h24 !== null ? { hanyaSampai: 1080 as const } : {}),
      },
      { ...liqSel, label: diKurva ? 'Curve funds' : 'Liquidity' },
      // U17: catatan kartu harga lama "on the curve" pindah ke popover ketuk (tile kepala tanpa baris catatan)
      { key: 'buyers', label: 'Buyers', value: tandaAngka(d.buyers), title: 'Distinct wallets that bought on the curve.', why: 'Distinct buying wallets were not measured yet.' },
      /* U4 (audit 7 Nov): label = label Token facts + popover ketuk pada angka. "Top buyer (2m) 99.8%" di sebelah tile
         SOL "Top 10" (= % supply) terbaca sbg "satu wallet pegang 99,8% supply"; angka ini persen dari posisi bersih
         pembeli di 2 menit pertama. Kalimat popover = baris Token facts (satu sumber, `INFO_*_120`). NBSP: "(first 2m)"
         tak terbelah saat label terlipat. */
      { key: 'h120', label: 'Buyers still holding (first\u00a02m)', value: tandaAngka(d.holders_120), title: INFO_HOLDERS_120, lipat: true, why: 'Buyers still holding after the first 2 minutes were not measured for this pair.' },
      { key: 'top1', label: 'Top buyer’s share (first\u00a02m)', value: tandaPersen(d.top1_pct_120), title: INFO_TOP1_120, lipat: true, why: 'The largest buyer’s share in the first 2 minutes was not measured for this pair.' },
    ],
    /* ⭐ U17 (audit 7 Nov): MC, likuiditas/Curve funds & Buyers dulu tampil dua kali (strip kepala + grid ini); kini di
       strip kepala saja. Grid = yang tak ada di kepala & relevan utk transaksi: umur, kurva, pajak. Chip kepala
       "Graduated" / "Tax x%" (tags di atas) sudah menyebut kurva lulus & pajak > 0 → sel itu tak diulang. */
    pasar: [
      { key: 'age', label: 'Age', value: umur(d.age_secs) },
      ...(d.graduated ? [] : [{ key: 'curve', label: 'Curve', value: teksKurva(d), why: 'The curve parameters for this token were not recorded.' }]),
      ...(pajak(d.tax_bps) ? [] : [{
        key: 'tax', label: 'Tax',
        // pajak > 0 sudah jadi chip kepala; yang sampai di sini: tak dilaporkan (null) atau 0
        value: d.tax_bps === null ? null : 'None',
        why: 'This launchpad does not report a transfer tax, so it is unknown.',
      }]),
    ],
    beliJual: {
      judul: 'Buys / sells',
      b: d.buys ?? null,
      s: d.sells ?? null,
      catatan: d.buys == null || d.sells == null
        ? 'Not measured for this pair.'
        : (d.buys ?? 0) + (d.sells ?? 0) > 0
          ? `${Math.round(((d.buys ?? 0) / ((d.buys ?? 0) + (d.sells ?? 0))) * 100)}% buys. Trades synt recorded for this token.`
          : 'No trades recorded.',
    },
    skor: { ...modelSkorBnb(d, cal), kurva: { teks: teksKurva(d) ?? '—', pct: d.graduated ? 100 : d.curve_progress != null && Number.isFinite(d.curve_progress) ? d.curve_progress : null } },
    // A5: catatan data lama seragam dgn /coin (dulu "Not updating, showing the last result")
    basi: o.stale ? { sejak: o.staleAt ?? null } : undefined,
    catatan: (
      <>
        {contoh && <SampleNote>Sample token. This address belongs to the BNB sample data, so every number on this page is an example.</SampleNote>}
        {/* 14b (preseden P2): harga lama ditulis terang-terangan, tanpa menebak sebab; disembunyikan bila semua "—" */}
        {basi && !(hp === '—' && tandaUsd(d.mcap_usd) === '—' && tandaLikuiditas(d.liquidity_usd) === '—') && (
          <p className="cd-nomarket-note" role="note">{basi}. Price, market cap and liquidity are from that moment.</p>
        )}
      </>
    ),
    chart: {
      tfKet: `${teksQuote(d)}${pc ? ` 5m, 1h, 24h: price change in ${q ?? 'quote'} terms, from curve trades and pool prices synt recorded.` : ''}`,
      // A5: sumber di kepala (sama letaknya dgn SOL); isi popover = kueri candle bnb.rs (trade kurva + harga pool bnb_pasca)
      sumber: d.graduated ? 'curve + DEX pool' : `${LAUNCHPAD[d.launchpad] ?? d.launchpad} curve`,
      sumberInfo: d.graduated
        ? 'One minute candles from bonding curve trades synt recorded and, after graduation, DEX pool prices synt recorded, in your time zone. Longer periods are combined from the 1 minute candles in your browser.'
        : 'One minute candles from bonding curve trades synt recorded, in your time zone. Longer periods are combined from the 1 minute candles in your browser.',
      satuan: d.candle_unit,
      isi: (
        <BatasGalat cadangan={<ChartGagal sub={SUB_GAGAL_UNDUH} />}>
          <Suspense fallback={<ChartSkeleton />}>
            <BnbChart token={d.token} symbol={simbol} candles={d.candles} graduated={d.graduated} unit={d.candle_unit} kurs={d.quote_usd ?? null} satuanTakTerbaca={satuanTakTerbaca(d)} />
          </Suspense>
        </BatasGalat>
      ),
    },
    tabs: [
      {
        id: 'factors',
        label: 'Score factors',
        n: d.score?.signals.length ?? null,
        isi: d.score ? (
          <DaftarFaktor
            items={d.score.signals.map((s) => ({
              id: s.key,
              judul: (s.ok === false ? SINYAL_BURUK : s.ok === true ? SINYAL_BAIK : SINYAL_NETRAL)[s.key] ?? 'Check',
              detail: s.text,
              bad: s.ok === null ? null : !s.ok,
            }))}
            kosong="No reasons were returned with this score."
          />
        ) : (
          <TabKosong judul="No score factors." isi={teksSkorKosong(d)} />
        ),
      },
      {
        id: 'holders',
        label: 'Top holders',
        n: null,
        isi: (
          <TabKosong
            judul="Top holders are not listed for BNB pairs yet."
            isi="synt reads BNB positions from launch trades. Buyers still holding after the first 2 minutes, and the largest buyer's share, are in Token facts."
          />
        ),
      },
      // 3 Nov: posisi & riwayat NYATA dari trade akun 0x lewat synt (non-custodial)
      ...(contoh ? [] : [{ id: 'positions', label: 'Positions', isi: <PosisiToken mint={d.token} symbol={simbol} chain="bnb" /> }]),
    ],
    // 3 Nov: trading BNB nyata (four.meme / Flap.sh / KyberSwap) utk pair ber-quote BNB; harga synt hanya perkiraan
    trade: contoh ? undefined : qUpper === 'BNB' || qUpper === 'WBNB' ? (
      <TradePanel
        chain="bnb"
        mint={d.token}
        symbol={simbol}
        priceUsd={d.price_usd != null && d.price_usd > 0 ? d.price_usd : null}
        kurs={d.quote_usd != null && d.quote_usd > 0 ? d.quote_usd : null}
      />
    ) : (
      <section className="cd-card cd-trade" aria-label="Trade">
        <p className="cd-trade-note">
          This token trades against {q ?? 'a token other than BNB'}. Trading on synt covers BNB pairs for now.
        </p>
      </section>
    ),
    fakta: {
      rows: barisFaktaBnb(d, contoh),
      sumber: 'Figures marked first 2m are shares of the tokens bought in the first 2 minutes, not of total supply. From synt’s records of on-chain trades.',
    },
    penutup: <LaciKalibrasi cal={cal} contoh={o.calContoh} state={o.calState} />,
  }
}

function modelSkorBnb(d: BnbTokenK, cal: BnbCalibrationResponse | null): ModelSkor {
  const k = keadaanSkor(d)
  // ⭐ 28 Okt: format SOL — angka 0-100 = 100 − % rug tingkatnya, tangga per angka audit (tanpa "/max")
  const t = k.kind === 'scored' ? tingkatBnb(cal, k.value) : null
  const tangga: AnakTangga[] = tanggaBnb(cal).map((x) => ({ label: String(x.skor), rate: x.rug_pct, aktif: t?.skor === x.skor, sedikit: x.n < N_MIN_BARIS }))
  const hari = cal ? hariKalibrasi(cal) : null
  const kakiTangga = cal
    ? `Share of scored BNB tokens at each score that collapsed (${cal.provisional ? 'provisional table' : 'table'}${hari !== null ? `, ${hari} ${hari === 1 ? 'day' : 'days'}` : ''}, n = ${tandaAngka(cal.base.n)}).`
    : 'BNB calibration is not available yet, so the base rate at each score cannot be shown.'
  const chips = (
    <>
      <OutcomeChip outcome={d.outcome} ageSecs={d.age_secs} />
      {cal?.provisional && (
        <StatusChip label="Provisional" tone="muted" variant="outline"
          info="BNB calibration is still provisional: the base rates can move as more launches are labelled." />
      )}
    </>
  )

  const chipsRingkas = <OutcomeChip outcome={d.outcome} ageSecs={d.age_secs} />
  if (k.kind !== 'scored' || !t) {
    const judul = k.kind === 'pending' ? 'Scoring at 2m' : k.kind === 'quiet' ? 'Quiet · not scored' : k.kind === 'scored' ? (cal ? 'No base rate yet' : 'Calibrating') : 'Not scored'
    // pair ini TIDAK dinilai: aside bukan "scored at 2m"
    const aside = k.kind === 'pending' ? 'scores at 2m' : k.kind === 'quiet' ? 'not scored at 2m' : k.kind === 'scored' ? 'scored at 2m' : undefined
    const sub = k.kind !== 'scored'
      ? teksSkorKosong(d)
      : cal
        ? 'This pair was scored, but the calibration has no row for its score yet, so no number is shown.'
        : 'The score appears once the BNB calibration has loaded: each score is read from it.'
    return { skor: { kind: 'kosong', judul, sub }, aside, chips, chipsRingkas, arti: ARTI_SKOR_BNB + kalimatPlafon(cal), tangga, kakiTangga }
  }
  const kalimat = (
    <>
      <b>{persenBase(t.rug_pct)}</b> of {tandaAngka(t.n)} scored BNB tokens at this score collapsed
      {cal?.base.rug_pct != null ? <>, against <b>{persenBase(cal.base.rug_pct)}</b> across all scored tokens</> : null}
      {cal?.provisional ? ' (provisional).' : '.'}
    </>
  )
  return {
    aside: 'scored at 2m',
    skor: {
      kind: 'value',
      value: t.skor,
      max: 100,
      measured: teksSkor(k).terukur,
      // R2: status di samping cincin (SOL: label checks "Few flags"); BNB = sinyal yang lolos dari maks
      label: `${k.value} of ${k.max} checks passed${k.measured !== null && k.measured < k.max ? `, ${k.measured} measured` : ''}`,
      rate: t.rug_pct,
      rateTeks: persenBase(t.rug_pct),
      kalimat,
    },
    chips,
    chipsRingkas,
    arti: ARTI_SKOR_BNB + kalimatPlafon(cal) + (k.measured !== null && k.measured < k.max ? ` Only ${k.measured} of ${k.max} checks could be measured for this pair.` : ''),
    tangga,
    kakiTangga,
  }
}

function teksSkorKosong(d: BnbTokenK): string {
  const k = keadaanSkor(d)
  if (k.kind === 'pending') {
    return d.age_secs < DETIK_SKOR
      ? `This pair is ${umur(d.age_secs)} old; the score appears once it is ${Math.round(DETIK_SKOR / 60)} minutes old.`
      : 'The score is being computed and appears shortly.'
  }
  if (k.kind === 'quiet') return 'Too few outside buyers by minute 2 to score this launch.'
  // 14b: `score_status` scored tapi `value` null (Option di bnb.rs) ≠ tak dinilai
  return d.score_status === 'scored' ? 'This pair was scored, but its score value was not reported.' : 'This pair was not scored.'
}

/**
 * Fakta BNB. Detik-120 dihitung dari TRADE (synt-bnb 005_fitur.sql), bukan suplai token (putaran 2 Reviewer 14):
 * holders_120 = wallet non-creator dgn posisi bersih > 0; top1_pct_120 = posisi bersih terbesar pembeli non-creator /
 * Σ posisi bersih pembeli non-creator; creator_pct_120 = posisi creator / Σ posisi positif (termasuk creator).
 */
function barisFaktaBnb(d: BnbTokenK, contoh: boolean): BarisFakta[] {
  const cp = d.curve_progress
  const born = d.born_at ? waktuUtc(d.born_at) : null
  const rows: BarisFakta[] = [
    { label: 'Launchpad', value: LAUNCHPAD[d.launchpad] ?? d.launchpad },
    { label: 'Born', value: born ?? '—', tone: born ? null : 'mute' },
    {
      label: 'Curve progress',
      value: d.graduated ? 'Graduated' : cp == null || !Number.isFinite(cp) ? '—' : `${cp.toFixed(1)}%`,
      tone: !d.graduated && cp == null ? 'mute' : null,
      info: !d.graduated && cp == null ? 'The curve parameters for this token were not recorded.' : undefined,
    },
    { label: 'Quote', value: rapikanTeks(d.quote_symbol) ?? '—', tone: d.quote_symbol ? null : 'mute', info: teksQuote(d) },
    {
      label: 'Tax',
      value: d.tax_bps === null ? 'Not reported' : d.tax_bps <= 0 ? 'None' : pajak(d.tax_bps)!.replace(/^Tax /, ''),
      tone: d.tax_bps === null ? 'mute' : null,
      info: d.tax_bps === null ? 'This launchpad does not report a transfer tax, so it is unknown.' : 'Transfer tax set by the token contract.',
    },
  ]
  if (!contoh) {
    rows.push(
      { label: 'Creator', value: d.creator ? <a href={`${BSCSCAN_ADDRESS}${d.creator}`} target="_blank" rel="noreferrer noopener">{alamatPendek(d.creator)} ↗</a> : '—', tone: d.creator ? null : 'mute' },
      { label: 'Launch tx', value: d.tx_hash ? <a href={`https://bscscan.com/tx/${d.tx_hash}`} target="_blank" rel="noreferrer noopener">{alamatPendek(d.tx_hash)} ↗</a> : '—', tone: d.tx_hash ? null : 'mute' },
    )
  }
  rows.push(
    {
      label: 'Buyers still holding (first 2m)',
      value: tandaAngka(d.holders_120),
      info: INFO_HOLDERS_120,
    },
    {
      label: 'Top buyer’s share (first 2m)',
      value: tandaPersen(d.top1_pct_120),
      info: INFO_TOP1_120,
    },
    {
      label: 'Creator’s share of positions (first 2m)',
      value: tandaPersen(d.creator_pct_120),
      info: 'The creator’s position, out of all positive positions including the creator’s, from trades in the first 2 minutes. Not a share of total supply.',
    },
  )
  return rows
}

/** U4: penjelas fakta menit-2, dipakai tile kepala & baris Token facts (kalimat sama). */
const INFO_HOLDERS_120 = 'Wallets other than the creator with a positive net position (bought minus sold) after the first 2 minutes of trades.'
const INFO_TOP1_120 = 'The largest net position of one buyer other than the creator, out of all net positions of buyers other than the creator, from trades in the first 2 minutes. Not a share of total supply.'

/** Keterangan quote: kenapa USD bisa "—". */
function teksQuote(d: BnbTokenK): string {
  const q = rapikanTeks(d.quote_symbol) ?? 'an unknown token'
  if (d.price_usd === null && d.price_quote !== null) {
    return `Quoted in ${q}. Its USD rate is unknown, so price is shown in ${q} and USD values are left blank.`
  }
  if (d.price_usd === null) return `Quoted in ${q}.`
  // U2: chart tetap dalam satuan quote → kurs yang dipakai angka USD ditulis (kalimat sama dgn catatan chart)
  const kurs = teksKurs(d.candle_unit, d.quote_usd)
  return kurs ? `Quoted in ${q}. Values in USD at ${kurs}; the chart stays in ${d.candle_unit}.` : `Quoted in ${q}. Values in USD.`
}

/** 14c: sudah ada trade tapi harga & candle kosong = satuan quote tak terbaca (bnb.rs `satuan_sah`). */
function satuanTakTerbaca(d: BnbTokenDetail): boolean {
  return d.candles.length === 0 && d.price_quote === null && (d.price_at !== null || (d.buys ?? 0) > 0)
}

function waktuUtc(iso: string): string | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** Laci kalibrasi BNB (§3.1/§3.2): ringkasan satu baris, isi lengkap saat dibuka. */
function LaciKalibrasi({ cal, contoh, state }: { cal: BnbCalibrationResponse | null; contoh: boolean; state: 'loading' | 'missing' | 'error' }) {
  const hari = cal ? hariKalibrasi(cal) : null
  const ringkas = cal
    ? [
        cal.provisional ? 'Provisional' : null,
        hari !== null ? `${hari} ${hari === 1 ? 'day' : 'days'}` : null,
        `${tandaAngka(cal.base.n)} scored tokens`,
        cal.base.rug_pct !== null ? `${persenBase(cal.base.rug_pct)} collapsed overall` : null,
      ].filter(Boolean).join(' · ')
    : state === 'loading' ? 'Loading calibration…' : state === 'error' ? 'Cannot reach BNB calibration. Retrying automatically.' : 'BNB calibration is not available yet.'
  return (
    <details className="cd-card tv-drawer">
      <summary>
        <h2 className="cd-card-title">How BNB scores are calibrated</h2>
        {/* A5: kalibrasi memuat sendiri → kerangka, bukan teks "Loading…" */}
        {!cal && state === 'loading'
          ? <i className="sk tv-drawer-skel" role="status" aria-label="Loading calibration" />
          : <span className="tv-drawer-sub">{ringkas}</span>}
      </summary>
      <CalibrationCard cal={cal} contoh={contoh} state={state} />
    </details>
  )
}
