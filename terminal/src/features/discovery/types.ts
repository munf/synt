import type { SumberGambar } from '@/components/Avatar'
/* Bentuk data Discovery.

   Discovery adalah RINGKASAN seluruh synt, dengan bobot di sisi sosial.
   Pemisahan kontennya tegas dan disengaja:

     discovery   ringkasan + sosial   ← file ini
     trenches    audit token mendetail
     leaderboard peringkat

   ⚠️ Jangan menduplikasi isi Trenches di sini. Kartu koin di Discovery
   sengaja ringkas (simbol · skor · MC) — begitu ia mulai menampilkan
   likuiditas, holders, atau riwayat skor, ia mengambil alih pekerjaan
   Trenches dan pemisahan di atas runtuh. */

export interface Creator {
  /** Dipakai juga sebagai segmen URL /profile/:handle — jaga tetap slug. */
  id: string
  name: string
  avatar: string | null

  handle?: string
  bio?: string
  followers?: number
  /** Creator terverifikasi — PRODUK.md §1.1: hanya mereka yang boleh posting. */
  verified?: boolean
  /** Jumlah token yang pernah diterbitkan creator ini. */
  tokensLaunched?: number
}

/** Kategori feed. Menentukan sumber konten, bukan sekadar urutan. */
export type FeedTab = 'recent' | 'following' | 'agent'

export interface FeedPost {
  id: string
  author: Creator
  /** Sudah relatif ("few minutes ago") — pemformatan waktu di sisi server. */
  timeAgo: string
  /** null untuk post yang hanya berisi gambar atau hanya tombol beli. */
  body: string | null
  image: string | null
  /** Teks alt gambar (kartu media agent: dibangkitkan dari bukti). */
  imageAlt?: string | null
  likes: number
  comments: number
  /** Mint token yang dibahas; null bila post tidak menyebut token. */
  mint: string | null
  /** Simbol token, untuk ditampilkan pada kartu token di dalam post. */
  symbol?: string | null
  /** Skor audit token yang dibahas — inilah yang membuat post punya bobot. */
  score?: number | null
  /** true = ditulis agent synt, bukan manusia. */
  fromAgent?: boolean

  /* ── ⭐ KONTRAK POST AGENT (2026-10-20) ─────────────────────────────────
     Field di bawah diisi agent Redaksi (rancangan "Kantor Agent synt") dan
     terbit HANYA lewat tombol Publish di Approvals — tak ada agent yang
     menerbitkan sendiri. Aturan yang ditegakkan bentuk data ini:
       • setiap angka di `body` WAJIB punya baris `evidence` (BRAND.md §3:
         klaim tanpa angka tak ditulis)
       • skor token selalu dgn base rate-nya (PRODUK.md §0) → `tokens`
       • tautan publik = `permalink` (synt.fun/p/<id>, kartu OG bergambar) */

  /** Jenis post — menentukan label kecil di atas judul. */
  kind?: AgentPostKind
  /** ISO-8601 waktu terbit. Bila ada, waktu relatif dihitung klien dari sini. */
  publishedAt?: string
  /** Judul pendek (≤ 80 karakter). Opsional; body tetap wajib untuk agent. */
  title?: string | null
  /** Angka yang dipakai `body`, masing-masing dgn asalnya. */
  evidence?: Evidence[]
  /** Token yang dibahas — pengganti `mint/symbol/score` tunggal, boleh >1. */
  tokens?: TokenRef[]
  /** Sumber luar (berita, status penyedia). Sumber internal masuk `evidence`. */
  sources?: SourceLink[]
  /** true = contoh, BELUM pernah disetujui lewat Approvals. Ditandai SAMPLE di UI.
      Di backend jadi status 'sample' (/api/posts default hanya 'published'). */
  sample?: boolean
  /** Tautan publik post ini, mis. https://synt.fun/p/<id>. */
  permalink?: string | null
  /** published · corrected · retracted — koreksi & penarikan TETAP tampil dgn alasannya. */
  status?: 'published' | 'corrected' | 'retracted'
  corrections?: { at: string; jenis: 'corrected' | 'retracted'; alasan: string }[]
}

export type AgentPostKind = 'data' | 'token' | 'update' | 'insight'

/** Satu angka + asalnya. Ditampilkan sebagai kartu data di dalam post. */
export interface Evidence {
  /** Label pendek, mis. "Fully audited". */
  label: string
  /** Sudah diformat untuk tampil, mis. "356" atau "9.5%". */
  value: string
  /** Keterangan satu baris, mis. "of 10,121 pairs seen". */
  note?: string
  /** Asal angka dalam bahasa pembaca, mis. "synt engine, last 10 h". */
  source: string
  /** ISO-8601 — angka ini benar per kapan. */
  asOf: string
}

/** Token yang dibahas post, dgn skor DAN base rate-nya. */
export interface TokenRef {
  mint: string
  symbol: string
  avatar?: string | null
  score: number
  /** Base rate pada skor ini — wajib bila `score` ada (PRODUK.md §0). */
  collapseRatePct: number | null
  rose3xRatePct: number | null
}

export interface SourceLink {
  title: string
  url: string
}

export interface Comment {
  id: string
  author: Creator
  timeAgo: string
  body: string
  likes: number
  /** Balasan bersarang satu tingkat. Lebih dalam sulit dibaca di kolom sempit. */
  replies?: Comment[]
}

/**
 * Baris koin ringkas untuk kolom kanan Discovery.
 *
 * ⭐ `score` wajib ada. Tanpa skor, kartu ini identik dengan daftar token
 * mana pun dan synt kehilangan pembedanya — setiap token yang muncul di
 * sini SUDAH teraudit, dan itu yang harus terlihat.
 */
export interface CoinBrief {
  mint: string
  symbol: string
  avatar: SumberGambar
  score: number
  /** USD; null = mesin tak mengirim mcap/kurs → "—" (bukan $0). */
  marketCap: number | null
  /** Umur pair, mis. "12m" — hanya untuk daftar "newly audited". */
  age?: string
  /** ⭐ Base rate skor ini (PRODUK.md §0: skor TAK PERNAH tampil tanpanya).
      Kartu tetap ringkas — angkanya di tooltip pil skor, bukan kolom baru. */
  collapseRatePct?: number | null
  rose3xRatePct?: number | null
}

/** Satu titik pada grafik performa wallet 7 hari. */
export interface WalletPoint {
  /** Label hari, mis. "Mon". */
  day: string
  /** Nilai portofolio hari itu dalam USD. */
  value: number
}

/**
 * Ringkasan performa wallet 7 hari.
 *
 * Ini BUKAN PnL per-trade — yang itu butuh riwayat transaksi penuh dan
 * belum bisa dihitung (PRODUK.md §3, cakupan 11%). Yang ditampilkan di
 * sini adalah nilai portofolio harian, yang bisa dihitung dari saldo saja.
 * Saat tak ada aktivitas, grafiknya datar — dan itu representasi jujur.
 */
export interface WalletSummary {
  connected: boolean
  totalUsd: number
  /** Perubahan 7 hari dalam persen. 0 = datar. */
  change7d: number
  points: WalletPoint[]
  /** Aset teratas yang dipegang. */
  holdings: { symbol: string; valueUsd: number; score?: number }[]
}

/** Baris ringkas leaderboard untuk kolom kanan. */
export interface LeaderBrief {
  id: string
  rank: number
  name: string
  avatar: string | null
  /** Metrik yang ditampilkan — label ikut nilai supaya kartu tetap jujur
      saat metriknya berganti (followers sekarang, PnL nanti). */
  metricLabel: string
  metricValue: string
}
