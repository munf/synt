import type { Chain, PairModel } from './pairModel'

/* ─────────────────────────────────────────────────────────────────────────
   ⭐ A6 (DESIGN-TERMINAL §3.1 "Filter dasar"): sortir per kepala kolom & filter chip Trenches, sama utk kedua chain.
   Keadaan hidup di URL (`&sort=score-desc&filter=scored,tax5`), bukan state lokal → back/forward & bookmark jalan.

   ⛔ Filter hanya dari field yang BENAR-BENAR ada di feed. SOL "Authority revoked" (§3.1) TIDAK dibuat: `/api/trenches`
   tak mengirim mint/freeze authority (dicek 28 Okt, keempat tampilan) → butuh kolom backend dulu.
   ───────────────────────────────────────────────────────────────────────── */

export type SortKey = 'score' | 'age' | 'mc' | 'liq' | 'buyers'
export type SortDir = 'desc' | 'asc'
export type Sort = { key: SortKey; dir: SortDir } | null

export const SORT_LABEL: Record<SortKey, string> = {
  score: 'Score',
  age: 'Age',
  mc: 'MC',
  liq: 'Liquidity',
  buyers: 'Buyers',
}

/** Kunci sortir per chain · tampilan: hanya kolom yang ada di set kolom penuh tampilan itu (PairTable `SET`). */
// T1 (7 Nov): BNB memakai set kolom SOL → kunci sortir sama (BUYERS tak lagi punya kolom; angkanya di panel).
// Putaran 2: BNB New tanpa kolom LIQ (semua pair di kurva) → tanpa sortir Liquidity.
export function sortKeys(chain: Chain, view: string): SortKey[] {
  if (chain === 'bnb' && view !== 'graduated') return ['score', 'age', 'mc']
  return ['score', 'age', 'mc', 'liq']
}

/** `score-desc` → { key, dir }; nilai tak dikenal / kolom tak tersedia → null (urutan bawaan feed). */
export function bacaSort(s: string | null, keys: SortKey[]): Sort {
  if (!s) return null
  const [k, d] = s.split('-')
  if (!keys.includes(k as SortKey) || (d !== 'desc' && d !== 'asc')) return null
  return { key: k as SortKey, dir: d }
}

export function tulisSort(s: Sort): string | null {
  return s ? `${s.key}-${s.dir}` : null
}

/** Klik/Enter di kepala kolom: turun → naik → bawaan. Kolom lain → mulai dari turun. */
export function siklus(cur: Sort, key: SortKey): Sort {
  if (!cur || cur.key !== key) return { key, dir: 'desc' }
  return cur.dir === 'desc' ? { key, dir: 'asc' } : null
}

/** Nilai pembanding; null = tak terukur ("—", Quiet, Scoring at 2m) → SELALU di bawah, ke arah mana pun. */
function nilai(m: PairModel, key: SortKey): number | null {
  switch (key) {
    case 'score':
      // skala per chain (SOL 0-100, BNB 0-4); dinormalkan ke max agar aman bila max berbeda antar baris
      return m.score.kind === 'value' && m.score.max > 0 ? m.score.value / m.score.max : null
    case 'age':
      return m.ageSecs
    case 'mc':
      return m.mcap.v
    case 'liq':
      return m.liq.v
    case 'buyers':
      return m.holders.v
  }
}

/** Sortir stabil (seri → urutan feed). Tanpa `sort` → urutan feed apa adanya. */
export function urutkan(rows: PairModel[], sort: Sort): PairModel[] {
  if (!sort) return rows
  const arah = sort.dir === 'desc' ? -1 : 1
  return rows
    .map((m, i) => ({ m, i, v: nilai(m, sort.key) }))
    .sort((a, b) => {
      const ka = a.v === null || !Number.isFinite(a.v)
      const kb = b.v === null || !Number.isFinite(b.v)
      if (ka || kb) return ka === kb ? a.i - b.i : ka ? 1 : -1
      return a.v! === b.v! ? a.i - b.i : (a.v! - b.v!) * arah
    })
    .map((x) => x.m)
}

/** Teks pilihan Sort ringkas (ponsel/tablet). */
export function labelSort(key: SortKey, dir: SortDir): string {
  if (key === 'age') return dir === 'desc' ? 'Age, oldest first' : 'Age, newest first'
  return `${SORT_LABEL[key]}, ${dir === 'desc' ? 'high to low' : 'low to high'}`
}

/* ── filter chip ── */

export type FilterId = 'scored' | 'tax5'

export interface FilterDef {
  id: FilterId
  label: string
  chains: Chain[]
  test: (m: PairModel) => boolean
}

export const FILTERS: FilterDef[] = [
  // BNB: hanya baris yang punya angka skor (bukan Quiet / Scoring at 2m / Not scored yet).
  // U8 (audit 7 Nov): TIDAK di SOL — feed /api/trenches SOL hanya memuat pair berskor (0 baris tanpa skor di keempat
  // tampilan), jadi chip itu kontrol mati. `?filter=scored` lama di SOL diabaikan `bacaFilter`.
  { id: 'scored', label: 'Scored only', chains: ['bnb'], test: (m) => m.score.kind === 'value' },
  // BNB: pajak transfer ≤ 5% (500 bps). Pajak tak terukur (four.meme) TIDAK lolos: tak diketahui ≠ rendah.
  { id: 'tax5', label: 'Tax ≤ 5%', chains: ['bnb'], test: (m) => m.taxBps != null && m.taxBps <= 500 },
]

export function filterChain(chain: Chain): FilterDef[] {
  return FILTERS.filter((f) => f.chains.includes(chain))
}

/** `scored,tax5` → id yang berlaku utk chain ini (urut FILTERS, tanpa duplikat). */
export function bacaFilter(s: string | null, chain: Chain): FilterId[] {
  const ada = new Set((s ?? '').split(',').map((x) => x.trim()))
  return filterChain(chain).filter((f) => ada.has(f.id)).map((f) => f.id)
}

export function terapFilter(rows: PairModel[], ids: FilterId[]): PairModel[] {
  if (!ids.length) return rows
  const fs = FILTERS.filter((f) => ids.includes(f.id))
  return rows.filter((m) => fs.every((f) => f.test(m)))
}
