import type { ReactNode } from 'react'
import type { SumberGambar } from '@/components/Avatar'
import { umur } from '@/lib/format'

/* ─────────────────────────────────────────────────────────────────────────
   A4 (DESIGN-TERMINAL §3.2): model SATU halaman token utk kedua chain.

   `TokenView` hanya menggambar model ini; adapter per chain (CoinDetailView = Solana, adaptBnb = BNB) yang
   mengisinya. Chain mengubah ISI slot, bukan BENTUK: urutan kartu, ukuran font, lebar kolom & aturan "—" sama.
   ⛔ Tak terukur = `value: null` + `why` (popover ketuk), TIDAK PERNAH 0.
   ───────────────────────────────────────────────────────────────────────── */

/** Satu tile metrik (strip kepala ala preview) atau sel grid kartu harga. */
export interface SelStrip {
  key: string
  label: string
  /** Teks nilai yang sudah diformat; null / "—" = tak terukur. */
  value: string | null
  /** Rentang / sumber di bawah nilai ("at audit", "on the curve"). */
  note?: string
  why?: string
  title?: string
  tone?: string
  /** U4: label panjang (fakta menit-2 BNB) boleh terlipat dua baris di tile kepala, angka sejajar di dasar baris. */
  lipat?: boolean
  /**
   * U17 (audit 7 Nov): tile kepala yang hanya tampil sampai lebar ini (CSS): di atas 1080 kartu harga berdiri di samping
   * chart, di atas lipatan. Dipasang pada tile harga, dan pada tile Δ utama HANYA bila kartu harga menampilkan Δ yang
   * sama (`harga.utama` ≠ null). Putaran 2: baris timeframe di bawah chart tak dijadikan pengganti, karena pada tinggi
   * layar umum (≤ 800) ia jatuh di bawah lipatan.
   */
  hanyaSampai?: 1080
}

/** Perubahan harga satu rentang (5m/1h/24h, "Since launch"). */
export interface Delta {
  label: string
  value: number | null
  why?: string
}

export interface TautanKepala {
  label: string
  href: string
  jenis: 'explorer' | 'x' | 'web' | 'tg' | 'tx' | 'creator'
}

export interface AnakTangga {
  /** Teks tingkat ("91", "2/4"). */
  label: string
  /** Persen runtuh tingkat ini. */
  rate: number | null
  n?: number
  aktif: boolean
  /** Baris dgn n kecil diredupkan (BNB). */
  sedikit?: boolean
  /** Baris di luar skala skor (BNB Quiet): bar netral --tone-0, tak pernah disorot (DESIGN §2). */
  netral?: boolean
}

export type ModelSkorKartu =
  | {
      kind: 'value'
      value: number
      max: number
      /** "/100" tak ditulis utk SOL di strip? (DESIGN: "/max" hanya bila max ≠ 100 di baris tabel; kartu selalu). */
      measured?: string | null
      /** Persen runtuh skor ini (base rate). null = belum ada baris kalibrasi. */
      rate: number | null
      /** Teks persen (SOL: skala publik apa adanya "13.2%"; BNB: 1 desimal < 10%, bulat di atasnya). */
      rateTeks: string
      /** Kalimat base rate lengkap (kartu). */
      kalimat: ReactNode
      /** Teks pendek label skor (SOL: "Few flags" dari checks). */
      label?: string
    }
  | {
      kind: 'kosong'
      /** "Quiet · not scored", "Scoring at 2m", "Not scored yet". */
      judul: string
      sub: string
    }

/** R2: pita beli/jual kartu harga (preview `cd-mc-bs`). b/s null = tak terukur (bar putus-putus). */
export interface ModelBeliJual {
  judul: string
  b: number | null
  s: number | null
  /** Kalimat di bawah bar. */
  catatan: string
  title?: string
}

export interface ModelSkor {
  skor: ModelSkorKartu
  /** R2: baris "Bonding curve" kartu skor preview (teks + bar; pct null = bar disembunyikan). */
  kurva?: { teks: string; pct: number | null }
  /** Aside judul kartu: "scored at 10m" / "scored at 2m". */
  aside?: string
  /** Chip di samping skor (outcome BNB, Provisional). */
  chips?: ReactNode
  /** Chip utk strip pasar (lebih sempit); absen → `chips`. */
  chipsRingkas?: ReactNode
  /** Kalimat arti skor (BNB: risiko rug, bukan peluang winner). */
  arti?: string
  tangga: AnakTangga[]
  /** Kaki tangga: sumber & n. */
  kakiTangga: ReactNode
  /** Tautan / catatan kaki kartu. */
  kaki?: ReactNode
}

export interface BarisFakta {
  label: string
  value: ReactNode
  tone?: 'up' | 'down' | 'warn' | 'mute' | null
  /** Penjelasan yang bisa diketuk (dulu `title`). */
  info?: string
}

export interface TabModel {
  id: string
  label: string
  /** Hitungan di tab; null = tak diukur ("—"); undefined = tanpa hitungan. */
  n?: number | null
  isi: ReactNode
}

export interface TokenViewModel {
  chain: 'sol' | 'bnb'
  /** Kunci watchlist (mint / alamat kontrak). */
  id: string
  identitas: {
    symbol: string
    name?: string | null
    address: string
    src?: SumberGambar
    badges?: ReactNode
    tags?: ReactNode
  }
  tautan: TautanKepala[]
  /** Teks pendek pengganti tautan (mis. "Sample address, not on BscScan"). */
  tautanCatatan?: string
  kembali: string
  harga: {
    /** null = "—". */
    teks: string | null
    why?: string
    title?: string
    /** Strip timeframe di bawah chart (SOL: Since launch · 5m · 1h · 24h; BNB: 5m · 1h · 24h). Pertama = kepala lengket. */
    deltas: Delta[]
    /** Perubahan di samping harga besar kartu harga ("since launch" / "24h"). */
    utama?: Delta | null
    /** Label pengganti harga (P2 "Post-graduation market not loaded"). */
    label?: { teks: string; why?: string }
  }
  /** R2: strip tile kepala (preview `cd-metrics`). */
  metrik: SelStrip[]
  /** R2: grid 2 kolom kartu harga kanan (preview `cd-mc-grid`). */
  pasar: SelStrip[]
  beliJual?: ModelBeliJual
  skor: ModelSkor
  /** Catatan di bawah kepala (pasar pasca-lulus belum dimuat, harga basi, data contoh). */
  catatan?: ReactNode
  /** A5: polling data halaman gagal → data terakhir tetap tampil + "Couldn't refresh, showing data from N ago".
   *  `sejak` = epoch ms jawaban sukses terakhir. Absen = segar. */
  basi?: { sejak: number | null }
  chart: {
    /** A5: sumber singkat di kepala ChartFrame ("pump.fun curve") + penjelasan lengkap di popover ketuk. */
    sumber?: string
    sumberInfo?: string
    satuan?: string | null
    isi: ReactNode
    catatan?: ReactNode
    /** Sumber 5m/1h/24h di bawah strip timeframe (preview `cd-tf-src`). */
    tfKet?: ReactNode
  }
  tabs: TabModel[]
  trade?: ReactNode
  fakta: { rows: BarisFakta[]; sumber?: ReactNode }
  /** Kartu terakhir kolom kanan: Agent explanation (SOL) / laci kalibrasi (BNB). */
  penutup?: ReactNode
}

/* ── Helper bersama adapter ── */

/**
 * Simbol & nama utk tampilan: buang karakter lebar-nol (ZWSP/ZWJ/ZWNJ/BOM/word joiner) dan ganti spasi tipografis
 * (hair/thin/en/em/ideographic/NBSP) dgn spasi biasa, lalu rapatkan. Data mentah BNB memuatnya (klon simbol yang
 * dibedakan dgn spasi tak terlihat). Kosong setelah dirapikan → null.
 */
export function rapikanTeks(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[   -   　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t || null
}

/** U3: panjang jendela Δ (detik) per label sel timeframe. */
const DETIK_JENDELA: Record<string, number> = { '5m': 300, '1h': 3600, '6h': 21_600, '24h': 86_400 }

/**
 * U3 (audit 7 Nov): jendela Δ yang lebih panjang dari umur pair → sebab "—" berbasis umur; jendela yang muat → null.
 * DexScreener mengisi h1 = h6 = h24 dgn perubahan SEJAK pair dibuat utk pair muda → token 26 menit tampil "+209% 24h".
 * Umur = umur token menurut synt: batas atas umur pair mana pun (pair DEX lahir bersama/sesudah token), jadi aturan ini
 * tak pernah menyembunyikan angka yang sah. Sama utk SOL & BNB. Umur tak diketahui (≤ 0 / tak sah) → null.
 */
export function sebabJendelaMuda(label: string, umurDetik: number | null | undefined): string | null {
  const j = DETIK_JENDELA[label]
  if (j === undefined || umurDetik == null || !Number.isFinite(umurDetik) || umurDetik <= 0 || umurDetik >= j) return null
  return `Pair is ${umur(umurDetik)} old, so there is no full ${label} window yet.`
}

/** Hanya URL http(s) yang boleh jadi tautan (metadata token = teks bebas pembuat token). */
export function urlAman(u: string | null | undefined): string | null {
  if (!u) return null
  const t = u.trim()
  if (!/^https?:\/\//i.test(t)) return null
  try {
    const x = new URL(t)
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.href : null
  } catch {
    return null
  }
}

export function tautanSosial(s: { twitter?: string | null; website?: string | null; telegram?: string | null } | null | undefined): TautanKepala[] {
  if (!s) return []
  const out: TautanKepala[] = []
  const x = urlAman(s.twitter)
  const w = urlAman(s.website)
  const tg = urlAman(s.telegram)
  if (x) out.push({ label: 'X', href: x, jenis: 'x' })
  if (w) out.push({ label: 'Website', href: w, jenis: 'web' })
  if (tg) out.push({ label: 'Telegram', href: tg, jenis: 'tg' })
  return out
}

/**
 * ⛔ Tabel skor publik Solana (synt-dash `skor_audit`, 2026-10-04, n = 12.783, `outcome_publish`) — BEKU, sama persis
 * dgn server. Hanya dipakai menggambar tangga; base rate token itu sendiri tetap dari respons (`collapse_rate_pct`).
 */
export const TANGGA_SOL: ReadonlyArray<{ skor: number; runtuh: number }> = [
  { skor: 91, runtuh: 9.5 },
  { skor: 87, runtuh: 13.2 },
  { skor: 80, runtuh: 20.5 },
  { skor: 75, runtuh: 24.9 },
  { skor: 67, runtuh: 32.7 },
  { skor: 50, runtuh: 49.7 },
]
export const N_TABEL_SOL = '12,783'

/** Persen base rate: satu desimal di bawah 10%, skala publik SOL apa adanya (20.5%). */
export function persenRuntuh(p: number | null | undefined, satuDesimal = false): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—'
  if (satuDesimal || p < 10) return `${p.toFixed(1)}%`
  return `${Math.round(p)}%`
}
