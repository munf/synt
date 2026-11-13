import type { EngineStatus } from './types'

/* ─────────────────────────────────────────────────────────────────────────
   Jembatan `/api/overview` → `EngineStatus`.

   ⭐ Bentuk `EngineStatus` memang dirancang mencerminkan endpoint ini
   (komentar di `types.ts` menyebut padanan field satu per satu), jadi
   pemetaannya nyaris satu lawan satu.
   ───────────────────────────────────────────────────────────────────────── */

/** Bentuk longgar — `/api/overview` dibangun dari `json!()` inline di Rust,
    jadi tak ada skema yang bisa diekspor. */
type Overview = Record<string, unknown>

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export function adaptEngine(o: Overview): EngineStatus {
  const t = obj(o.throughput)
  const s = obj(o.session)

  return {
    processedPerHour: num(t.processed_per_hour),
    scoredPerHour: num(t.scored_per_hour),
    selectivityPct: num(t.selectivity_pct),

    errorRatePct: num(o.error_rate_pct),
    errorsThisHour: num(o.errors_this_hour),
    rpcCallsThisHour: typeof obj(o.cost).rpc_calls_this_hour === 'number' ? num(obj(o.cost).rpc_calls_this_hour) : null,
    metadataCoveragePct: num(o.metadata_coverage_pct),

    discovered: num(s.discovered),
    /* ⚠️ `session.labelled` TAK ADA di `/api/overview` — dipakai
       `accuracy_labelled` (jumlah pair berlabel outcome). Keduanya menghitung
       hal yang sama; namanya saja berbeda karena endpoint itu dibangun untuk
       dashboard, bukan untuk footer ini. */
    labelled: num(o.accuracy_labelled),
    uptimeHours: num(o.uptime_hours),

    /* ⚠️ Status komponen DITURUNKAN dari angka, bukan dari pemeriksaan
       kesehatan sungguhan — `/api/overview` tak menyediakannya.

       ⛔ Karena itu ambangnya sengaja LONGGAR dan hanya menandai keadaan yang
       tak mungkin salah baca: throughput NOL berarti benar-benar berhenti,
       error di atas 5% berarti ada yang rusak. Menandai "degraded" pada
       variasi normal akan membuat penanda ini diabaikan justru saat ia benar. */
    components: [
      {
        id: 'engine',
        label: 'engine',
        state: num(t.processed_per_hour) > 0 ? 'active' : 'down',
        note: 'auto-restart',
      },
      {
        id: 'feed',
        label: 'data feed',
        state: num(s.discovered) > 0 ? 'active' : 'down',
        note: 'websocket',
      },
      {
        id: 'audit',
        label: 'audit',
        state:
          num(o.error_rate_pct) > 5
            ? 'degraded'
            : num(t.selectivity_pct) > 0
              ? 'active'
              : 'down',
        /* U24 putaran 2: 0 panggilan RPC tercatat (mis. awal jam; sebelum B15 selalu 0 krn hanya `shyft_rpc` dijumlah)
           → "0.0% error" bukan pengukuran; tanpa klaim galat. */
        // field `cost` tak dikirim (permintaan publik lewat Caddy membuang field internal) → tanpa klaim apa pun
        note: typeof obj(o.cost).rpc_calls_this_hour !== 'number'
          ? 'error rate not reported'
          : num(obj(o.cost).rpc_calls_this_hour) > 0 ? `${num(o.error_rate_pct).toFixed(1)}% error` : 'no RPC calls recorded',
      },
    ],
  }
}
