import { InfoPopover } from './Popover'
import './ScoreCell.css'

/**
 * Sel skor baris tabel (A2, DESIGN-TERMINAL §2), dipakai Trenches SOL & BNB. Dulu dua `ScoreCell` terpisah
 * (TrenchesTable & BnbParts) dgn logika keadaan kosong masing-masing.
 *
 * ⛔ Tampilan skor & kosakata Solana DIBEKUKAN sampai pemilik memutuskan DESIGN §6 (no. 2-4): warna SOL dari
 * `checks`, kata "collapsed" (SOL) / "rug" (BNB), ukuran angka. Komponen ini hanya MENYATUKAN struktur & aturan
 * kosong; `look` memilih kelas CSS lama per chain (`.tt-score*` di TrenchesTable.css, `.bnb-score*` di Bnb.css)
 * sehingga piksel yang tampil SAMA dgn sebelum A2.
 * `nada="base"` (opsional, belum dipakai) = warna dari base rate runtuh lewat `--tone-1..4` (§1.2).
 * ⛔ Skor selalu disertai base rate (PRODUK.md §0). Tak ada skor → "—"/"Quiet…"/"Scoring at 2m", tak pernah 0.
 */
export type ModelSkor =
  | {
      kind: 'value'
      value: number
      /** Ditulis "/max" (BNB). SOL 0-100 tanpa "/100". */
      max?: number
      /** "(3 measured)" bila tak semua sinyal terukur (BNB). */
      measured?: string | null
      /** Kelas nada bawaan chain (SOL: is-high/mid/low dari `checks`). */
      nadaKelas?: string
      /** Base rate: angka teks ("21%") + kata ("collapsed"/"rug"). null → `baseKosong`. */
      base: { pct: string; word: string; title?: string; nilai?: number | null } | null
      /** Teks bila base rate belum ada (BNB: "No base rate yet"); tanpa ini tak ditulis apa pun. */
      baseKosong?: string
      /** Lintasan skor (SOL: 3m→30m), digambar bertangga. */
      spark?: number[]
      title?: string
    }
  | { kind: 'pending' | 'quiet' | 'none'; text?: string; title?: string }

/** Nada dari base rate runtuh (DESIGN §1.2): < 15 → 1, 15-25 → 2, 25-35 → 3, ≥ 35 → 4. */
export function nadaDariBase(pct: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 0
  return pct < 15 ? 1 : pct < 25 ? 2 : pct < 35 ? 3 : 4
}

export function ScoreCell({
  model: m,
  look,
  compact = false,
  nada = 'bawaan',
}: {
  model: ModelSkor
  look: 'sol' | 'bnb'
  compact?: boolean
  /** `bawaan` = perilaku chain sekarang; `base` = warna dari base rate (menunggu keputusan pemilik). */
  nada?: 'bawaan' | 'base'
}) {
  // A6: penjelasan keadaan kosong & arti base rate lewat popover ketuk (dulu `title`, tak terjangkau sentuh/keyboard)
  if (m.kind !== 'value') {
    const teks = m.kind === 'none' || !m.text ? '—' : m.text
    const kelas = teks === '—' ? 'tt-dim' : look === 'bnb' ? 'bnb-score-pending' : 'tt-dim'
    return <span className={kelas}>{m.title ? <InfoPopover info={m.title} label={teks === '—' ? 'Score' : teks}>{teks}</InfoPopover> : teks}</span>
  }
  const baseTeks = (isi: React.ReactNode) =>
    m.base?.title ? <InfoPopover info={m.base.title} label="Base rate">{isi}</InfoPopover> : isi

  const nadaKelas = nada === 'base' ? `sk-tone-${nadaDariBase(m.base?.nilai)}` : (m.nadaKelas ?? '')

  if (look === 'bnb') {
    return (
      <span className={`bnb-score ${compact ? 'is-compact' : ''}`} title={m.title}>
        <span className={`bnb-score-num ${nadaKelas}`}>
          {m.value}
          {m.max !== undefined && <span className="bnb-score-max">/{m.max}</span>}
          {m.measured && <span className="bnb-score-measured">{m.measured}</span>}
        </span>
        <span className="bnb-score-base">{m.base ? `${m.base.pct} ${m.base.word}` : (m.baseKosong ?? '')}</span>
      </span>
    )
  }

  /* Solana: markup persis versi sebelum A2 (TrenchesTable). Saat sempit, sparkline dilepas tapi BASE RATE tetap. */
  if (compact) {
    return (
      <span className="tt-score">
        <span className={`tt-score-num ${nadaKelas}`}>{m.value}</span>
        {m.base && (
          <span className="tt-score-base">
            {baseTeks(<>{m.base.pct}<br />{m.base.word}</>)}
          </span>
        )}
      </span>
    )
  }
  const h = m.spark
  return (
    <span className="tt-score">
      <span className={`tt-score-num ${nadaKelas}`}>{m.value}</span>
      <span className="tt-score-side">
        {h && h.length > 1 && <ScoreSpark points={h} rising={(h[h.length - 1] ?? 0) >= (h[0] ?? 0)} />}
        {m.base && (
          <span className="tt-score-base">
            {baseTeks(<>{m.base.pct} {m.base.word}</>)}
          </span>
        )}
      </span>
    </span>
  )
}

/** Sparkline bertangga 84×22: skor hanya berubah di titik snapshot, kurva mulus menyiratkan pengukuran palsu. */
export function ScoreSpark({ points, rising, w = 84, h = 22 }: { points: number[]; rising: boolean; w?: number; h?: number }) {
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const span = hi - lo || 1
  const step = w / (points.length - 1)
  const d = points
    .map((p, i) => {
      const x = i * step
      const y = h - ((p - lo) / span) * h
      if (i === 0) return `M0 ${y.toFixed(1)}`
      const prevY = h - ((points[i - 1]! - lo) / span) * h
      return `L${x.toFixed(1)} ${prevY.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="tt-spark">
      <path d={d} className={rising ? 'is-up' : 'is-down'} />
    </svg>
  )
}

/**
 * ⭐ A3 (DESIGN §2 ScoreCell, keputusan §6.1 no. 2-4): sel skor BERSAMA kedua chain di Trenches. Satu tampilan:
 * angka `.t-score` (18px) berwarna nada dari base rate RUNTUH (`--tone-1..4`, bukan `checks`), "/max" hanya bila
 * max ≠ 100, sparkline 56×18 opsional, baris-2 "**20.5%** collapsed". Kosong → dua baris redup ("Quiet / not scored",
 * "Scoring at 2m / in 1m"), tak pernah 0.
 * ⛔ Angka skor & base rate diteruskan APA ADANYA dari adapter; komponen ini hanya menata tampilannya.
 * Tampilan lama (`look="sol"|"bnb"`) tetap utk konsumen lain (WalletLookup).
 */
export function ScoreBadge({
  value,
  max = 100,
  rateText,
  tone,
  spark,
  empty,
  info,
  measured,
}: {
  value?: number
  max?: number
  /** Base rate terformat ("20.5%"); null → "No base rate yet". */
  rateText?: string | null
  tone?: 0 | 1 | 2 | 3 | 4
  spark?: number[]
  /** Skor tak ada: dua baris. */
  empty?: { title: string; sub: string }
  /** Penjelasan keadaan kosong ("Quiet", "Scoring at 2m") lewat popover ketuk, bukan `title`. */
  info?: string
  /** BNB: jumlah sinyal terukur bila < max → teks terlihat "(3 measured)". */
  measured?: number | null
}) {
  if (empty || value === undefined) {
    const t = empty?.title ?? '—'
    // A6 (nit Reviewer A3): pemicu popover = ikon "?" kecil, BUKAN teks status selebar sel → ketukan di sel skor
    // (ponsel 390) tetap memilih baris / membuka sheet; hanya ikon yang membuka penjelasan.
    return (
      <span className="scb scb-empty">
        <span className="scb-empty-t">
          {t}
          {info && <InfoPopover info={info} label={t} className="ip-q">?</InfoPopover>}
        </span>
        {empty?.sub && <span className="scb-empty-s">{empty.sub}</span>}
      </span>
    )
  }
  const t = `sk-tone-${tone ?? 0}`
  return (
    <span className="scb">
      <span className="scb-top">
        <span className={`scb-num t-score ${t}`}>
          {value}
          {max !== 100 && <span className="scb-max">/{max}</span>}
        </span>
        {measured !== undefined && measured !== null && <span className="scb-measured">({measured} measured)</span>}
        {spark && spark.length > 1 && (
          <ScoreSpark points={spark} rising={(spark[spark.length - 1] ?? 0) >= (spark[0] ?? 0)} w={56} h={18} />
        )}
      </span>
      <span className="scb-base">
        {rateText ? <><b className={`t-num-sm ${t}`}>{rateText}</b> collapsed</> : 'No base rate yet'}
      </span>
    </span>
  )
}
