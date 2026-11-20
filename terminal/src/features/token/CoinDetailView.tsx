import { TradePanel } from '@/features/trade/TradePanel'
import { PosisiToken } from '@/features/trade/Posisi'
import { useEffect } from 'react'
import { WalletLink } from '@/features/wallet/WalletLink'
import type { CoinDetail } from './detail'
import { Avatar } from '@/components/Avatar'
import { useCopy } from '@/lib/useCopy'
import { PriceChartLive } from './PriceChartLive'
import { kursSolUsd } from './adaptDetail'
import { alamatPendek, harga, uang, usd, compact, umur } from '@/lib/format'
import { namaDex, namaPool, teksDiperiksa, useDexNama, useDexPasar, useTokenFacts, type DexFakta, type Fakta, type HargaFakta, type LpFakta } from './externalFacts'
import { JUDUL_PASAR_BELUM, LABEL_LIKUIDITAS_SOL, LABEL_PASAR_BELUM, SEBAB_SEJAK_TAK_TERCATAT, infoLikuiditasSol, labelNetFlow as labelNetFlowDari, menitJendela, mesinSegar as segarDari, teksNetFlow, teksTop10 } from './labels'
import { CopyIcon, DaftarFaktor, ExternalIcon, FactsCard, kelasDelta, TabKosong, teksPersen, TokenView, WarnIcon } from './view/TokenView'
import { CatatanBasi } from './chart/ChartRingan'
import {
  N_TABEL_SOL,
  TANGGA_SOL,
  rapikanTeks,
  sebabJendelaMuda,
  tautanSosial,
  type BarisFakta,
  type Delta,
  type ModelSkor,
  type TokenViewModel,
} from './view/model'

/**
 * Halaman detail coin Solana — ADAPTER ke `TokenView` bersama (A4, DESIGN-TERMINAL §3.2).
 *
 * ⭐ Porosnya tetap SKOR AUDIT: skor + base rate di strip atas lipatan dan kartu skor (tangga publik) di kepala kolom
 * kanan; chart sebagai konteks. Bentuk halaman kini milik `TokenView` (sama dgn /bnb); berkas ini hanya mengisi
 * slotnya dgn data mesin + fakta eksternal, dgn label jujur butir 1/1b/1c/P2/P3/P5/7/B7 dipertahankan:
 *   "Since launch" (change_pct), "Net flow, first N min" (bukan volume), "(at audit)", "Post-graduation market not
 *   loaded", kurva hanya dgn bukti pump.fun, LP & Dex paid dari RugCheck/DexScreener dgn sumber tertulis.
 * ⛔ Redundansi dibuang (A4): "Since launch", progres kurva & Top 10 kini masing-masing SEKALI (strip / fakta).
 * ⛔ Angka skor, `checks` & base rate tak berubah; hanya tampilannya (tangga skor, warna dari base rate, §6.1 no. 2).
 */

/* ⭐ B7 (disetujui pemilik 26 Okt, synt-dash `dex_market`): 5m/1h/24h = `priceChange` pair acuan DexScreener
   (aturan sama dgn amm.rs: quote SOL, likuiditas terukur tertinggi; pair kurva hanya bila tak ada yang lain).
   Sumber & PAIR-nya ditulis di bawah kepala (tooltip tak terbaca di layar sentuh). ⛔ Token sudah lulus tapi pair
   acuannya masih kurva pump.fun → perubahan itu milik kurva yang sudah tutup, bukan pasar → "—" + alasan.
   Tak ada nilai → "—" (bukan 0%). Server lama tanpa `dex_market` ('absent') → "—" + "Not available yet" seperti dulu. */
const SEL_PASAR = [['5m', 'm5', '5 minutes'], ['1h', 'h1', 'hour'], ['24h', 'h24', '24 hours']] as const
function selPasar(p: HargaFakta | 'absent', lulus: boolean, hargaBelumDimuat: boolean): {
  sel: { label: string; value: number | null; title?: string }[]
  ket: string | null
} {
  const kosong = (title?: string) => SEL_PASAR.map(([label]) => ({ label, value: null, title }))
  if (p === 'absent') return { sel: kosong('Not available yet'), ket: null }
  if (p.status === 'loading') return { sel: kosong('Loading…'), ket: null }
  if (p.status === 'error') {
    const t = p.sebab === 'sumber' ? 'DexScreener did not answer' : 'Checks unavailable, try again shortly'
    return { sel: kosong(t), ket: `5m, 1h, 24h: ${t}.` }
  }
  if (p.value === null) {
    // ⛔ Putaran 2: bukan "lists no SOL pair" — DexScreener bisa mendaftar pool USDC atau pool SOL berlikuiditas $0,
    // yang memang ditolak aturan pair acuan synt-dash. Klaimnya: tak ada pair SOL BERLIKUIDITAS.
    const t = 'DexScreener reports no SOL pair with liquidity for this token.'
    return { sel: kosong(t), ket: `5m, 1h, 24h: ${t}` }
  }
  const v = p.value
  const kurvaPf = v.dex === 'pumpfun'
  if (kurvaPf && lulus) {
    const t = 'DexScreener reports no SOL pair with liquidity besides the pump.fun curve, which closed at graduation. Its change describes the curve, not the market.'
    return { sel: kosong(t), ket: `5m, 1h, 24h not shown. ${t}` }
  }
  const sumber = `DexScreener, ${namaDex(v.dex)} pair`
  const diperiksa = teksDiperiksa(p)
  // P2 (harga disembunyikan) tapi perubahan dari pair AMM tetap tampil → katakan terang-terangan dua sumbernya beda
  const awal = hargaBelumDimuat ? `5m, 1h, 24h: price not loaded by synt; change from ${sumber}.` : `5m, 1h, 24h: ${sumber}.`
  return {
    sel: SEL_PASAR.map(([label, k, rentang]) => ({
      label,
      value: v[k],
      title: v[k] === null ? `${sumber}: no ${label} change reported.` : `${sumber}: price change over the last ${rentang}.`,
    })),
    ket: `${awal}${diperiksa ? ` ${diperiksa}` : ''}`,
  }
}

/**
 * Keadaan kurva yang DITAMPILKAN + sumbernya (1b putaran 2, keputusan orkestrator).
 *
 * ⭐ RugCheck = otoritas kurva vs lulus (pool terbesar `pump_fun` = kurva). Mesin hanya cadangan saat RugCheck gagal,
 * ditulis berlabel "(engine)". ⛔ Progres kurva mesin bisa BEKU di akhir jendela ukur (synt-dash jatuh ke `v10_flow`
 * bila synt-stream tak memegang pair) → bila umur pair jauh melewati jendela, angkanya ditulis "at 10 min";
 * pair yang RugCheck sebut lulus TIDAK menampilkan 7,0% beku sbg progres sekarang.
 */
interface Kurva {
  status: 'graduated' | 'curve' | 'unknown'
  /** Teks utk fakta "Curve progress" & kepala bar "Bonding curve". */
  teks: string
  /** Teks pendek utk sel "Curve" kartu harga. */
  singkat: string
  /** Lebar bar; null = bar disembunyikan (tak ada angka sekarang yang jujur). */
  pct: number | null
  sumber: 'rugcheck' | 'engine' | 'sample' | null
}

/** Data kurva mesin masih mengikuti pair (bukan beku di akhir jendela ukur). */
function mesinSegar(c: CoinDetail): boolean {
  return segarDari(c.ageSecs, c.windowSecs)
}
function jendela(c: CoinDetail): string {
  return `${menitJendela(c.windowSecs)} min`
}

function kurvaMesin(c: CoinDetail): Kurva {
  if (c.curveState === 'graduated') return { status: 'graduated', teks: 'Graduated (engine)', singkat: 'Graduated', pct: 100, sumber: 'engine' }
  if (c.curveState === 'unknown') return { status: 'unknown', teks: 'Not tracked', singkat: 'Not tracked', pct: null, sumber: null }
  const p = `${c.graduationPct.toFixed(1)}%`
  return mesinSegar(c)
    ? { status: 'curve', teks: `${p} (engine)`, singkat: p, pct: c.graduationPct, sumber: 'engine' }
    : { status: 'curve', teks: `${p} at ${jendela(c)} (engine)`, singkat: `${p} at ${jendela(c)}`, pct: null, sumber: 'engine' }
}

function selesaikanKurva(c: CoinDetail, lp: LpFakta, sample: boolean): Kurva {
  if (sample) {
    const t = c.complete ? 'Graduated' : `${c.graduationPct.toFixed(1)}%`
    return { status: c.curveState, teks: t, singkat: t, pct: c.graduationPct, sumber: 'sample' }
  }
  if (lp.status === 'loading') return { status: 'unknown', teks: 'Checking…', singkat: 'Checking…', pct: null, sumber: null }
  if (lp.status === 'ok' && lp.value === 'curve') {
    // RugCheck: masih di kurva. Angka progres hanya dari mesin, berlabel umur bila beku.
    if (c.curveState === 'unknown') return { status: 'curve', teks: 'On the curve', singkat: 'On the curve', pct: null, sumber: 'rugcheck' }
    const p = `${c.graduationPct.toFixed(1)}%`
    return mesinSegar(c)
      ? { status: 'curve', teks: p, singkat: p, pct: c.graduationPct, sumber: 'rugcheck' }
      : { status: 'curve', teks: `${p} at ${jendela(c)}`, singkat: `${p} at ${jendela(c)}`, pct: null, sumber: 'rugcheck' }
  }
  if (lp.status === 'ok' && typeof lp.value === 'object') {
    /* ⛔ 1c: pool AMM saja BUKAN bukti "lulus" — BONK (orca) dulu tampil "Graduated" + bar penuh. "Graduated" hanya
       dgn bukti pump.fun: RugCheck mencatat market pump.fun, atau mesin (launchpad / mint `…pump`). */
    if (lp.value.pumpPasar || c.pumpBukti) return { status: 'graduated', teks: 'Graduated', singkat: 'Graduated', pct: 100, sumber: 'rugcheck' }
    return { status: 'unknown', teks: 'Not tracked', singkat: 'Not tracked', pct: null, sumber: null }
  }
  // RugCheck gagal atau tak menemukan pool → cadangan mesin
  return kurvaMesin(c)
}

/** `sample` = halaman contoh (mint karangan): fakta eksternal TIDAK ditanyakan, ditulis "Sample". */
export function CoinDetailView({ coin: c, sample = false, onKeputusan, muat }: {
  coin: CoinDetail
  sample?: boolean
  /**
   * A5: keadaan muat per sumber (CoinNyata). `tokenBasi` = epoch ms jawaban /api/token terakhir saat polling gagal
   * (undefined = segar); `holders` = /api/holders (tab Top holders & Trades).
   */
  muat?: { tokenBasi?: number | null; holders?: { memuat: boolean; basi?: number | null } }
  /** 1d: dipanggil saat sudah pasti apakah halaman penuh (true) atau "Not tracked" (false) yang tampil — CoinNyata
   *  memakainya utk menghentikan polling /api/token & tak meminta /api/holders bagi mint yang datanya tak ditampilkan. */
  onKeputusan?: (pump: boolean) => void
}) {
  // ⭐ LP & Dex paid NYATA (lab butir 1; sejak B5 lewat synt-dash `/api/facts`), lihat externalFacts.ts. Jawaban RugCheck
  // juga menentukan status kurva (fakta "Curve progress").
  const { lp, dex } = useTokenFacts(c.mint, !sample, c.pumpBukti)
  const kurva = selesaikanKurva(c, lp, sample)

  /* ⛔ 1c putaran 2 (keputusan orkestrator): mint TANPA bukti pump.fun = data mesin tak bisa dipercaya (BONK datang
     bernama "SMACK", harga ±3.300× DexScreener). Nama/harga/skor mesin TIDAK ditampilkan; yang tersisa hanya fakta
     eksternal yang tetap sah (LP, Dex paid). Bukti RugCheck (kurva `pump_fun`) ikut dihitung saat sudah menjawab. */
  const pump = sample || c.pumpBukti || (lp.status === 'ok' && (lp.value === 'curve' || (typeof lp.value === 'object' && lp.value.pumpPasar)))
  // B7: 5m/1h/24h dari pair acuan DexScreener lewat /api/facts `dex_market` (disegarkan 60 dtk).
  // Putaran 2: hanya utk halaman penuh (bukti pump.fun) — mint Not-tracked dulu ikut polling 60 dtk sia-sia.
  const pasar = useDexPasar(c.mint, !sample && pump)
  const lulus = c.curveState === 'graduated' || kurva.status === 'graduated'
  const { sel, ket: selKet } = selPasar(pasar, lulus, c.marketNotLoaded)
  // keputusan final: bukti pump.fun ada, ATAU RugCheck sudah menjawab (ok/galat) tanpa bukti
  const final = pump || lp.status !== 'loading'
  useEffect(() => {
    if (final) onKeputusan?.(pump)
  }, [final, pump, onKeputusan])
  if (!pump) return <TakDilacak mint={c.mint} />

  const why = alasanKosong(c)
  const simbol = rapikanTeks(c.symbol) ?? alamatPendek(c.mint)
  const sosial = tautanSosial(c.socials)

  const sejak: Delta = { label: 'Since launch', value: c.changeSinceLaunch, why: why.sejak }
  const deltas: Delta[] = [
    // ⭐ 1c: change_pct = harga kini vs harga PERTAMA `v10_flow` → "Since launch" (bukan 24 jam).
    sejak,
    // U3: jendela lebih panjang dari umur pair → "—" + umur (DexScreener mengisi h1 = h24 utk pair muda)
    ...sel.map((x) => {
      const muda = sebabJendelaMuda(x.label, c.ageSecs)
      return muda ? { label: x.label, value: null, why: muda } : { label: x.label, value: x.value, why: x.title }
    }),
  ]

  // A5: /api/holders gagal tapi daftar lama ada → daftar tetap + catatan (tab Top holders memuat sendiri)
  const hb = muat?.holders?.basi
  const basiHolders = hb !== undefined ? <CatatanBasi sejak={hb} className="tv-tab-stale" /> : null

  /* ⭐ R2: angka kepala & kartu harga = preview (1c: "Since launch", "Net flow, first N min" bukan volume,
     "(at audit)"; likuiditas < $1 → "<$1", tak terukur → "—" + sebab). */
  const mc = { label: 'Market cap', value: uang(c.marketCap), why: why.mc }
  // U22: sisi SOL saja (labels.ts); sumber per keadaan engine (`complete` = pool DexScreener, else bonding curve)
  const liq = { label: LABEL_LIKUIDITAS_SOL, value: uang(c.liquidity), why: why.liq, title: infoLikuiditasSol(c.complete) }
  const netFlow = { label: labelNetFlowDari(c.windowSecs), value: teksNetFlow(c.netFlowUsd), why: 'Net flow was not measured for this pair.' }
  const top10 = { label: 'Top 10 (at audit)', value: teksTop10(c.top10Pct), why: 'Top 10 share was not recorded when this pair was audited.' }
  const hargaTeks = c.marketNotLoaded || !(c.price > 0) ? null : harga(c.price)
  const b = c.curveBuys
  const s = c.curveSells
  const total = (b ?? 0) + (s ?? 0)

  const m: TokenViewModel = {
    chain: 'sol',
    id: c.mint,
    identitas: {
      symbol: simbol,
      name: rapikanTeks(c.name),
      address: c.address,
      src: c.avatar,
    },
    tautan: [...sosial, { label: 'Solscan', href: `https://solscan.io/token/${c.mint}`, jenis: 'explorer' }],
    kembali: '/trenches',
    harga: {
      teks: hargaTeks,
      why: why.harga,
      deltas,
      utama: c.changeSinceLaunch === null ? null : { label: 'since launch', value: c.changeSinceLaunch },
      label: c.marketNotLoaded ? { teks: LABEL_PASAR_BELUM, why: JUDUL_PASAR_BELUM } : undefined,
    },
    metrik: [
      { key: 'mc', ...mc },
      // U17: harga besar kartu harga menggantikan tile ini di > 1080 px (TokenView.css)
      { key: 'price', label: 'Price', value: hargaTeks, why: why.harga, hanyaSampai: 1080 },
      /* ⭐ U16 (audit 7 Nov): harga pertama mesin tak tercatat → "Since launch" PASTI "—" selamanya. Tile kepala dilepas
         (tak diganti angka lain: 5m/1h/24h DexScreener sudah ada di baris timeframe di bawah chart, U3 membuatnya "—"
         bila jendela > umur pair, dan mengulangnya di kepala = KPI ganda U17). Sebabnya tetap terbaca lewat popover sel
         "Since launch" baris timeframe (`why.sejak`). */
      ...(c.sinceLaunchNever ? [] : [{
        key: 'since', label: 'Since launch', why: why.sejak,
        value: c.changeSinceLaunch === null ? null : teksPersen(c.changeSinceLaunch),
        tone: c.changeSinceLaunch === null ? undefined : kelasDelta(c.changeSinceLaunch),
        // U17 putaran 2: > 1080 px Δ yang sama tampil di samping harga kartu harga (`utama`); bila "—", tile + sebabnya tetap
        ...(c.changeSinceLaunch === null ? {} : { hanyaSampai: 1080 as const }),
      }]),
      { key: 'flow', ...netFlow },
      { key: 'liq', ...liq },
      { key: 'holders', label: 'Holders (at audit)', value: c.holders ? compact(c.holders) : null, why: why.holders },
      /* ⭐ U19 (audit 7 Nov): dulu merah bila > 30% sementara tab Score factors menulis faktor yg sama hijau (+5 ✓ di
         bawah ambang tampilan 95) → satu metrik dua warna. Kini nada ikut faktor `top10` (adaptDetail): merah hanya bila
         faktor itu menurunkan; selain itu netral (spt Token facts & TokenPanel: top10 tinggi bukan tanda rug). */
      { key: 'top10', ...top10, tone: c.factors.some((f) => f.id === 'top10' && !f.passed) ? 'is-down' : undefined },
    ],
    /* ⭐ U17 (audit 7 Nov): MC, likuiditas, holders, Top 10 & Net flow dulu tampil dua kali (strip kepala + grid ini).
       Tempatnya kini strip kepala saja (ringkasan, terlihat di atas lipatan di semua lebar); kartu harga = harga + Δ,
       Curve, pita beli/jual kurva. */
    pasar: [
      { key: 'curve', label: 'Curve', value: kurva.singkat },
    ],
    /* ⭐ Butir 7: hitungan perubahan cadangan kurva (vSOL naik = beli, turun = jual) dlm jendela ukur. Bukan wallet,
       bukan 24 jam; beberapa trade dlm satu slot bisa terhitung satu. */
    beliJual: {
      // putaran 2: tanpa hitungan, rentang "first N min" tak berarti (window_secs jatuh ke cadangan)
      judul: b === null || s === null ? 'Curve buys / sells' : `Curve buys / sells, first ${jendela(c)}`,
      b,
      s,
      catatan: b === null || s === null
        ? 'Not measured for this pair.'
        : total > 0 ? `${Math.round(((b ?? 0) / total) * 100)}% buys. Counted on the bonding curve, not per wallet.` : 'No curve trades recorded.',
      title: 'Counted from bonding-curve updates: SOL in is a buy, SOL out is a sell. Several trades in one block can count as one.',
    },
    skor: { ...modelSkorSol(c), kurva: { teks: kurva.teks, pct: kurva.pct } },
    catatan: c.marketNotLoaded ? (
      // ⭐ P2: MC & "since launch" sudah "—" (adaptDetail); catatan ini menyebut alasannya, bukan sbg pergerakan pasar
      <p className="cd-nomarket-note" role="note">{LABEL_PASAR_BELUM}. {JUDUL_PASAR_BELUM}</p>
    ) : undefined,
    basi: muat?.tokenBasi !== undefined ? { sejak: muat.tokenBasi } : undefined,
    chart: {
      // A5: sumber singkat + popover ketuk. Isi = P3/P4 apa adanya: candle 1m mesin dari kurva, jam dari waktu
      // terdeteksi, hidup lewat SSE selama pair di kurva.
      sumber: 'pump.fun curve',
      sumberInfo:
        'One minute candles from synt’s own reading of the pump.fun bonding curve, timed from when synt detected the pair, in your time zone. They move live while the pair trades on the curve. Longer periods are combined from the 1 minute candles.',
      satuan: sample ? null : kursSolUsd() ? 'USD' : 'SOL',
      // ⭐ Chart mengambil datanya SENDIRI dari /api/candles (+ SSE hidup, P4).
      isi: <PriceChartLive mint={c.mint} symbol={simbol} ageSecs={c.ageSecs} lulus={c.curveState === 'graduated'} akhirKurva={lulus} sample={sample} />,
      /* P2/P3: candle mesin hanya jendela launch (`v10_candle`, maks ±600 dtk), bukan pasar pasca-lulus → catatan utk
         SEMUA pair lulus (mesin `complete`, atau RugCheck mencatat pool pump.fun pasca-lulus) */
      catatan: lulus ? <p className="cd-chart-note">Chart covers launch trading only, not the market after graduation.</p> : undefined,
      tfKet: selKet ?? undefined,
    },
    tabs: [
      {
        id: 'factors',
        label: 'Score factors',
        n: c.factors.length,
        isi: (
          <DaftarFaktor
            items={c.factors.map((f) => ({ id: f.id, judul: f.label, detail: f.detail, bad: !f.passed, bobot: f.weight }))}
            kosong="No risk factors were measured for this pair."
          />
        ),
      },
      {
        id: 'holders',
        // "Top holders", bukan "Holders": daftar dari getTokenLargestAccounts (maks 20) — jumlah BARIS, bukan pemegang
        label: 'Top holders',
        n: c.holdersList.length,
        isi: muat?.holders?.memuat ? <TabMemuat /> : c.holdersList.length > 0 ? <><HolderList coin={c} />{basiHolders}</> : (
          <TabKosong judul="No holder list yet." isi="The largest accounts are read once the engine has audited this pair." />
        ),
      },
      {
        id: 'positions',
        label: 'Positions',
        // 2 Nov: posisi & riwayat NYATA dari transaksi akun lewat synt (non-custodial)
        isi: <PosisiToken mint={c.mint} symbol={simbol} />,
      },
      /* Swaps hanya tampil bila ada isinya — sumbernya (`v10_tx_awal`) berhenti tumbuh sejak 2026-09-02, jadi tab
         kosong terbaca sbg "tak ada transaksi" padahal artinya "tak diukur". */
      ...(c.swaps.length > 0
        ? [{ id: 'swaps', label: 'Swaps', n: c.swaps.length, isi: <><SwapList coin={c} />{basiHolders}</> }]
        : []),
    ],
    // 2 Nov: trading NYATA (non-custodial, Jupiter); harga terakhir synt hanya utk perkiraan sebelum kutipan
    trade: (
      <TradePanel
        mint={c.mint}
        symbol={simbol}
        priceUsd={c.marketNotLoaded || !(c.price > 0) ? null : c.price}
        peringatan={<PeringatanLikuiditas liq={c.liquidity} />}
      />
    ),
    fakta: {
      rows: barisFakta(c, sample, lp, dex, kurva, sosial.length > 0),
      sumber: sample ? 'Sample address: LP and Dex paid are not checked.' : sumberFakta(lp, dex, kurva),
    },
    penutup: <KartuAgen c={c} sosial={sosial.map((x) => x.label)} />,
  }

  return <TokenView m={m} />
}

/** Kartu skor SOL: skor 0-100 + base rate server + tangga publik (beku, n = 12.783). */
function modelSkorSol(c: CoinDetail): ModelSkor {
  const ada = c.scoreKnown ?? c.score > 0
  const tangga = TANGGA_SOL.map((t) => ({ label: String(t.skor), rate: t.runtuh, aktif: ada && t.skor === c.score }))
  const kakiTangga = `Share of tokens at each score that collapsed (public table, n = ${N_TABEL_SOL}).`
  const aside = c.scoredAtAgeSecs != null && Number.isFinite(c.scoredAtAgeSecs) ? `scored at ${umur(c.scoredAtAgeSecs)}` : undefined
  if (!ada) {
    return {
      skor: {
        kind: 'kosong',
        judul: 'Not scored yet',
        sub: 'The engine has not scored this pair yet. The score and its collapse rate appear together once it does.',
      },
      tangga,
      kakiTangga,
    }
  }
  return {
    aside,
    skor: {
      kind: 'value',
      value: c.score,
      max: 100,
      rate: c.baseRateRug,
      rateTeks: `${c.baseRateRug}%`,
      label: c.scoreLabel,
      // Inilah kalimat yang membedakan audit dari jaminan (PRODUK.md §0).
      kalimat: (
        <>
          <b>{c.baseRateRug}%</b> of tokens at this score collapsed.{' '}
          <b>{c.baseRateWinner}%</b> rose 3× or more.
        </>
      ),
    },
    tangga,
    kakiTangga,
  }
}

/* ⭐ 1c: label angka beku mesin (cek synt-dash api.rs `token`):
   change_pct = harga kini vs harga pertama `v10_flow` → "Since launch";
   net_sol_window = net SOL 0-`window_secs` (maks 600 dtk) → "Net flow, first N min", bertanda;
   risk.top10_pct = sekali saat audit → "(at audit)". Tak terukur → "Not tracked"/"—", bukan 0. */
function barisFakta(c: CoinDetail, sample: boolean, lp: LpFakta, dex: DexFakta, kurva: Kurva, punyaSosial: boolean): BarisFakta[] {
  // R2: urutan & isi = kartu Token facts preview (net flow & beli/jual kembali ke kartu harga)
  const rows: BarisFakta[] = [
    { label: 'Launchpad', value: c.launchpad ?? 'Not reported', tone: c.launchpad ? null : 'mute', info: c.launchpadTitle },
    { label: 'Created', value: c.createdAgo },
    { label: 'Curve progress', value: kurva.teks, tone: kurva.status === 'unknown' ? 'mute' : null },
    { label: 'Top 10 hold (at audit)', value: teksTop10(c.top10Pct), tone: c.top10Pct === null ? 'mute' : null },
  ]
  if (sample) {
    rows.push({ label: 'LP burned or locked', value: 'Sample', tone: 'mute' }, { label: 'Dex paid', value: 'Sample', tone: 'mute' })
  } else {
    rows.push(barisLp(lp, c), barisDex(dex))
  }
  rows.push({ label: 'Socials', value: punyaSosial ? 'Present' : 'none', tone: punyaSosial ? 'up' : null })
  return rows
}

/** Peringatan berdasar angka, bukan kata sifat (BRAND.md §3). ⛔ 1c: likuiditas tak diketahui (null) TIDAK memicu "$0". */
function PeringatanLikuiditas({ liq }: { liq: number | null }) {
  if (liq === null || liq >= 100_000) return null
  return (
    <p className="cd-warn">
      <WarnIcon />
      {/* dulu "a $0 order": likuiditas $2 / 10 = $0,2 dibulatkan ke $0 */}
      {liq / 10 >= 1
        ? <>SOL-side liquidity is {usd(liq)}. A {usd(liq / 10)} order moves price noticeably.</>
        : liq < 1
          ? <>SOL-side liquidity is under $1. Almost any order moves price noticeably.</>
          : <>SOL-side liquidity is {usd(liq)}. Almost any order moves price noticeably.</>}
    </p>
  )
}

/**
 * Kartu agen. ⭐ A4 (kontradiksi agen vs fakta): penjelasan ditulis SAAT dinilai; sosial yang kini tercantum bisa
 * belum ada saat itu ("no socials" di teks, tautan X di kepala). Aside "at scoring" + catatan tautan sekarang.
 */
function KartuAgen({ c, sosial }: { c: CoinDetail; sosial: string[] }) {
  const pada = c.scoredAtAgeSecs != null && Number.isFinite(c.scoredAtAgeSecs) ? ` (minute ${Math.max(1, Math.round(c.scoredAtAgeSecs / 60))})` : ''
  return (
    <section className="cd-card cd-agent" aria-labelledby="tv-agent-h">
      <header className="cd-agent-head">
        <h2 id="tv-agent-h" className="cd-card-title">Agent explanation</h2>
        <span className="cd-agent-at">at scoring</span>
      </header>
      <p className="cd-agent-text">{c.agentSummary}</p>
      <p className="cd-agent-note">
        The agent explains the score. It does not set it. Written when the score was set{pada}, from the data at that
        moment.{sosial.length ? ` Links listed on this token now: ${sosial.join(', ')}.` : ''}
      </p>
    </section>
  )
}

/** A2: sebab "—" per metrik halaman token Solana (popover ketuk). */
function alasanKosong(c: CoinDetail) {
  const beku = c.marketNotLoaded ? JUDUL_PASAR_BELUM : null
  return {
    mc: beku ?? 'The engine has no market cap for this pair yet.',
    harga: beku ?? 'No price has been recorded for this pair yet.',
    sejak: beku ?? (c.sinceLaunchNever ? SEBAB_SEJAK_TAK_TERCATAT : 'The engine has no first price for this pair, so the change since launch is unknown.'),
    liq: beku ?? 'The engine did not report liquidity for this pair.',
    holders: 'No holder count was recorded when this pair was audited.',
  }
}

/** Kalimat sumber: menyebut sumber SEBENARNYA tiap fakta (RugCheck / mesin synt / DexScreener). */
function sumberFakta(lp: LpFakta, dex: DexFakta, kurva: Kurva): string {
  // ⛔ 1c: selama memuat, jangan menyebut sumber yang belum menjawab
  if (lp.status === 'loading' || dex.status === 'loading') return 'Checking RugCheck and DexScreener…'
  const bagian: string[] = []
  if (lp.status === 'error') bagian.push(tidakMenjawab('RugCheck', lp))
  else if (lp.value === 'curve') bagian.push('LP and curve state from RugCheck')
  else if (lp.value === 'no-pool') bagian.push('LP from RugCheck')
  else {
    const pool = lp.value.acuan === 'pumpswap' ? 'PumpSwap pool' : `largest pool, ${namaPool(lp.value.pool)}`
    bagian.push(kurva.sumber === 'rugcheck' ? `LP and curve state from RugCheck (${pool})` : `LP from RugCheck (${pool})`)
  }
  if (kurva.sumber === 'engine') bagian.push('Curve state from the synt engine')
  else if (kurva.sumber === 'rugcheck' && kurva.status === 'curve' && kurva.teks !== 'On the curve') bagian.push('Curve progress from the synt engine')
  bagian.push(dex.status === 'error' ? tidakMenjawab('DexScreener', dex) : 'Dex paid from DexScreener')
  return gabungSumber(bagian, teksDiperiksa(lp, dex))
}

/* ⛔ Cleanup P2: `/api/facts` gagal / 429 / busy (anggaran synt-dash habis) = pemeriksaan SYNT yang tak tersedia; dulu
   tertulis "RugCheck is busy" padahal RugCheck tak pernah ditanya. Nama sumber hanya disebut bila sumber itu sendiri
   yang tak menjawab (`unavailable`). */
const CEK_TAK_TERSEDIA = 'Checks unavailable, try again shortly'

function tidakMenjawab(sumber: string, f: Fakta<unknown>): string {
  return f.status === 'error' && f.sebab === 'synt' ? CEK_TAK_TERSEDIA : `${sumber} did not answer`
}

/** Penjelasan "Unavailable". */
function judulGagal(sumber: string, f: Fakta<unknown>): string {
  return f.status === 'error' && f.sebab === 'synt' ? CEK_TAK_TERSEDIA : `${sumber} did not answer for this token`
}

/** Gabung kalimat sumber tanpa mengulang "Checks unavailable…" bila LP & Dex paid gagal karena sebab yang sama. */
function gabungSumber(bagian: string[], diperiksa: string): string {
  return `${[...new Set(bagian)].join('. ')}. ${diperiksa}`.trim()
}

/**
 * LP burned/locked di pool acuan RugCheck (PumpSwap bila ada, else terbesar). Pair di bonding curve belum punya LP → "Bonding curve", bukan 0%.
 * ⚠️ Ringkasan RugCheck menggabungkan burn & lock, jadi labelnya menyebut keduanya.
 * ⭐ Warna (keputusan orkestrator): persen NETRAL, angkanya yang bicara; warn HANYA utk pair lulus dgn 0%.
 * ⭐ RugCheck gagal → cadangan mesin, ditulis sbg data mesin berumur ("On the curve at 10 min (engine)").
 */
function barisLp(fakta: LpFakta, c: CoinDetail | null): BarisFakta {
  const label = 'LP burned or locked'
  if (fakta.status === 'loading') return { label, value: 'Checking…', tone: 'mute' }
  if (fakta.status === 'error') {
    if (c && c.curveState === 'curve') {
      const teks = mesinSegar(c) ? 'Bonding curve (engine)' : `On the curve at ${jendela(c)} (engine)`
      return { label, value: teks, tone: 'mute', info: `${tidakMenjawab('RugCheck', fakta)}. The synt engine saw this pair on the bonding curve, where no LP exists yet.` }
    }
    return { label, value: 'Unavailable', tone: 'mute', info: `${judulGagal('RugCheck', fakta)}.` }
  }
  if (fakta.value === 'curve') return { label, value: 'Bonding curve', info: 'RugCheck lists the pump.fun bonding curve as the largest pool, so no LP exists yet.' }
  if (fakta.value === 'no-pool') return { label, value: 'No pool found', tone: 'mute', info: 'RugCheck lists no liquidity pool for this token.' }
  const { lockedPct: v, pool, acuan, jenis } = fakta.value
  const nama = namaPool(pool)
  const kolam = acuan === 'pumpswap' ? `the PumpSwap pool` : `the largest pool (${nama})`
  /* ⭐ 1c putaran 2 (keputusan orkestrator):
     · dlmm: tak ada token LP, RugCheck selalu 0% → "No LP token", netral;
     · posisi (Orca, DAMM v2, Raydium CLMM): "x% locked", 0% = likuiditas bisa ditarik → warn;
     · lp-token: persen burned/locked, 0% → warn;
     · lain: angka apa adanya + nama pool, netral, tanpa klaim struktural. */
  if (jenis === 'dlmm' && v === 0) {
    return { label, value: `No LP token (${nama})`, tone: 'mute', info: `${nama} pools have no LP token to burn or lock, so RugCheck reports 0% for ${kolam}.` }
  }
  if (jenis === 'posisi') {
    return { label, value: `${v.toFixed(1)}% locked`, tone: v === 0 ? 'warn' : null,
      info: `Liquidity positions in ${kolam}; ${v.toFixed(1)}% locked per RugCheck${v < 100 ? ', so the rest of the liquidity can be withdrawn' : ''}.` }
  }
  if (jenis === 'lain') return { label, value: `${v.toFixed(1)}% (${nama})`, info: `Share of liquidity burned or locked in ${kolam}, per RugCheck.` }
  return { label, value: `${v.toFixed(1)}%`, tone: v === 0 ? 'warn' : null, info: `Share of LP burned or locked in ${kolam}, per RugCheck.` }
}

/** Dex paid: profil DexScreener berbayar. Netral di semua keadaan (1b): bayar/tidak bukan tanda aman/bahaya. */
function barisDex(fakta: DexFakta): BarisFakta {
  const label = 'Dex paid'
  if (fakta.status === 'loading') return { label, value: 'Checking…', tone: 'mute' }
  if (fakta.status === 'error') return { label, value: 'Unavailable', tone: 'mute', info: `${judulGagal('DexScreener', fakta)}.` }
  const { paid, boosted } = fakta.value
  const teks = paid === 'paid' ? 'Paid' : paid === 'pending' ? 'Pending' : 'Not paid'
  return { label, value: boosted ? `${teks}, boosted` : teks }
}

/**
 * Mint yang TAK dilacak synt (tanpa bukti pump.fun: BONK, USDC, JUP-like). Data mesin utk mint ini bukan pengukuran
 * pair-nya, jadi tak ada nama/harga/skor mesin di sini. Nama & simbol dari DexScreener bila ada, else mint dipendekkan.
 */
export function TakDilacak({ mint, takDikenalMesin = false }: { mint: string; takDikenalMesin?: boolean }) {
  // nama & Dex paid dari SATU permintaan `/api/facts` (dibagi & di-cache di externalFacts; bila CoinDetailView
  // sudah bertanya, ini tanpa permintaan baru). U25(c): LP tak ditampilkan utk mint tak dilacak.
  const dn = useDexNama(mint)
  const { dex } = useTokenFacts(mint, true, false)
  const nama = dn === 'loading' || dn === 'unavailable' ? null : dn
  const { copy, copied } = useCopy()
  /* mesin 404: hanya tampil sbg "tak dilacak" bila DexScreener mengenal tokennya (mis. JUP); alamat yang tak
     dikenal siapa pun tetap "Token not found." (keputusan 1b) */
  if (takDikenalMesin && dn === 'loading') return <p className="tr-empty">Loading…</p>
  if (takDikenalMesin && !dn) return <p className="tr-empty">Token not found.</p>
  // ⛔ DexScreener tak bisa ditanya ≠ tak dikenal: jangan menulis "not found" utk token yang mungkin ada
  if (takDikenalMesin && dn === 'unavailable') return <p className="tr-empty">This token isn't tracked by synt, and its details are unavailable right now. Try again shortly.</p>
  const pendek = alamatPendek(mint)
  // U25(c): LP tak tampil di sini → muat/periksa mengikuti Dex paid (satu permintaan /api/facts yang sama)
  const memuat = dex.status === 'loading'
  return (
    <div className="cd tv">
      <header className="cd-head">
        <div className="cd-identity">
          <Avatar name={rapikanTeks(nama?.symbol) ?? mint} src={null} size={44} />
          <div className="cd-names">
            <h1 className="cd-symbol">{rapikanTeks(nama?.symbol) ?? pendek}</h1>
            <span className="cd-name">{nama ? `${nama.name} (name from DexScreener)` : 'Name not available'}</span>
          </div>
          <button type="button" className="cd-addr" onClick={() => copy(mint, 'addr')} title="Copy contract address">
            {copied === 'addr' ? 'Copied' : pendek}
            <CopyIcon />
          </button>
          <div className="cd-links">
            <a href={`https://solscan.io/token/${mint}`} target="_blank" rel="noopener noreferrer" aria-label="Solscan" title="Solscan"><ExternalIcon /></a>
          </div>
        </div>
      </header>
      <p className="cd-sample-note" role="note">
        {memuat
          ? 'Checking this token…'
          : <>Not tracked by synt. There is no synt audit score, price or curve data for this token. synt audits new pump.fun launches.{nama && <> <a href={`https://dexscreener.com/solana/${mint}`} target="_blank" rel="noopener noreferrer nofollow">View it on DexScreener</a>.</>}</>}
      </p>
      {/* ⭐ U25(c) (audit 7 Nov): baris "LP burned or locked" DILEPAS di sini. Mint tanpa bukti pump.fun = token mapan
          (wSOL, BONK, USDC…) yang daftar pool RugCheck-nya tak lengkap: wSOL tertulis "No pool found" padahal pool-nya
          termasuk yang terbesar di Solana. Burn/lock LP hanya bermakna utk pool launch baru. Dex paid tetap (fakta
          DexScreener apa adanya) + penjelas bahwa itu pesanan berbayar di DexScreener, bukan tanda aman. */}
      <FactsCard
        solo
        rows={[dex.status === 'ok' ? { ...barisDex(dex), info: INFO_DEX_PAID_LUAR } : barisDex(dex)]}
        sumber={
          dex.status === 'loading'
            ? 'Checking DexScreener…'
            : gabungSumber([dex.status === 'error' ? tidakMenjawab('DexScreener', dex) : 'Dex paid from DexScreener'], teksDiperiksa(dex))
        }
      />
    </div>
  )
}

const INFO_DEX_PAID_LUAR =
  'Paid orders DexScreener lists for this address, such as a token profile or boosts. It is not a safety signal.'

/** A5: kerangka tab saat /api/holders belum menjawab (bukan "No holder list yet" yang terbaca sbg data kosong). */
function TabMemuat() {
  return (
    <div className="tv-tab-skel" role="status" aria-label="Loading">
      {[0, 1, 2, 3, 4].map((i) => <i key={i} className="sk" />)}
    </div>
  )
}

function HolderList({ coin: c }: { coin: CoinDetail }) {
  return (
    <div className="cd-table" role="table" aria-label="Holders">
      <div className="cd-tr cd-th" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Wallet</span>
        <span role="columnheader" className="ta-r">Share</span>
        <span role="columnheader" className="ta-r">Value</span>
      </div>
      {c.holdersList.map((h) => (
        <div key={h.address} className="cd-tr" role="row">
          <span role="cell" className="cd-rank">{h.rank}</span>
          <span role="cell" className="cd-wallet">
            {h.owner ? <WalletLink addr={h.owner} className="cd-wallet-link">{h.address}</WalletLink> : h.address}
            {h.tag && <span className={`cd-tag is-${h.tag}`}>{h.tag}</span>}
          </span>
          <span role="cell" className="ta-r cd-num">{h.pct.toFixed(1)}%</span>
          <span role="cell" className="ta-r cd-num">{h.valueUsd === null ? '—' : usd(h.valueUsd)}</span>
        </div>
      ))}
    </div>
  )
}

function SwapList({ coin: c }: { coin: CoinDetail }) {
  return (
    <div className="cd-table" role="table" aria-label="Recent swaps">
      <div className="cd-tr cd-th cd-tr-swap" role="row">
        <span role="columnheader">Time</span>
        <span role="columnheader">Side</span>
        <span role="columnheader" className="ta-r">Amount</span>
        <span role="columnheader" className="ta-r">Value</span>
        <span role="columnheader">Trader</span>
      </div>
      {c.swaps.map((s, i) => (
        <div key={`${s.time}-${i}`} className="cd-tr cd-tr-swap" role="row">
          <span role="cell" className="cd-num cd-dim">{s.time}</span>
          <span role="cell" className={s.side === 'buy' ? 'is-up' : 'is-down'}>{s.side}</span>
          <span role="cell" className="ta-r cd-num">{compact(s.amount)}</span>
          <span role="cell" className="ta-r cd-num">{usd(s.valueUsd)}</span>
          <span role="cell" className="cd-wallet">{s.trader}</span>
        </div>
      ))}
    </div>
  )
}
