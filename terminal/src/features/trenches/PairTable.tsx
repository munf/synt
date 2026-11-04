import { QuickBuy } from '@/features/trade/QuickBuy'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { siklus, type Sort, type SortKey } from './pairSort'
import { Avatar } from '@/components/Avatar'
import { ScoreBadge, ScoreSpark } from '@/components/ScoreCell'
import { StatusChip } from '@/components/StatusChip'
import { InfoPopover } from '@/components/Popover'
import { alamatPendek, pct, trendClass, uang } from '@/lib/format'
import { useCopy } from '@/lib/useCopy'
import { hitung, rate, type PairModel, type Num, type Tag } from './pairModel'
import './PairTable.css'

/**
 * ⭐ SATU tabel Trenches utk Solana & BNB (A3), digambar ulang R1 (28 Okt, DESIGN-TERMINAL §0) dgn markup & ukuran
 * tabel PREVIEW (`master` src/features/trenches/TrenchesTable.tsx): kartu bergulir sendiri, kepala lengket, baris
 * min. 72px dgn jarak 12, skor telanjang 19px + sparkline 84×22 + "NN% collapsed", TREND chip di SEMUA tampilan SOL,
 * MC + Δ bertumpuk, SELL/BUY, TOP RISK paling kanan, kolom aksi (chevron detail + Buy). Grid minimum `--tt-min-w`
 * (1180, preview) → di bawahnya kartu tabel yang menggulir, bukan halaman.
 *
 * Yang dipertahankan dari lab (§0.2): model chain-agnostik (`PairModel`), sortir lewat kepala kolom (panah gaya
 * kepala preview), "—" yang bisa diketuk (popover), tag & kolom khusus BNB (BUYERS, AT 90M, WHY, chip Provisional).
 * Chain hanya mengubah ISI slot; bentuk, ukuran & gaya sel sama.
 */
export type TableMode = 'wide' | 'mid' | 'phone'
export type PairView = 'new' | 'trending' | 'bonding' | 'graduated'

interface Ctx {
  chain: 'sol' | 'bnb'
  view: PairView
  compact: boolean
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

/** Sel skor preview: angka telanjang berwarna + (sparkline) + base rate. Panel terbuka → tanpa sparkline, base rate 2 baris. */
function Score({ m, compact }: { m: PairModel; compact: boolean }) {
  const s = m.score
  if (s.kind !== 'value') return <ScoreBadge empty={{ title: s.title, sub: s.sub }} info={s.info} />
  const tone = `sk-tone-${s.tone}`
  const num = (
    <span className={`pt-score-num ${tone}`}>
      {s.value}
      {s.max !== 100 && <span className="pt-score-max">/{s.max}</span>}
    </span>
  )
  // ⛔ Base rate WAJIB menempel pada skor (PRODUK.md §0), juga saat sempit.
  const base = s.rate === null ? <>No base<br />rate yet</> : compact ? <>{rate(s.rate)}<br />collapsed</> : <>{rate(s.rate)} collapsed</>
  if (compact) {
    return (
      <span className="pt-score">
        {num}
        <span className="pt-score-base">{base}</span>
      </span>
    )
  }
  const h = s.spark
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

/** TOP RISK (SOL) / WHY (BNB): chip mono tanpa kotak dipisah titik, yang menurunkan skor berwarna, sisanya redup. */
function Risk({ m }: { m: PairModel }) {
  if (!m.reasons.length) {
    return m.reasonsEmpty ? (
      <span className="pt-risk-none">{m.reasonsEmpty}</span>
    ) : (
      <Kosong why={m.reasonsWhy ?? undefined} label={m.chain === 'bnb' ? 'Why' : 'Top risk'} />
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

function TagLine({ tags, max = 2 }: { tags: Tag[]; max?: number }) {
  if (!tags.length || max <= 0) return null
  return (
    <span className="pt-tags">
      {tags.slice(0, max).map((t) =>
        t.info ? (
          <InfoPopover key={t.label} className="chip-trigger" label={t.label} info={t.info}>
            <span className={`pt-tag is-${t.tone}`}>{t.label}</span>
          </InfoPopover>
        ) : (
          // pembungkus = bentuk sama dgn pemicu popover → pemisah "·" selalu di dlm `.pt-tag`
          <span key={t.label} className="pt-tag-w"><span className={`pt-tag is-${t.tone}`}>{t.label}</span></span>
        ),
      )}
    </span>
  )
}

/**
 * BNB: alamat + tag dlm SATU baris. Tag yang tak muat disembunyikan utuh (peringatan dulu, urutan model) dan
 * dihitung jadi "+N" (nit R1: dulu hilang tanpa tanda); semua tag tetap di panel. Diukur sesudah tata letak:
 * selama ada yang turun baris (termasuk "+N" sendiri), satu tag lagi dilepas; lebar berubah → hitung ulang.
 */
function MintLineBnb({ address, tags }: { address: string; tags: Tag[] }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [tampil, setTampil] = useState(tags.length)
  // tag pertama (peringatan) muat sendirian tapi tidak bersama "+N" → tag itu yang dipertahankan, "+N" dilepas
  const [tanpaPlus, setTanpaPlus] = useState(false)
  const kunci = tags.map((t) => t.label).join('|')
  useLayoutEffect(() => {
    setTampil(tags.length)
    setTanpaPlus(false)
  }, [kunci, tags.length])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // turun baris = bergeser ≥ setengah tinggi baris (pemicu popover bisa duduk 1-2px lebih rendah di baris yang sama)
    const atas = el.getBoundingClientRect().top
    const turun = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)].some((b) => b.getBoundingClientRect().top - atas >= el.clientHeight / 2)
    const tagTurun = turun('.pt-mint, .pt-tag')
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
  return (
    <span className="pt-mintline" ref={ref}>
      <span className="pt-mint">{alamatPendek(address)}</span>
      <TagLine tags={tags} max={tampil} />
      {sisa > 0 && !tanpaPlus && (
        <span className="pt-more" title={tags.slice(tags.length - sisa).map((t) => t.label).join(', ')}>
          +{sisa}
        </span>
      )}
    </span>
  )
}

/* ── definisi kolom (lebar = preview) ── */

const C: Record<string, Col> = {
  score: { id: 'score', label: 'Score', width: '176px', sort: 'score', render: (m, c) => <Score m={m} compact={c.compact} /> },
  trend: {
    id: 'trend',
    label: 'Trend',
    width: '92px',
    render: (m) => (m.trend ? <StatusChip label={m.trend.label} tone={m.trend.tone} info={m.trend.info} /> : <span className="pt-dim">—</span>),
  },
  mc: {
    id: 'mc',
    label: 'MC',
    width: '104px',
    align: 'r',
    sort: 'mc',
    render: (m) => (
      <span className="pt-stack">
        <Uang n={m.mcap} label="Market cap" />
        {m.change.v === null || m.mcap.v === null ? (
          <span className="pt-delta pt-dim">—</span>
        ) : (
          <span className={`pt-delta ${trendClass(m.change.v)}`}>
            {pct(m.change.v)}
            {/* BNB: jendela Δ selalu ditulis (1h/24h), SOL = sejak launch seperti preview */}
            {m.chain === 'bnb' && <span className="pt-delta-w"> {m.change.label}</span>}
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
      m.change.v === null ? <span className="pt-dim">—</span> : <span className={trendClass(m.change.v)}>{(1 + m.change.v / 100).toFixed(2)}×</span>,
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
  buyers: {
    id: 'buyers',
    label: 'Buyers',
    width: '96px',
    align: 'r',
    sort: 'buyers',
    render: (m) => (m.holders.v === null ? <Kosong why={m.holders.why} label="Buyers" /> : <span>{hitung(m.holders.v)}</span>),
  },
  out: {
    id: 'out',
    label: 'At 90m',
    width: '104px',
    render: (m) =>
      m.status ? <StatusChip label={m.status.label} tone={m.status.tone} info={m.status.info} /> : <span className="pt-dim">—</span>,
  },
  risk: { id: 'risk', label: 'Top risk', width: 'minmax(200px, 1fr)', render: (m) => <Risk m={m} /> },
}

/** Kolom per chain · tampilan: [penuh, panel terbuka]. TOKEN pertama & aksi terakhir tak terdaftar di sini. SOL = preview. */
const SET: Record<string, [string[], string[]]> = {
  'sol:new': [['score', 'trend', 'mc', 'liq', 'pressure', 'risk'], ['score', 'trend', 'mc', 'liq', 'pressure', 'risk']],
  'sol:trending': [['score', 'trend', 'mc', 'liq', 'pressure', 'curve', 'risk'], ['score', 'trend', 'mc', 'curve', 'pressure', 'risk']],
  'sol:bonding': [['score', 'trend', 'mc', 'liq', 'pressure', 'curve', 'risk'], ['score', 'trend', 'mc', 'curve', 'pressure', 'risk']],
  'sol:graduated': [['score', 'trend', 'mc', 'liq', 'move', 'retention', 'risk'], ['score', 'trend', 'mc', 'retention', 'pressure', 'risk']],
  // BNB: feed tanpa lintasan skor → tanpa TREND; kolom khas (BUYERS, AT 90M) di slot kolom khas preview
  'bnb:new': [['score', 'mc', 'curve', 'pressure', 'buyers', 'risk'], ['score', 'mc', 'curve', 'pressure', 'risk']],
  'bnb:graduated': [['score', 'mc', 'liq', 'pressure', 'buyers', 'out', 'risk'], ['score', 'mc', 'liq', 'out', 'pressure', 'risk']],
}

/** Kunci sortir yang punya kepala kolom terlihat (chain · tampilan · panel terbuka). Sisanya lewat Sort ringkas di bar.
 *  Panel terbuka: tabel bisa membuang kolom lagi agar muat (lihat `BUANG`) → Trenches memakai `onTerlihat` bila ada. */
export function kunciKepala(chain: 'sol' | 'bnb', view: PairView, compact: boolean): SortKey[] {
  // 'age' = kepala TOKEN (selalu ada; umur tak punya kolom sendiri) → Sort ringkas tak lagi selalu tampil
  return kunciDari(kolom({ chain, view, compact }).cols)
}

function kunciDari(cols: Col[]): SortKey[] {
  return ['age', ...cols.flatMap((c) => (c.sort ? [c.sort] : []))]
}

/* ⭐ Panel terbuka (izin pemilik 29 Okt): set ringkas tetap lebih lebar dari kartu di layar ≤1680 → WHY/TOP RISK &
   tombol Buy tergeser keluar kartu (scrollbar tersembunyi). Kolom dibuang berurutan dari sini sampai grid muat;
   TOKEN, SCORE, TOP RISK/WHY & aksi tak pernah dibuang. Sortir kolom yang dibuang tetap ada lewat Sort ringkas. */
const BUANG = ['pressure', 'liq', 'curve', 'retention', 'move', 'out', 'buyers', 'trend', 'mc']
const GAP = 12 // --sp-4 (gap grid)
const PAD_BARIS = 16 * 2 // --sp-5 kiri+kanan .pt-row

/** Lebar minimum (px) satu lebar kolom: '176px' / 'minmax(200px, 1fr)' → angka px pertama. */
const minPx = (w: string) => Number(/(\d+)px/.exec(w)?.[1] ?? 0)

function lebarMin(token: string, cols: Col[], aksi: string): number {
  return minPx(token) + cols.reduce((a, c) => a + minPx(c.width), 0) + minPx(aksi) + GAP * (cols.length + 1) + PAD_BARIS
}

function kolom(ctx: Ctx, muat?: number | null): { cols: Col[]; template: string; minW: number } {
  const [penuh, ringkas] = SET[`${ctx.chain}:${ctx.view}`] ?? SET['sol:new']!
  let cols = (ctx.compact ? ringkas : penuh).map((id) => {
    const c = C[id]!
    if (id !== 'risk') return c
    // Panel terbuka: TOP RISK/WHY min. 180 (bukan 200) → di 1440 TREND (SOL) / CURVE (BNB) masih muat
    return { ...c, ...(ctx.chain === 'bnb' && { label: 'Why' }), ...(ctx.compact && { width: 'minmax(180px, 1fr)' }) }
  })
  // TOKEN diberi plafon (yang melar hanya TOP RISK); kolom aksi 92 (panel terbuka) / 104 — sama dgn preview
  const token = ctx.compact ? 'minmax(150px, 250px)' : 'minmax(180px, 300px)'
  const aksi = ctx.compact ? '92px' : '104px'
  if (ctx.compact && muat) {
    for (const id of BUANG) {
      if (lebarMin(token, cols, aksi) <= muat) break
      cols = cols.filter((c) => c.id !== id)
    }
  }
  return { cols, template: `${token} ${cols.map((c) => c.width).join(' ')} ${aksi}`, minW: lebarMin(token, cols, aksi) }
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

  const ctx: Ctx = { chain, view, compact }
  const { cols, template, minW } = kolom(ctx, compact ? muat : null)
  const terlihat = kunciDari(cols).join(',')
  useLayoutEffect(() => {
    onTerlihat?.(terlihat.split(',') as SortKey[])
  }, [terlihat, onTerlihat])

  return (
    <div
      ref={ref}
      className={`pt ${compact ? 'is-compact' : ''}`}
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
              className={`pt-h ${c.align === 'r' ? 'ta-r' : ''}`}
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
              ) : (
                c.label
              )}
              {c.id === 'score' && provisional && (
                <InfoPopover info={provisional} label="Provisional calibration" className="chip-trigger pt-prov-t">
                  <span className="pt-prov">Provisional</span>
                </InfoPopover>
              )}
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
                {cols.map((c) => <span key={c.id} className={c.align === 'r' ? 'ta-r' : ''}><i className="pt-sk" /></span>)}
                <span />
              </div>
            ))
          : rows.map((m) => (
              <Row
                key={m.id}
                m={m}
                cols={cols}
                ctx={ctx}
                selected={m.id === selectedId}
                expanded={expanded === m.id}
                onSelect={onSelect}
                onToggle={() => setExpanded((cur) => (cur === m.id ? null : m.id))}
              />
            ))}
      </div>
    </div>
  )
}

function Row({ m, cols, ctx, selected, expanded, onSelect, onToggle }: {
  m: PairModel
  cols: Col[]
  ctx: Ctx
  selected: boolean
  expanded: boolean
  onSelect: (id: string) => void
  onToggle: () => void
}) {
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
          <span className="pt-token-id">
            <Link
              to={m.href}
              className="pt-symbol"
              title={m.name && m.name !== m.symbol ? m.name : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              {m.symbol}
            </Link>
            {/* ⭐ Alamat, bukan handle sosial: simbol tidak unik, alamat bisa diverifikasi di explorer */}
            {/* SOL: label P2 di baris sendiri (preview). BNB: tag sebaris dgn alamat → baris tetap 2 tingkat, tinggi 72 */}
            {m.chain === 'bnb' ? (
              <MintLineBnb address={m.address} tags={m.tags} />
            ) : (
              <>
                <span className="pt-mint">{alamatPendek(m.address)}</span>
                <TagLine tags={m.tags} />
              </>
            )}
          </span>
        </span>

        {cols.map((c) => (
          <span key={c.id} role="cell" className={`pt-cell ${c.align === 'r' ? 'pt-num' : ''}`}>
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
              onToggle()
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <ChevronIcon flipped={expanded} />
          </button>
          {/* 2 Nov: quick buy NYATA (jumlah = pengaturan Quick buy; SOL saja, BNB belum) */}
          {m.buy && <QuickBuy mint={m.address} symbol={m.symbol} className="pt-buy" chain={m.chain} />}
        </span>
      </div>

      {expanded && <Expand m={m} />}
    </div>
  )
}

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

function ChevronIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg viewBox="0 0 10 6" width="10" height="6" fill="none" aria-hidden="true" className={flipped ? 'is-flipped' : undefined}>
      <path d="m1 1 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
