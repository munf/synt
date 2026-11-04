import type { SumberGambar } from '@/components/Avatar'
/* Bentuk data panel detail token — frame Figma 3:2 (kolom kiri).

   ⚠️ Dari mockup, bukan dari synt-dash. Beberapa field di sini kemungkinan
   besar TIDAK tersedia di API sekarang (breakdown skor, analisis agent).
   Saat menyambung: jadikan opsional yang belum ada, jangan memalsukan
   nilainya — panel kosong lebih jujur daripada angka karangan. */

/**
 * Dua kelompok faktor di balik skor.
 *
 * ⛔ Menggantikan safety/liquidity/holders/trust — keempatnya nama karangan
 * tanpa padanan di mesin. Dua nama ini mengelompokkan sinyal menurut
 * SUMBERNYA, dan itu pembagian yang benar-benar ada:
 *
 *   flow      — dari aliran transaksi (tekanan jual sells/buys; same-slot
 *               dibuang P1 27 Okt: pengukurnya dicabut 2026-09-02, selalu 0)
 *   developer — dari riwayat & perilaku creator (porsi supply, wallet
 *               bertanda, sebaran kepemilikan)
 *
 * `null` = tak ada komponen terukur → UI menulis "—", bukan bar 0 (P1).
 */
export interface ScoreBreakdown {
  flow: number | null
  developer: number | null
}

/** Satu metrik pada grid 2×2 (Liquidity, Volume, Holders, Buy/Sell). */
export interface TokenMetric {
  label: string
  /** Keterangan rentang/waktu label (mis. "FIRST 6 MIN"), tak pernah dipatah di tengah — label turun baris utuh. */
  note?: string
  value: string
  /** A2: sebab nilai "—" (popover ketuk). */
  why?: string
  /** Perubahan persen; null bila metrik tak punya pembanding. */
  change: number | null
}

export interface AgentAnalysis {
  /** 0–100. Di mockup ditampilkan dengan titik warna, bukan bar. */
  confidence: number
  /** Paragraf ringkas alasan utama. */
  reasoning: string
  warnings: string[]
  verified: string[]
  /** Gate/aturan yang dilewati — ditampilkan sebagai jejak kecil di kaki kartu. */
  gates: string[]
}

export interface TokenDetail {
  mint: string
  symbol: string
  /**
   * URL gambar token. `null` → fallback inisial.
   *
   * ⛔ Field ini sempat TAK ADA sama sekali, sehingga `TokenPanel` memanggil
   * `<Avatar name={t.symbol} />` tanpa `src` — kartu tak pernah bisa
   * menampilkan foto meski tabel di sebelahnya sudah bisa.
   */
  image: SumberGambar
  /** Badge di sebelah simbol, mis. "ALPHA". null bila tak ada. */
  tag: string | null
  /** Baris meta: "raydium @U69Qw_Apg · 1m old". */
  source: string
  handle: string
  age: string
  /** Alamat yang sudah dipersingkat untuk tampilan. */
  addressShort: string

  price: number
  /** Harga kini vs harga pertama mesin ("since launch"); null = tak terukur. */
  priceChange: number | null
  /** ⭐ P2: lulus, harga pasca-lulus belum dimuat synt (labels.ts `pasarPascaLulusBelumDimuat`): persen & MC sudah disembunyikan. */
  marketNotLoaded: boolean
  marketCap: number
  growth: number

  metrics: TokenMetric[]

  /** A2: null = belum/tidak dinilai → "—", bukan 0 (0 terbaca skor terburuk). */
  score: number | null
  /** Label status, mis. "Optimal". Berasal dari server, bukan dihitung di klien. */
  scoreStatus: string
  breakdown: ScoreBreakdown
  momentumIndex: number

  chains: string[]
  analysis: AgentAnalysis

  /**
   * Baris "More Info" — keadaan pair yang TIDAK muncul di tempat lain pada
   * kartu ini. Sebelumnya panel itu mengulang Contract/Source/Age yang sudah
   * tampil di header, sehingga membukanya tak menambah apa pun.
   *
   * ⚠️ `mock: true` menandai baris yang datanya BELUM ada di synt-dash. Ia
   * ditampilkan apa adanya dgn penanda, bukan disembunyikan — menyembunyikan
   * baris membuat pembaca mengira metriknya memang tak diukur.
   */
  facts: TokenFact[]

  /**
   * Jendela penilaian. `null` bila pair belum pernah di-skor.
   *
   * ⭐ Skor synt bergerak antara detik ~60 dan ~500, lalu berhenti. Tanpa
   * jendela ini pembaca tak bisa tahu apakah angka yang dilihatnya sudah
   * final atau masih akan berubah — pertanyaan yang tak dijawab terminal
   * mana pun.
   */
  scoring: ScoringWindow | null
}

export interface ScoringWindow {
  /** Detik ke berapa penilaian pertama mungkin terjadi. */
  firstSec: number
  /** Detik ke berapa penilaian berhenti bergerak. */
  lastSec: number
  /** Umur pair saat skor ini dibuat. */
  scoredAtSec: number
  /** Berapa detik lalu skor itu dibuat. */
  agoSec: number
}

export interface TokenFact {
  label: string
  value: string
  /** Arah nilai: mewarnai teks. `null` = netral. */
  tone: 'up' | 'down' | 'warn' | null
  /** Belum tersedia dari mesin — diberi penanda di UI. */
  mock?: boolean
}
