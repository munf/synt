/* ─────────────────────────────────────────────────────────────────────────
   Status engine synt — isi footer.

   ⭐ Alih-alih harga BTC/ETH seperti terminal lain, footer synt menampilkan
   performa MESINNYA SENDIRI. Alasannya bukan sekadar berbeda: harga BTC
   tersedia di mana pun dan tidak memberi tahu apa pun tentang produk ini,
   sedangkan throughput audit adalah bukti bahwa yang dijual synt benar-benar
   bekerja saat ini juga.

   ⚠️ Bentuk tipe ini SENGAJA mencerminkan `/api/overview` di synt-dash
   (sudah hidup di 127.0.0.1:5679). Saat integrasi, cukup ganti sumbernya —
   tak perlu memetakan ulang field.

   Padanan field:
     throughput.processed_per_hour  → processedPerHour
     throughput.scored_per_hour     → scoredPerHour
     throughput.selectivity_pct     → selectivityPct
     error_rate_pct                 → errorRatePct
     cost.rpc_calls_this_hour       → rpcCallsThisHour (U24 putaran 2)
     metadata_coverage_pct          → metadataCoveragePct
     session.discovered             → discovered
     uptime_hours                   → uptimeHours
   ───────────────────────────────────────────────────────────────────────── */

export type ComponentState = 'active' | 'degraded' | 'down'

export interface EngineComponent {
  id: string
  label: string
  state: ComponentState
  /** Catatan pendek: "websocket", "0.5% error", "auto-restart". */
  note: string
}

export interface EngineStatus {
  /** Token terdeteksi per jam — gratis, nol RPC (PRODUK.md §1.2). */
  processedPerHour: number
  /** Token yang dapat penilaian AI per jam — dibatasi kuota. */
  scoredPerHour: number
  /** Persen yang lolos sampai tahap penilaian. */
  selectivityPct: number

  errorRatePct: number
  /** Panggilan RPC jam berjalan (B15: getblock_rpc + shyft_rpc). 0 = belum ada panggilan tercatat → persentase galat
   *  bukan pengukuran. null = field tak dikirim (permintaan publik). */
  rpcCallsThisHour: number | null
  /** Jumlah error absolut satu jam terakhir — konteks bagi persentase. */
  errorsThisHour: number
  metadataCoveragePct: number

  /** Total token terdeteksi sesi ini. */
  discovered: number
  /** Token berlabel outcome sesi ini. */
  labelled: number
  uptimeHours: number

  components: EngineComponent[]
}
