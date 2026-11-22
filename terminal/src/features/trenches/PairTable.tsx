import { QuickBuy } from '@/features/trade/QuickBuy'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { siklus, type Sort, type SortKey } from './pairSort'
import { Avatar } from '@/components/Avatar'
import { ScoreBadge, ScoreSpark } from '@/components/ScoreCell'
import { StatusChip } from '@/components/StatusChip'
import { InfoPopover } from '@/components/Popover'
import { alamatPendek, pct, trendClass, uang } from '@/lib/format'
import { useCopy } from '@/lib/useCopy'
import { RISIKO_KOSONG, frasaJendela, rate, type PairModel, type Num, type Tag } from './pairModel'
import './PairTable.css'

/**
 * ⭐ SATU tabel Trenches utk Solana & BNB (A3), digambar ulang R1 (28 Okt, DESIGN-TERMINAL §0) dgn markup & ukuran
 * tabel PREVIEW (`master` src/features/trenches/TrenchesTable.tsx): kartu bergulir sendiri, kepala lengket, baris
 * min. 72px dgn jarak 12, skor telanjang 19px + sparkline 84×22 + "NN% collapsed", TREND chip di SEMUA tampilan SOL,
 * MC + Δ bertumpuk, SELL/BUY, TOP RISK paling kanan, kolom aksi (chevron detail + Buy). Grid minimum `--tt-min-w`
 * (1180, preview) → di bawahnya kartu tabel yang menggulir, bukan halaman.
 *
 * Yang dipertahankan dari lab (§0.2): model chain-agnostik (`PairModel`), sortir lewat kepala kolom (panah gaya
 * kepala preview), "—" yang bisa diketuk (popover), chip Provisional BNB.
 * ⭐ T1 (pemilik 7 Nov, "samakan saja dengan apa yang solana tampilkan"): BNB memakai SET kolom SOL per tampilan
 * (New = SOL New, Graduated = SOL Graduated) dgn urutan sama. Slot TREND BNB = chip outcome AT 90M (BNB dinilai
 * sekali, tanpa lintasan skor). Putaran 2: kolom yang selalu kosong utk BNB dilepas (Graduated tanpa MOVE/RETENTION,
 * New: CURVE di slot LIQ); "—" situasional (skor, outcome, alasan) tetap bersebab. Chain hanya mengubah ISI slot.
 */
export type TableMode = 'wide' | 'mid' | 'phone'
export type PairView = 'new' | 'trending' | 'bonding' | 'graduated'

interface Ctx {
  chain: 'sol' | 'bnb'
  view: PairView
  compact: boolean
  /** U14: sparkline skor boleh tampil = kolom SCORE selebar penuh (176 px). Panel tertutup selalu; panel terbuka
   *  selama tabel tak masuk mode sempit (lihat `kolom`). */
  spark: boolean
  /** T-9 (22 Nov): tabel dlm mode sempit (ponsel) → keadaan skor kosong BNB satu baris. */
  sempit: boolean
}

interface Col {
  id: string
  label: string
  width: string
  align?: 'r'
  /** Kunci sortir bila kepala kolom ini bisa diklik (A6). */
  sort?: SortKey
  render: (m: PairModel, c: Ctx) => React.ReactNode
}

/* ── sel ── */

function Kosong({ why, label }: { why?: string; label: string }) {
  if (!why) return <span className="pt-dim">—</span>
  return (
    <span className="pt-dim">
      <InfoPopover info={why} label={label}>—</InfoPopover>
    </span>
  )
}

function Uang({ n, label }: { n: Num; label: string }) {
  if (n.v === null) return <Kosong why={n.why} label={label} />
  return <span>{uang(n.v)}</span>
}

/**
 * Sel skor preview: angka telanjang berwarna + (sparkline) + base rate. Tanpa sparkline (kolom sempit) → base rate 2 baris.
 * ⭐ U14 (audit 7 Nov): dulu panel terbuka (bawaan) = selalu tanpa sparkline, padahal kolom SCORE tetap 176 px (sama dgn
 * panel tertutup) → di 1440 sparkline (fitur "tak boleh dihilangkan", CLAUDE.md) hilang di kolom yang renggang. Kini
 * sparkline hanya dilepas bila lebar kartu memang tak cukup: mode sempit `kolom()` (BUANG habis & grid tetap tak muat,
 * kolom SCORE menyusut ke 96 px). Baris tanpa deret skor (BNB) tetap tata letak ringkas spt dulu.
 */
function Score({ m, compact, spark, sempit }: { m: PairModel; compact: boolean; spark: boolean; sempit: boolean }) {
  const s = m.score
  if (s.kind !== 'value') {
    if (m.chain !== 'bnb') return <ScoreBadge empty={{ title: s.title, sub: s.sub }} info={s.info} />
    /* ⭐ T-9 (22 Nov): mode sempit (ponsel, kolom 92 px) → keadaan satu baris tanpa slot angka "—" (dulu "Quiet ?" lalu
       "not / scored" melipat 3 baris → baris BNB 107 px vs SOL 100). Sub-keadaan ("not scored", "in 81s") pindah ke
       popover bersama penjelasnya; pemicu = ikon "?" yang sama. */
    if (sempit) {
      return (
        <span className="pt-score is-empty is-satu">
          <span className="pt-score-base pt-score-state">
            {s.title}
            {s.info && <InfoPopover info={s.sub ? `${s.title}, ${s.sub}. ${s.info}` : s.info} label={s.title} className="ip-q">?</InfoPopover>}
          </span>
        </span>
      )
    }
    /* T1: BNB tanpa skor (Quiet / Scoring at 2m) = anatomi sel skor SOL: slot angka "—" redup, keadaan di baris
       base rate. Pemicu popover tetap ikon "?" kecil (ketuk sel di ponsel = pilih baris). */
    return (
      <span className="pt-score is-empty">
        <span className="pt-score-num pt-dim">—</span>
        <span className="pt-score-side">
          <span className="pt-score-base pt-score-state">
            {s.title}
            {s.info && <InfoPopover info={s.info} label={s.title} className="ip-q">?</InfoPopover>}
          </span>
          {s.sub && <span className="pt-score-base">{s.sub}</span>}
        </span>
      </span>
    )
  }
  const tone = `sk-tone-${s.tone}`
  const num = (
    <span className={`pt-score-num ${tone}`}>
      {s.value}
      {s.max !== 100 && <span className="pt-score-max">/{s.max}</span>}
    </span>
  )
  // ⛔ Base rate WAJIB menempel pada skor (PRODUK.md §0), juga saat sempit.
  const h = s.spark
  /* ⭐ T-1 (22 Nov): dua baris hanya bila kolom memang sempit (`spark` false = mode sempit / lebar belum terukur), BUKAN
     karena baris tak punya deret skor → BNB (tanpa sparkline) satu baris "4.6% collapsed" spt SOL di 1440. */
  const ringkas = compact && !spark
  const base = s.rate === null ? <>No base<br />rate yet</> : ringkas ? <>{rate(s.rate)}<br />collapsed</> : <>{rate(s.rate)} collapsed</>
  if (ringkas) {
    return (
      <span className="pt-score">
        {num}
        <span className="pt-score-base">{base}</span>
      </span>
    )
  }
  return (
    <span className="pt-score">
      {num}
      <span className="pt-score-side">
        {h && h.length > 1 && <ScoreSpark points={h} rising={(h[h.length - 1] ?? 0) >= (h[0] ?? 0)} />}
        <span className="pt-score-base">{base}</span>
      </span>
    </span>
  )
}

/** TOP RISK: hanya faktor yang menurunkan skor (U19; BNB: sinyal gagal), chip mono dipisah titik. Kosong → teks redup. */
function Risk({ m }: { m: PairModel }) {
  if (!m.reasons.length) {
    return m.reasonsEmpty ? (
      <span className="pt-risk-none" title={m.reasonsEmpty === RISIKO_KOSONG ? 'This column shows quick checks only. The token page lists every score factor.' : undefined}>{m.reasonsEmpty}</span>
    ) : (
      <Kosong why={m.reasonsWhy ?? undefined} label="Top risk" />
    )
  }
  return (
    <span className="pt-risk">
      {m.reasons.map((r) => (
        <InfoPopover key={r.short} className="chip-trigger pt-risk-t" label={r.short} info={r.full}>
          <span className={`pt-risk-chip ${r.bad ? '' : 'is-quiet'}`}>{r.short}</span>
        </InfoPopover>
      ))}
    </span>
  )
}

function Curve({ m }: { m: PairModel }) {
  if (m.curve.v === null) return <Kosong why={m.curve.why} label="Curve" />
  const p = Math.max(0, Math.min(100, m.curve.v))
  return (
    <span className="pt-curve">
      <span className="pt-curve-track"><span className="pt-curve-fill" style={{ width: `${p}%` }} /></span>
      <span className="pt-curve-val">{Math.round(p)}%</span>
    </span>
  )
}

/** U26d: "Name reused ×36" → nama + hitungan. Di kolom TOKEN sempit yang dipotong elipsis hanya NAMA-nya
    ("Name re… ×36"); dulu elipsis memakan hitungannya ("Name reus…"). */
const HITUNGAN = /^(.*\S)\s+(×\d+)$/

function TagIsi({ t, sempit }: { t: Tag; sempit: boolean }) {
  const h = sempit ? HITUNGAN.exec(t.label) : null
  if (!h) return <span className={`pt-tag is-${t.tone}`}>{t.label}</span>
  return (
    <span className={`pt-tag is-${t.tone} has-hitung`}>
      <span className="pt-tag-nama">{h[1]}</span>
      <span className="pt-tag-hitung">{'\u00a0'}{h[2]}</span>
    </span>
  )
}

function TagLine({ tags, max = 2, sempit = false }: { tags: Tag[]; max?: number; sempit?: boolean }) {
  if (!tags.length || max <= 0) return null
  return (
    <span className="pt-tags">
      {tags.slice(0, max).map((t) =>
        t.info ? (
          <InfoPopover key={t.label} className="chip-trigger" label={t.label} info={t.info}>
            <TagIsi t={t} sempit={sempit} />
          </InfoPopover>
        ) : (
          // pembungkus = bentuk sama dgn pemicu popover → pemisah "·" selalu di dlm `.pt-tag`
          <span key={t.label} className="pt-tag-w"><TagIsi t={t} sempit={sempit} /></span>
        ),
      )}
    </span>
  )
}

/**
 * BNB: tag baris (`rowTags`: peringatan & quote non-BNB) di bawah alamat, tempat label P2 SOL (T1: alamat kini
 * sendirian di baris-2 spt SOL), dlm SATU baris. Tag yang tak muat disembunyikan utuh (peringatan dulu, urutan model) dan
 * dihitung jadi "+N" (nit R1: dulu hilang tanpa tanda); semua tag tetap di panel. Diukur sesudah tata letak:
 * selama ada yang turun baris (termasuk "+N" sendiri), satu tag lagi dilepas; lebar berubah → hitung ulang.
 *
 * ⭐ U6 putaran 2 (Reviewer): kolom TOKEN ponsel (`sempit`, 96-136px) lebih sempit dari "Name reused ×36" → dulu tag
 * peringatan dilepas & baris hanya menyisakan "+N" abu-abu (sinyal risiko hilang). Di mode sempit: baris tag TIDAK
 * melipat; tag PERTAMA (peringatan, urutan model) selalu tampil, terpotong elipsis bila perlu; tag berikutnya dilepas
 * selama ada yang meluap atau tag pertama terpotong; "+N" bernada peringatan bila yang tersembunyi memuat peringatan.
 * Di luar mode sempit perilaku = master (760-1440 identik).
 */
function TagLineFit({ tags, sempit = false }: { tags: Tag[]; sempit?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [tampil, setTampil] = useState(tags.length)
  // tag pertama (peringatan) muat sendirian tapi tidak bersama "+N" → tag itu yang dipertahankan, "+N" dilepas
  const [tanpaPlus, setTanpaPlus] = useState(false)
  const kunci = tags.map((t) => t.label).join('|')
  useLayoutEffect(() => {
    setTampil(tags.length)
    setTanpaPlus(false)
  }, [kunci, tags.length, sempit])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (sempit) {
      // satu baris tanpa lipatan: lepas tag dari belakang selama ada yang meluap ke kanan atau tag pertama terpotong,
      // tapi tag pertama tak pernah dilepas (ia menyusut + elipsis; "+N" tak menyusut)
      const kanan = el.getBoundingClientRect().right
      const luap = [...el.querySelectorAll<HTMLElement>('.pt-tag, .pt-more')].some((b) => b.getBoundingClientRect().right > kanan + 1)
      const pertama = el.querySelector<HTMLElement>('.pt-tag')
      // U26d: tag ber-hitungan → yang menyusut & terpotong adalah bagian nama
      const potong = pertama?.querySelector<HTMLElement>('.pt-tag-nama') ?? pertama
      const terpotong = !!potong && potong.scrollWidth > potong.clientWidth + 1
      if (tampil > 1) {
        if (luap || terpotong) setTampil((n) => Math.max(1, n - 1))
        return
      }
      // tinggal tag pertama & ia terpotong: "+N" dilepas (spt master) hanya bila yang tersembunyi tak memuat peringatan
      if (terpotong && !tanpaPlus && !tags.slice(1).some((t) => t.tone === 'warn')) setTanpaPlus(true)
      return
    }
    // turun baris = bergeser ≥ setengah tinggi baris (pemicu popover bisa duduk 1-2px lebih rendah di baris yang sama)
    const atas = el.getBoundingClientRect().top
    const turun = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)].some((b) => b.getBoundingClientRect().top - atas >= el.clientHeight / 2)
    const tagTurun = turun('.pt-tag')
    if (!tagTurun && !turun('.pt-more')) return
    if (!tagTurun && tampil === 1) setTanpaPlus(true)
    else setTampil((n) => Math.max(0, n - 1))
  })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lebar = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lebar) {
        lebar = el.clientWidth
        setTampil(tags.length)
        setTanpaPlus(false)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [tags.length])
  const sisa = tags.length - Math.min(tampil, tags.length)
  const tersembunyi = tags.slice(tags.length - sisa)
  return (
    <span className="pt-mintline" ref={ref}>
      <TagLine tags={tags} max={tampil} sempit={sempit} />
      {sisa > 0 && !tanpaPlus && (
        <span
          className={`pt-more${sempit && tersembunyi.some((t) => t.tone === 'warn') ? ' is-warn' : ''}`}
          title={tersembunyi.map((t) => t.label).join(', ')}
        >
          +{sisa}
        </span>
      )}
    </span>
  )
}

/** U18: penjelas kepala "Score path" SOL. */
const INFO_SCORE_PATH =
  'How the audit score moved while synt was scoring this pair, not the price. Held and Fell are highlighted; Climbed is the common path and stays dim.'

/* ── definisi kolom (lebar = preview) ── */

const C: Record<string, Col> = {
  score: { id: 'score', label: 'Score', width: '176px', sort: 'score', render: (m, c) => <Score m={m} compact={c.compact} spark={c.spark} sempit={c.sempit} /> },
  trend: {
    id: 'trend',
    // ⭐ U18: kepala "Trend" terbaca sbg arah harga → "Score path"; kepalanya = pemicu penjelas "not the price"
    label: 'Score path',
    width: '92px',
    render: (m) =>
      !m.trend ? (
        <span className="pt-dim">—</span>
      ) : m.trend.tone === 'muted' ? (
        // U18: Climbed = jalur umum → teks redup (tetap bisa diketuk utk penjelasnya), bukan chip
        <InfoPopover info={m.trend.info ?? ''} label={m.trend.label} className="pt-path-dim">{m.trend.label}</InfoPopover>
      ) : (
        <StatusChip label={m.trend.label} tone={m.trend.tone} info={m.trend.info} />
      ),
  },
  mc: {
    id: 'mc',
    label: 'MC',
    width: '104px',
    align: 'r',
    sort: 'mc',
    /* ⭐ T-2 (22 Nov): satu pola kedua chain = sufiks jendela DI SEL ("−73.4% launch", "−2.1% 1h"), kepala "MC" saja
       (dulu SOL "MC Δ LAUNCH" di kepala, BNB sufiks di sel). Penjelas jendela ada di panel (`change.info`).
       T-3: MC "—" (tanpa harga) → baris Δ tak dirender (dulu "—" ditumpuk dua); MC ada tapi Δ tak terukur → "—" bersebab
       (U16) utk kedua chain. */
    render: (m) => (
      <span className="pt-stack">
        <Uang n={m.mcap} label="Market cap" />
        {m.mcap.v === null ? null : m.change.v === null ? (
          <span className="pt-delta pt-dim">
            <InfoPopover info={m.change.why ?? 'Not measured yet.'} label={`Change ${frasaJendela(m.change.label)}`}>—</InfoPopover>
          </span>
        ) : (
          <span className={`pt-delta ${trendClass(m.change.v)}`}>
            {pct(m.change.v)}
            <span className="pt-delta-w"> {m.change.label}</span>
          </span>
        )}
      </span>
    ),
  },
  liq: { id: 'liq', label: 'Liq', width: '96px', align: 'r', sort: 'liq', render: (m) => <Uang n={m.liq} label="Liquidity" /> },
  // Tekanan jual (preview): ≤ 0,8 naik, ≥ 1,3 turun
  pressure: {
    id: 'pressure',
    label: 'Sell/Buy',
    width: '96px',
    align: 'r',
    render: (m) => {
      if (!m.buys) return <span className="pt-dim">—</span>
      const v = (m.sells ?? 0) / m.buys
      return <span className={v <= 0.8 ? 'is-up' : v >= 1.3 ? 'is-down' : undefined}>{v.toFixed(2)}</span>
    },
  },
  curve: { id: 'curve', label: 'Curve', width: '104px', render: (m) => <Curve m={m} /> },
  // ⭐ Harga vs sampel pertama (preview MOVE)
  move: {
    id: 'move',
    label: 'Move',
    width: '96px',
    align: 'r',
    render: (m) =>
      m.move.v === null ? (
        m.chain === 'bnb' ? <Kosong why={m.move.why} label="Move" /> : <span className="pt-dim">—</span>
      ) : (
        <span className={trendClass(m.move.v)}>{(1 + m.move.v / 100).toFixed(2)}×</span>
      ),
  },
  retention: {
    id: 'retention',
    label: 'Retention',
    width: '104px',
    align: 'r',
    render: (m) =>
      m.retention.v === null ? (
        <Kosong why={m.retention.why} label="Retention" />
      ) : (
        <span className={m.retention.v >= 70 ? 'is-up' : 'is-down'}>{Math.round(m.retention.v)}%</span>
      ),
  },
  // BNB: slot TREND SOL (lebar sama) berisi outcome 90 mnt
  out: {
    id: 'out',
    label: 'At 90m',
    width: '92px',
    render: (m) =>
      m.status ? <StatusChip label={m.status.label} tone={m.status.tone} info={m.status.info} /> : <Kosong why={m.statusWhy} label="At 90m" />,
  },
  risk: { id: 'risk', label: 'Top risk', width: 'minmax(200px, 1fr)', render: (m) => <Risk m={m} /> },
}

/** Kolom per chain · tampilan: [penuh, panel terbuka]. TOKEN pertama & aksi terakhir tak terdaftar di sini. SOL = preview. */
const SET: Record<string, [string[], string[]]> = {
  'sol:new': [['score', 'trend', 'mc', 'liq', 'pressure', 'risk'], ['score', 'trend', 'mc', 'liq', 'pressure', 'risk']],
  'sol:trending': [['score', 'trend', 'mc', 'liq', 'pressure', 'curve', 'risk'], ['score', 'trend', 'mc', 'curve', 'pressure', 'risk']],
  'sol:bonding': [['score', 'trend', 'mc', 'liq', 'pressure', 'curve', 'risk'], ['score', 'trend', 'mc', 'curve', 'pressure', 'risk']],
  'sol:graduated': [['score', 'trend', 'mc', 'liq', 'move', 'retention', 'risk'], ['score', 'trend', 'mc', 'retention', 'pressure', 'risk']],
  // T1: BNB = set SOL tampilan yang sama; slot TREND → AT 90M (BNB dinilai sekali di menit 2, tanpa lintasan skor).
  // Putaran 2: kolom yang KOSONG MENURUT KONSTRUKSI dilepas, urutan sisanya tetap SOL. New: LIQ → CURVE (semua pair
  // New BNB di kurva, tak punya pool; CURVE ada di SOL Trending/Bonding). Graduated: tanpa MOVE & RETENTION (feed BNB
  // belum membawa harga awal/retensi, usulan backend B13).
  'bnb:new': [['score', 'out', 'mc', 'curve', 'pressure', 'risk'], ['score', 'out', 'mc', 'curve', 'pressure', 'risk']],
  'bnb:graduated': [['score', 'out', 'mc', 'liq', 'risk'], ['score', 'out', 'mc', 'pressure', 'risk']],
}

/** Kunci sortir yang punya kepala kolom terlihat (chain · tampilan · panel terbuka). Sisanya lewat Sort ringkas di bar.
 *  Panel terbuka: tabel bisa membuang kolom lagi agar muat (lihat `BUANG`) → Trenches memakai `onTerlihat` bila ada. */
export function kunciKepala(chain: 'sol' | 'bnb', view: PairView, compact: boolean): SortKey[] {
  // 'age' = kepala TOKEN (selalu ada; umur tak punya kolom sendiri) → Sort ringkas tak lagi selalu tampil
  return kunciDari(kolom({ chain, view, compact, spark: !compact, sempit: false }).cols)
}

function kunciDari(cols: Col[]): SortKey[] {
  return ['age', ...cols.flatMap((c) => (c.sort ? [c.sort] : []))]
}

/* ⭐ Panel terbuka (izin pemilik 29 Okt): set ringkas tetap lebih lebar dari kartu di layar ≤1680 → WHY/TOP RISK &
   tombol Buy tergeser keluar kartu (scrollbar tersembunyi). Kolom dibuang berurutan dari sini sampai grid muat;
   TOKEN, SCORE, TOP RISK/WHY & aksi tak pernah dibuang. Sortir kolom yang dibuang tetap ada lewat Sort ringkas. */
// T1: 'out' (BNB) dibuang di giliran 'trend' (SOL) → kolom tersisa kedua chain sama di setiap lebar
const BUANG = ['pressure', 'liq', 'curve', 'retention', 'move', 'out', 'trend', 'mc']
const GAP = 12 // --sp-4 (gap grid)
const PAD_BARIS = 16 * 2 // --sp-5 kiri+kanan .pt-row

/* ⚠️ U21: kerangka statis index.html + styles/kerangka.css meniru template kolom (`kolom()`, ringkas & SEMPIT) dan tinggi
   kepala/baris skeleton tabel ini. Ubah lebar/padding/jarak di sini → selaraskan di sana (uji: posisi baris statis =
   keadaan memuat React). */
/* ⭐ U6 (audit 7 Nov): ponsel. Set yang tersisa (TOKEN + SCORE + TOP RISK + aksi ≥ 678px) tetap tak muat di kartu
   ponsel walau semua kolom BUANG dibuang → dulu MC ikut dibuang padahal tak menolong (grid tetap menggulir di dalam
   kartu), sehingga di 390 hanya TOKEN & SCORE yang terlihat, tanpa harga pasar sama sekali. Kini: MC hanya dibuang bila
   itu membuat grid muat; bila tetap tak muat ("sempit"), SCORE & MC memakai lebar isi ringkasnya dan TOKEN mengisi sisa
   layar pertama → TOKEN · SCORE · MC (+Δ) terlihat tanpa menggulir. U26b: TOP RISK & aksi (Buy) kini baris kedua di
   bawahnya (dulu di kanan kartu yang menggulir, tak terlihat tanpa petunjuk) → baris lebih tinggi, tanpa gulir samping. */
const SEMPIT = {
  /* U26c: lebar = lebar ISI (sel SCORE & MC tanpa padding dalam di mode sempit, CSS). Skor ringkas terlebar 89 (angka +
     "24.9%/collapsed"); keadaan BNB tanpa skor melipat (CSS is-sempit). Dulu 96/68 + padding sel 2×6. */
  score: 92,
  /* MC + Δ: kedua chain menulis jendela di sel (T-2 22 Nov). Baris Δ sempit 11 px (CSS): "−88.9% launch" 81 px,
     "+449.0% launch" ±88 px (diukur 22 Nov) → 88; ≥ 4 digit ("+1672.5% launch", jarang) melipat jendelanya ke baris
     sendiri (CSS `.pt.is-sempit .pt-num .pt-delta`), tak meluap ke SCORE. */
  mc: { sol: 88, bnb: 88 },
  /* TOKEN terkecil: 360 px = 294 px isi kartu = 74 + 92 + 88 + jarak & padding → tanpa gulir di 360 (T-2: dulu 88 dgn
     MC 60/72); di bawahnya (≤ 340) kartu kembali menggulir sedikit */
  tokenMin: 74,
  /* ⭐ U26b/c: padding kiri-kanan baris & jarak kolom di mode sempit (CSS `.pt.is-sempit`, --sp-3). Baris = dua baris
     grid: TOKEN · SCORE · MC, lalu TOP RISK (selebar TOKEN+SCORE) · Buy (di bawah MC) → tanpa gulir samping. */
  pad: 8,
  gap: 8,
}

/** Lebar minimum (px) satu lebar kolom: '176px' / 'minmax(200px, 1fr)' → angka px pertama. */
const minPx = (w: string) => Number(/(\d+)px/.exec(w)?.[1] ?? 0)

function lebarMin(token: string, cols: Col[], aksi: string): number {
  return minPx(token) + cols.reduce((a, c) => a + minPx(c.width), 0) + minPx(aksi) + GAP * (cols.length + 1) + PAD_BARIS
}

function kolom(ctx: Ctx, muat?: number | null): { cols: Col[]; template: string; minW: number; sempit: boolean } {
  const [penuh, ringkas] = SET[`${ctx.chain}:${ctx.view}`] ?? SET['sol:new']!
  let cols = (ctx.compact ? ringkas : penuh).map((id) => {
    const c = C[id]!
    if (id !== 'risk') return c
    // Panel terbuka: TOP RISK min. 180 (bukan 200) → di 1440 TREND (SOL) / AT 90M (BNB) masih muat
    return { ...c, ...(ctx.compact && { width: 'minmax(180px, 1fr)' }) }
  })
  // TOKEN diberi plafon (yang melar hanya TOP RISK); kolom aksi 92 (panel terbuka) / 104 — sama dgn preview
  let token = ctx.compact ? 'minmax(150px, 250px)' : 'minmax(180px, 300px)'
  const aksi = ctx.compact ? '92px' : '104px'
  let sempit = false
  if (ctx.compact && muat) {
    for (const id of BUANG) {
      if (lebarMin(token, cols, aksi) <= muat) break
      // U6: MC (giliran terakhir) hanya dibuang bila itu membuat grid muat
      if (id === 'mc' && lebarMin(token, cols.filter((c) => c.id !== 'mc'), aksi) > muat) break
      cols = cols.filter((c) => c.id !== id)
    }
    if (lebarMin(token, cols, aksi) > muat) {
      sempit = true
      /* ⭐ U26b (sisa U6): grid HANYA tiga kolom TOKEN · SCORE · MC selebar kartu (TOKEN = sisa, `1fr`); sel TOP RISK
         & aksi turun ke baris grid kedua (CSS `.pt.is-sempit`), jadi tak ada lagi bagian baris di luar layar yang
         hanya bisa dicapai lewat gulir samping tersembunyi. Dulu TOKEN = sisa layar pertama dgn padding KIRI saja →
         di 360 kolom MC melewati tepi kartu ±14 px (U26c). */
      const mc = SEMPIT.mc[ctx.chain]
      cols = cols.map((c) => (c.id === 'score' ? { ...c, width: `${SEMPIT.score}px` } : c.id === 'mc' ? { ...c, width: `${mc}px` } : c))
      const baris1 = cols.filter((c) => c.id !== 'risk')
      return {
        cols,
        template: `minmax(${SEMPIT.tokenMin}px, 1fr) ${baris1.map((c) => c.width).join(' ')}`,
        minW: SEMPIT.tokenMin + baris1.reduce((a, c) => a + minPx(c.width), 0) + SEMPIT.gap * baris1.length + SEMPIT.pad * 2,
        sempit,
      }
    }
  }
  return { cols, template: `${token} ${cols.map((c) => c.width).join(' ')} ${aksi}`, minW: lebarMin(token, cols, aksi), sempit }
}

export function PairTable({
  rows,
  chain,
  view,
  compact,
  selectedId,
  onSelect,
  loading = false,
  provisional,
  sort,
  sortKeys,
  onSort,
  onTerlihat,
  onSempit,
}: {
  rows: PairModel[]
  chain: 'sol' | 'bnb'
  view: PairView
  /** Panel terbuka (preview `compact`): set kolom ringkas, skor tanpa sparkline. */
  compact: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  /** Baris skeleton (muat pertama). */
  loading?: boolean
  /** BNB: kalibrasi provisional → chip di kepala kolom Score. */
  provisional?: string | null
  /** A6: sortir aktif (null = urutan feed) & kolom yang bisa disortir. Tanpa `onSort` kepala kolom = teks biasa. */
  sort?: Sort
  sortKeys?: SortKey[]
  onSort?: (s: Sort) => void
  /** Kunci sortir yang kepalanya benar-benar tampil (berubah saat panel terbuka membuang kolom agar muat). */
  onTerlihat?: (keys: SortKey[]) => void
  /** U26b putaran 2: tabel masuk/keluar mode sempit (tanpa chevron detail) → panel/sheet menampilkan isi detail itu. */
  onSempit?: (sempit: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  /* A6: feed hidup diurutkan ulang tiap polling → React MEMINDAH node baris; node berfokus yang dipindah kehilangan
     fokus (jatuh ke body). Catat elemen berfokus di dalam tabel saat render, kembalikan setelah commit bila hilang. */
  const fokus = typeof document !== 'undefined' && ref.current?.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null
  useLayoutEffect(() => {
    if (!fokus || !fokus.isConnected) return
    const a = document.activeElement
    if (a === fokus || (a && a !== document.body)) return
    fokus.focus({ preventScroll: true })
  })

  // Lebar isi kartu (tanpa padding) — hanya dipakai saat panel terbuka utk membuang kolom yang tak muat
  const [muat, setMuat] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !compact) return
    const ukur = () => {
      const cs = getComputedStyle(el)
      setMuat(Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)))
    }
    ukur()
    const ro = new ResizeObserver(ukur)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])

  /* ⭐ U15 (audit 7 Nov): `ctx`, kolom & callback baris berIDENTITAS STABIL → `Row` (memo) hanya dirender ulang bila
     isinya berubah. Dulu objek/fungsi baru tiap render membuat 50 baris dirender ulang di setiap jawaban poll 5 dtk
     walau isinya sama (Trenches SOL graduated ±406 ms script/menit dgn hanya 7 mutasi DOM; BNB ±722 ms). */
  const dasar = useMemo(() => ({ chain, view, compact, spark: !compact, sempit: false }), [chain, view, compact])
  const { cols, template, minW, sempit } = useMemo(() => kolom(dasar, compact ? muat : null), [dasar, compact, muat])
  /* U14: sparkline mengikuti LEBAR kartu (`muat`, ResizeObserver), bukan boolean panel. Sebelum lebar pertama terukur
     (muat null) tetap tanpa sparkline spt dulu → tak ada kedipan sparkline di ponsel. */
  const spark = !compact || (muat !== null && !sempit)
  const ctx: Ctx = useMemo(() => ({ ...dasar, spark, sempit }), [dasar, spark, sempit])
  // onSelect dari Trenches = fungsi baru tiap render → dibaca lewat ref, baris menerima pembungkus yang tetap
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const pilih = useCallback((id: string) => onSelectRef.current(id), [])
  const toggle = useCallback((id: string) => setExpanded((cur) => (cur === id ? null : id)), [])
  // U26b: mode sempit tanpa chevron (detail = sheet) → baris yang terbuka sebelum menyempit (mis. jendela diperkecil) ditutup
  useEffect(() => {
    if (sempit) setExpanded(null)
  }, [sempit])
  const terlihat = kunciDari(cols).join(',')
  useLayoutEffect(() => {
    onTerlihat?.(terlihat.split(',') as SortKey[])
  }, [terlihat, onTerlihat])
  useLayoutEffect(() => {
    onSempit?.(sempit)
  }, [sempit, onSempit])

  return (
    <div
      ref={ref}
      className={`pt ${compact ? 'is-compact' : ''}${sempit ? ' is-sempit' : ''}`}
      role="table"
      aria-label={`${chain === 'sol' ? 'Solana' : 'BNB'} pairs, ${view}`}
      style={{ ['--pt-cols' as string]: template, ...(compact ? { ['--pt-min-w' as string]: `${minW}px` } : null) }}
    >
      <div className="pt-head" role="row">
        {/* Nit R1: kepala TOKEN menyortir UMUR (siklus sama: turun = tertua dulu → naik → bawaan feed) */}
        {onSort && sortKeys?.includes('age') ? (
          <span
            role="columnheader"
            className="pt-h"
            aria-sort={sort?.key === 'age' ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
          >
            <button
              type="button"
              className={`pt-sort ${sort?.key === 'age' ? 'is-active' : ''}`}
              title="Sort by age"
              onClick={() => onSort(siklus(sort ?? null, 'age'))}
            >
              Token
              <span className="pt-sort-i" aria-hidden="true">{sort?.key === 'age' ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
            </button>
          </span>
        ) : (
          <span role="columnheader">Token</span>
        )}
        {cols.map((c) => {
          const bisa = !!onSort && !!c.sort && !!sortKeys?.includes(c.sort)
          const aktif = bisa && sort && sort.key === c.sort ? sort.dir : null
          return (
            <span
              key={c.id}
              role="columnheader"
              // U26b: sempit → TOP RISK = baris kedua tiap baris (tanpa kepala terlihat; tetap terbaca pembaca layar)
              className={`pt-h ${c.align === 'r' ? 'ta-r' : ''}${sempit && c.id === 'risk' ? ' sr-only' : ''}`}
              aria-sort={bisa ? (aktif === 'desc' ? 'descending' : aktif === 'asc' ? 'ascending' : 'none') : undefined}
            >
              {bisa ? (
                // A6: klik / Enter / Spasi = turun → naik → urutan bawaan feed. Panah = penanda visual (aria-sort).
                <button
                  type="button"
                  className={`pt-sort ${aktif ? 'is-active' : ''}`}
                  onClick={() => onSort!(siklus(sort ?? null, c.sort!))}
                >
                  {c.label}
                  <span className="pt-sort-i" aria-hidden="true">{aktif === 'asc' ? '↑' : aktif === 'desc' ? '↓' : '↕'}</span>
                </button>
              ) : c.id === 'trend' ? (
                // U18: kepala "Score path" sendiri = pemicu penjelas (kolom 92 px tak muat label + sub-label "not price")
                <InfoPopover info={INFO_SCORE_PATH} label={c.label} className="pt-hl">{c.label}</InfoPopover>
              ) : (
                c.label
              )}
              {/* U10 → T-2 (22 Nov): "Δ launch" di kepala MC SOL dilepas; jendela kini ditulis di tiap sel kedua chain. */}
              {/* T-9 (22 Nov): mode sempit → Provisional = ikon "?" (dulu chip melipat di kepala SCORE 92 px) */}
              {c.id === 'score' && provisional && (sempit ? (
                <InfoPopover info={provisional} label="Provisional calibration" className="ip-q pt-prov-q">?</InfoPopover>
              ) : (
                <InfoPopover info={provisional} label="Provisional calibration" className="chip-trigger pt-prov-t">
                  <span className="pt-prov">Provisional</span>
                </InfoPopover>
              ))}
            </span>
          )
        })}
        <span role="columnheader" className="sr-only">Actions</span>
      </div>

      <div className="pt-body" role="rowgroup">
        {loading
          ? Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="pt-row is-skeleton" role="row" aria-hidden="true">
                <span className="pt-token"><i className="pt-sk pt-sk-av" /><i className="pt-sk pt-sk-l" /></span>
                {cols.map((c) => <span key={c.id} className={`${c.align === 'r' ? 'ta-r' : ''}${sempit && c.id === 'risk' ? ' pt-baris2' : ''}`}><i className="pt-sk" /></span>)}
                {/* U26b: sempit → slot tombol Buy di baris kedua (tinggi baris skeleton = baris nyata) */}
                {sempit ? <span className="pt-actions"><i className="pt-sk pt-sk-buy" /></span> : <span />}
              </div>
            ))
          : rows.map((m) => (
              <Row
                key={m.id}
                m={m}
                cols={cols}
                ctx={ctx}
                sempit={sempit}
                selected={m.id === selectedId}
                expanded={expanded === m.id}
                onSelect={pilih}
                onToggle={toggle}
              />
            ))}
      </div>
    </div>
  )
}

/** Perbandingan nilai polos (objek/array/primitif) — model baris dari adapter tak memuat fungsi/elemen React; bila
    ada (`$$typeof`) atau terlalu dalam, dibandingkan identitasnya saja (aman: paling buruk baris dirender ulang). */
function samaDalam(a: unknown, b: unknown, dalam = 0): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || dalam > 6) return false
  if ('$$typeof' in a || '$$typeof' in b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => samaDalam(x, b[i], dalam + 1))
  }
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  const oa = a as Record<string, unknown>, ob = b as Record<string, unknown>
  return ka.every((k) => Object.prototype.hasOwnProperty.call(ob, k) && samaDalam(oa[k], ob[k], dalam + 1))
}

/**
 * U15: baris sama bila modelnya sama ISI-nya (adapter membuat objek baru tiap poll) dan prop lain sama identitasnya.
 * ⚠️ `ageSecs` DIKECUALIKAN: synt-dash menghitungnya dari jam di tiap jawaban (berubah tiap poll) padahal BARIS tak
 * menggambarnya (umur hanya dipakai sortir di Trenches & panel, yang tetap menerima model terbaru). Bila kelak baris
 * menampilkan umur, hapus pengecualian ini.
 */
function samaPropBaris(a: RowProps, b: RowProps): boolean {
  return (
    a.cols === b.cols && a.ctx === b.ctx && a.sempit === b.sempit && a.selected === b.selected &&
    a.expanded === b.expanded && a.onSelect === b.onSelect && a.onToggle === b.onToggle &&
    (a.m === b.m || samaDalam({ ...a.m, ageSecs: null }, { ...b.m, ageSecs: null }))
  )
}

type RowProps = {
  m: PairModel
  cols: Col[]
  ctx: Ctx
  /** U6: mode ponsel (kolom TOKEN sempit) → baris tag BNB satu baris dgn tag peringatan pertama selalu tampil. */
  sempit: boolean
  selected: boolean
  expanded: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}

const Row = memo(function Row({ m, cols, ctx, sempit, selected, expanded, onSelect, onToggle }: RowProps) {
  return (
    <div className={`pt-item ${expanded ? 'is-expanded' : ''}`}>
      <div
        className={`pt-row is-clickable ${selected ? 'is-selected' : ''}`}
        role="row"
        tabIndex={0}
        aria-selected={selected}
        onClick={() => onSelect(m.id)}
        onKeyDown={(e) => {
          // hanya tombol pada baris itu sendiri (Enter di tautan simbol / pemicu popover tak ikut memilih)
          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
          e.preventDefault()
          onSelect(m.id)
        }}
      >
        <span role="cell" className="pt-token">
          {/* ukuran baris = --av-row (34, preview) lewat PairTable.css; `md` hanya memilih ukuran inisial */}
          <Avatar name={m.symbol} src={m.image} size="md" />
          {/* T1: BNB bertag = tiga tingkat dirapatkan (.has-tags) → tinggi baris tetap 72 spt baris SOL */}
          <span className={`pt-token-id${m.chain === 'bnb' && (m.rowTags ?? m.tags).length > 0 ? ' has-tags' : ''}`}>
            <Link
              to={m.href}
              className="pt-symbol"
              title={m.name && m.name !== m.symbol ? m.name : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              {m.symbol}
            </Link>
            {/* ⭐ Alamat, bukan handle sosial: simbol tidak unik, alamat bisa diverifikasi di explorer */}
            {/* SOL: label P2 di baris sendiri (preview). T1: BNB sama, tag baris di bawah alamat dlm satu baris (+N) */}
            <span className="pt-mint">{alamatPendek(m.address)}</span>
            {/* T-6: SOL `tags` kini memuat launchpad (panel) → baris memakai `rowTags` (label P2) di kedua chain */}
            {m.chain === 'bnb' ? (m.rowTags ?? m.tags).length > 0 && <TagLineFit tags={m.rowTags ?? m.tags} sempit={sempit} /> : <TagLine tags={m.rowTags ?? m.tags} />}
          </span>
        </span>

        {cols.map((c) => (
          <span key={c.id} role="cell" className={`pt-cell ${c.align === 'r' ? 'pt-num' : ''}${sempit && c.id === 'risk' ? ' pt-baris2' : ''}`}>
            {c.render(m, ctx)}
          </span>
        ))}

        <span role="cell" className="pt-actions">
          <button
            type="button"
            className="pt-expand"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide details' : 'Show details'}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(m.id)
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <ChevronIcon flipped={expanded} />
          </button>
          {/* 2 Nov: quick buy NYATA (jumlah = pengaturan Quick buy; BNB sejak 3 Nov, pair ber-quote BNB) */}
          {m.buy ? <QuickBuy mint={m.address} symbol={m.symbol} className="pt-buy" chain={m.chain} /> : m.buyWhy && <BuyOff why={m.buyWhy} symbol={m.symbol} cls="pt-buy" />}
        </span>
      </div>

      {expanded && <Expand m={m} />}
    </div>
  )
}, samaPropBaris)

/** Detail baris (preview `ExpandPanel`): base rate, ringkasan lintasan skor, salin alamat, tautan audit penuh. */
function Expand({ m }: { m: PairModel }) {
  const { copy, copied } = useCopy()
  const s = m.score
  const h = s.kind === 'value' ? s.spark : undefined
  return (
    <div className="pt-detail">
      <div className="pt-detail-main">
        {s.kind === 'value' ? (
          <p className="pt-baserate">
            {s.rate !== null ? <><strong>{rate(s.rate)}</strong> {s.sentence}. </> : <>{s.sentence} </>}
            A score is an audit, not a guarantee.
            {s.measured !== null && <> Only {s.measured} of {s.checksMax ?? s.max} checks could be measured for this pair.</>}
          </p>
        ) : (
          <p className="pt-baserate">{s.title}{s.sub ? ` · ${s.sub}` : ''}. {s.info}</p>
        )}
        {h && h.length > 1 && (
          <p className="pt-traj-sum">
            Scored <strong>{h.length}×</strong> so far{' · '}
            <span className={(h[h.length - 1] ?? 0) >= (h[0] ?? 0) ? 'is-up' : 'is-down'}>
              {h[0]} → {h[h.length - 1]}
            </span>
          </p>
        )}
      </div>
      <div className="pt-detail-side">
        <button type="button" className="pt-copy" onClick={() => copy(m.address, m.address)}>
          {copied === m.address ? 'Copied' : alamatPendek(m.address)}
        </button>
        <Link to={m.href} className="pt-open">Open full audit →</Link>
      </div>
    </div>
  )
}

/**
 * ⭐ T-4 (22 Nov): slot aksi selalu terisi. Pair yang tak bisa Quick buy (BNB ber-quote non-BNB) = tombol "Buy" redup
 * yang membuka sebabnya (popover ketuk), bukan kolom bolong. Hanya tampilan: tak memanggil QuickBuy/transaksi apa pun.
 * Pemicu popover sudah <button> → isinya span bergaya tombol (`aria-disabled`).
 */
export function BuyOff({ why, symbol, cls }: { why: string; symbol: string; cls: string }) {
  return (
    <InfoPopover info={why} label={`Buy ${symbol} unavailable`} className={`${cls}-off-t`}>
      <span className={`${cls} is-off`} aria-disabled="true">Buy</span>
    </InfoPopover>
  )
}

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg viewBox="0 0 10 6" width="10" height="6" fill="none" aria-hidden="true" className={flipped ? 'is-flipped' : undefined}>
      <path d="m1 1 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
