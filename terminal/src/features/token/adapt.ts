import { gambarToken } from '@/components/Avatar'
import { alamatPendek, uang, umur, usd } from '@/lib/format'
import type { TokenDetail as ApiToken } from '@/api/types'
import type { TokenDetail, TokenMetric, TokenFact } from './types'
import { JUDUL_PASAR_BELUM, launchpadTampil, likuiditasUsd, menitJendela, mesinSegar, pasarPascaLulusBelumDimuat, teksTop10 } from './labels'

/* ─────────────────────────────────────────────────────────────────────────
   Jembatan API → bentuk `TokenDetail` yang dipakai `TokenPanel`.

   ⛔ BENTUK PANEL TIDAK DISENTUH. Keputusan pemilik proyek 2026-08-28:
   *"anda hanya boleh mengganti isi teks bukan bentuk"*.

   Upaya sebelumnya menulis komponen kartu baru — dan itu salah: ia membuang
   tombol Buy, ikon aksi, badge chain, ring skor, dan pemisahan kartu yang
   sudah dirancang. Berkas ini hanya MENGISI struktur yang ada.

   ⚠️ Empat field di `TokenDetail` tak punya padanan di mesin, dan komentar
   pada `types.ts` sudah memperingatkannya sejak awal: *"jangan memalsukan
   nilainya — panel kosong lebih jujur daripada angka karangan."*
   ───────────────────────────────────────────────────────────────────────── */

/** Harga SOL perkiraan — hanya untuk mengubah mcap SOL → USD di tampilan. */
/** Kurs cadangan, HANYA dipakai bila API tak mengirim `sol_usd`.
 *
 * ⛔ Nilai ini dulu dikode keras sebagai satu-satunya sumber, dan terukur
 * 2026-09-24 kurs nyata **$115,05** — jadi seluruh nilai USD di kartu
 * terlalu tinggi **65%** sekaligus: likuiditas, market cap, volume.
 *
 * ⚠️ Angka yang salah secara konsisten lebih berbahaya daripada angka yang
 * hilang: ia terlihat wajar dan tak ada yang memeriksanya. Kurs sekarang
 * datang dari respons API; konstanta ini hanya jaring pengaman. */
const SOL_USD_CADANGAN = 190
let SOL_USD = SOL_USD_CADANGAN

/** Dipanggil adapter saat respons API memuat `sol_usd`. */
export function setSolUsd(v: number | null | undefined) {
  if (typeof v === 'number' && v > 1 && v < 10_000) SOL_USD = v
}

/* ⭐ Base rate per skor (2026-10-04, n=12.783, `outcome_publish`) DIPINDAH ke
   server — synt-dash `skor_audit` — supaya skor 0-100 dan "% collapsed" di
   sebelahnya selalu berasal dari tabel yang sama. */

function angka(v: number | null, satuan = '', desimal = 1): string {
  // ⛔ `null` → "—", BUKAN 0. Terukur 28% pair tak punya `holders` dan 26%
  // tak punya `gini`; menampilkan 0 mengubah "belum diukur" jadi klaim.
  if (v === null) return '—'
  return `${v.toFixed(desimal)}${satuan}`
}

export function adaptToken(a: ApiToken): TokenDetail {
  // ⭐ 1d: label & nilai-kosong disamakan dgn halaman token (helper bersama di labels.ts)
  const liq = likuiditasUsd(a.liquidity_sol, SOL_USD)
  const menit = menitJendela(a.window_secs ?? 600)
  // ⭐ P2: lulus, harga pasca-lulus belum dimuat synt → MC & persen = angka kelulusan beku → "—" / disembunyikan + label
  const beku = pasarPascaLulusBelumDimuat(a)

  /* ── Empat metrik grid 2×2 ────────────────────────────────────────────
     Dua dipertahankan, dua diganti karena datanya tak ada:

     | mockup | isi nyata | alasan |
     |---|---|---|
     | LIQUIDITY | ✅ `real_sol` | ada |
     | VOLUME 24h | ⛔ NET FLOW | `v10_flow` berhenti di detik-600 |
     | HOLDERS 6.5K | ⛔ TRADERS/HOLDERS | 6.5K mock; nyata 2-300 |
     | BUY/SELL | ✅ | ada | */
  const metrics: TokenMetric[] = [
    {
      // Dolar, bukan SOL — pembaca membandingkan likuiditas dgn market cap
      // yang juga dolar, dan mencampur dua satuan memaksa konversi di kepala.
      label: 'Liquidity',
      // ⛔ 1d: null/0 = bukan data → "—" (dulu "$0"); putaran 2: kurva terkuras > 0 & < $1 → "<$1"
      value: uang(liq),
      why: beku ? JUDUL_PASAR_BELUM : 'The engine did not report liquidity for this pair.',
      change: null,
    },
    {
      /* ⚠️ "Net flow" DIGANTI market cap — keputusan pemilik proyek: istilah
         itu tak familiar bagi mayoritas trader.

         Market cap sebelumnya hanya ada di baris kecil bawah harga, yang
         ikut dihapus karena kurang terlihat. Di grid ini ia terbaca sejajar
         dgn likuiditas — dua angka yang memang dibandingkan bersama.

         ⬜ `net_sol_window` tetap dipakai di halaman detail, tempat ruangnya
         cukup untuk menjelaskan artinya. */
      label: 'Market cap',
      // ⛔ 1d: tanpa mcap → "—", bukan "$0" (sama dgn halaman token)
      value: !beku && (a.mcap_sol ?? 0) > 0 ? usd((a.mcap_sol as number) * SOL_USD) : '—',
      why: beku ? JUDUL_PASAR_BELUM : 'The engine has no market cap for this pair yet.',
      change: null,
    },
    {
      // ⭐ Trader dilepas 2026-10-10: sumbernya (`v10_tx_keluar`) berhenti
      // diisi sejak 2026-09-01, jadi selalu "—". Holder = jumlah GMGN saat
      // audit — dilabeli supaya tak terbaca sbg angka live.
      label: 'Holders',
      note: '(at audit)',
      // 0 = GMGN tak mencatat → "—" (halaman token sama)
      value: a.holders ? String(a.holders) : '—',
      why: 'No holder count was recorded when this pair was audited.',
      change: null,
    },
    {
      // ⭐ 1d: buys/sells `v10_flow` hanya jendela ukur 0-`window_secs` (synt-dash api.rs), bukan hitungan hidup
      // sisa kecil review: dulu patah "BUY/SELL, FIRST 6" / "MIN" di ≤390 → keterangan jadi satu kesatuan
      label: 'Curve buys / sells,',
      note: `first ${menit} min`,
      value: a.buys !== null ? `${a.buys} / ${a.sells ?? 0}` : '—',
      why: `Buys and sells were not measured in the first ${menit} min for this pair.`,
      change: null,
    },
  ]

  /* ── Empat sub-skor ───────────────────────────────────────────────────
     ⛔ SAFETY/LIQUIDITY/HOLDERS/TRUST tak punya padanan — mesin punya SATU
     skor. Rinciannya ada di `skor2_rincian`, tapi isinya nama sinyal internal
     (`entrapment`, `rat_trader`, `creator_pabrik`) yang sengaja ditahan dari
     jalur publik.

     ⭐ Slot bar-nya DIPERTAHANKAN (bentuk tak disentuh) dan diisi sinyal
     risiko NYATA yang cakupannya hampir 100%. Nilainya dibalik jadi
     "makin tinggi makin baik" agar arah bar konsisten dgn skor di atasnya. */
  const balik = (v: number | null, maks: number) =>
    v === null ? 0 : Math.round(Math.max(0, Math.min(100, 100 - (v / maks) * 100)))

  /* Dua kelompok, dibagi menurut SUMBER sinyalnya.

     ⚠️ Rata-rata sederhana dari komponen yang tersedia — BUKAN pembobotan
     mesin. synt-dash tak memaparkan bobot per-komponen (`reasons` ditahan
     dari jalur publik), jadi angka ini adalah ringkasan tampilan. Bobot
     sebenarnya menyusul saat pemilik proyek menetapkannya.

     ⛔ Komponen `null` DILEWATI, bukan dihitung nol: pair yang belum diukur
     akan tertekan ke bawah dan terbaca sbg berisiko.

     ⭐ P1 (27 Okt): tanpa komponen terukur sama sekali → `null` (UI menulis "—" + bar kosong berlabel
     "Not measured"), BUKAN 0. Dulu 0 = bar kosong yang terbaca "paling berisiko" padahal artinya "tak ada data". */
  const rata = (xs: Array<number | null>): number | null => {
    const ada = xs.filter((x): x is number => x !== null)
    return ada.length ? Math.round(ada.reduce((s, x) => s + x, 0) / ada.length) : null
  }

  const breakdown = {
    /* FLOW — dari aliran transaksi: kini HANYA tekanan jual (sells/buys, jendela ukur `v10_flow`).
       Tekanan jual: winner 0,70 · dead 2,09 (plafon 2).

       ⛔ P1 (dicabut 27 Okt, izin pemilik): komponen `same_slot_tx` (dulu plafon 30) DIBUANG. Pengukurnya
       (tahap-2 `v10_tx_awal`) dicabut 2026-09-02, sejak itu nilainya SELALU 0 → komponennya selalu 100 dan
       mendongkrak bar FLOW (mis. tekanan jual 0 → FLOW 50, bukan 0). Sama dgn "Same-slot tx"/"Slot 0" yang
       sudah disembunyikan 22 Okt. Ini ringkasan TAMPILAN, bukan bobot mesin: skor audit & base rate tak berubah.
       Hidupkan lagi bila mesin kembali mengisinya.
       buys 0/null → tak ada rasio → `null` ("Not measured"), bukan 0. */
    flow: rata([
      a.buys ? balik(Math.min(2, (a.sells ?? 0) / a.buys) * 50, 100) : null,
    ]),

    /* DEVELOPER — dari riwayat & perilaku creator.
       dev_pct: porsi supply yang ditahan tim.
       blacklist_hits: rata terukur rug 7,33 · winner 2,46 (plafon 20).
       gini: sebaran kepemilikan, 0-1 dinormalkan ke 0-100. */
    developer: rata([
      a.risk.dev_pct !== null ? balik(a.risk.dev_pct, 30) : null,
      a.risk.blacklist_hits !== null ? balik(a.risk.blacklist_hits, 20) : null,
      a.risk.gini !== null ? balik(a.risk.gini * 100, 100) : null,
    ]),
  }

  return {
    mint: a.mint,
    symbol: a.symbol,
    image: gambarToken(a),
    // ⛔ Tier tak lagi ditampilkan (keputusan pemilik proyek). Base rate yang
    //    dulu dibawanya kini melekat pada skor itu sendiri, jadi tak ada
    //    informasi yang hilang. Slot `tag` dibiarkan untuk badge lain nanti.
    tag: null,
    // ⛔ 1d: dulu default 'pump.fun' utk semua mint; kini aturan yang sama dgn halaman token
    source: launchpadTampil(a) ?? 'Not reported',
    // ⚠️ MINT, bukan handle sosial: handle sering kosong dan TIDAK unik —
    // terukur ada empat token bernama "inno" dalam satu jam.
    handle: alamatPendek(a.mint),
    // A2: satu format umur (DESIGN §4.2), tanpa "old"; panel menulis "Age 13m"
    age: umur(a.age_secs),
    addressShort: alamatPendek(a.mint),

    price: a.price_usd ?? 0,
    // ⭐ 1d: `change_pct` = harga kini vs harga pertama mesin → UI menulis "since launch"; null → tak ditampilkan
    priceChange: beku ? null : a.change_pct ?? null,
    marketNotLoaded: beku,
    marketCap: (a.mcap_sol ?? 0) * SOL_USD,
    growth: a.change_pct ?? 0,

    metrics,

    // A2 (nit Reviewer P1): tanpa skor → null ("—"), bukan 0
    score: a.score ?? null,
    /* ⛔ "Status: Optimal" adalah label tanpa definisi terukur. Diganti BASE
       RATE, yang WAJIB menempel pada skor (PRODUK.md §0): tanpa penyebutnya,
       angka itu terbaca sebagai jaminan — padahal tier 1 pun 10,1% rug. */
    // ⭐ Dari server (synt-dash `skor_audit`) — sumber yang sama dgn skornya.
    scoreStatus:
      a.collapse_rate_pct != null && a.rose3x_rate_pct != null
        ? `${a.rose3x_rate_pct}% rose 3× · ${a.collapse_rate_pct}% collapsed`
        : 'not scored yet',
    breakdown,
    /* ⭐ Slot MOMENTUM diisi RASIO HARGA terhadap sampel pertama, dinormalkan
       0-100 (2× harga awal = 100). Terukur monoton sempurna:
       winner **60** · survive 32 · dead 23 · rug **12**.

       ⛔ Mockup memakai angka karangan (96/100). Slotnya dipertahankan —
       bentuk tak disentuh — tapi diisi sesuatu yang benar-benar diukur. */
    momentumIndex:
      a.change_pct !== null
        ? Math.round(Math.max(0, Math.min(100, (1 + a.change_pct / 100) * 50)))
        : 0,

    chains: ['SOLANA', a.complete ? 'AMM' : 'BONDING'],

    analysis: {
      /* ⛔ DIKOSONGKAN (0 = tak ditampilkan).
         Tak ada angka keyakinan di sistem. Kelengkapan sinyal sempat dipakai
         sbg pengganti, tapi terukur ia **hampir selalu 83-100%** — mayoritas
         pair punya 10-12 dari 12 komponen. Angka yang praktis konstan tak
         menyampaikan apa pun; ia hanya menempati ruang dan membuat pembaca
         mengira ada informasi di sana. */
      confidence: 0,
      // ⭐ Penjelasan AI — sudah lewat kamus penerjemah, cakupan 100%.
      reasoning: a.explanation ?? 'No explanation written yet.',
      warnings: [],
      verified: [],
      /* ⚠️ KAPAN skor dibuat. Terukur skor rata berumur 200 menit (terlama
         360) — angka polos menyiratkan penilaian saat ini, padahal synt
         menilai pada SATU titik waktu lalu berhenti di menit-10. */
      gates:
        a.scored_at_age_secs !== null && a.scored_ago_secs !== null
          ? [`Scored at ${umur(a.scored_at_age_secs)} into its life, ${umur(a.scored_ago_secs)} ago`]
          : [],
    },

    facts: faktaDari(a),

    /* ⭐ Jendela penilaian. Batas 60-500 detik adalah rentang tempat skor
       synt bergerak; setelah itu ia berhenti. `scored_at_age_secs` dijepit
       ke rentang itu supaya titiknya tak pernah keluar dari garis. */
    scoring:
      a.scored_at_age_secs !== null && a.scored_ago_secs !== null
        ? {
            firstSec: 60,
            lastSec: 500,
            scoredAtSec: Math.max(60, Math.min(500, a.scored_at_age_secs)),
            agoSec: a.scored_ago_secs,
          }
        : null,
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Baris "More Info".

   ⛔ Yang DULU ada di sana — Contract, Source, Age — ketiganya sudah tampil
   di header kartu, sehingga membuka panel tak menambah apa pun. Diganti
   keadaan yang benar-benar mengubah risiko dan tak terlihat di tempat lain.

   ⚠️ `mint_authority` & `freeze_authority` BELUM ada di synt-dash — sudah
   diperiksa pada `TokenRisk`, yang tersedia hanya top10/dev/same-slot/
   diversity/blacklist/gini. Keduanya ditandai mock, bukan dikarang diam-diam.
   ───────────────────────────────────────────────────────────────────────── */
function faktaDari(a: ApiToken): TokenFact[] {
  const f: TokenFact[] = []
  const persen = (v: number) => `${v.toFixed(1)}%`

  if (a.risk.dev_pct !== null) {
    f.push({
      label: 'Dev holding',
      value: persen(a.risk.dev_pct),
      // Terukur: dev_pct tinggi menyertai rug jauh lebih sering.
      tone: a.risk.dev_pct >= 10 ? 'down' : a.risk.dev_pct >= 5 ? 'warn' : 'up',
    })
  }

  if (a.risk.top10_pct !== null) {
    f.push({
      // 1d: diukur sekali saat audit, label sama dgn halaman token
      label: 'Top 10 hold (at audit)',
      value: teksTop10(a.risk.top10_pct),
      /* ⛔ TIDAK diberi warna bahaya. Terukur top10 TINGGI justru lebih
         sering pada winner (29,18 vs rug) — mewarnainya merah akan
         mengajarkan pembaca hal yang terbalik. */
      tone: null,
    })
  }

  if (a.risk.blacklist_hits !== null) {
    f.push({
      label: 'Flagged wallets',
      value: String(a.risk.blacklist_hits),
      tone: a.risk.blacklist_hits > 0 ? 'down' : 'up',
    })
  }

  /* ⛔ 1d: "Same-slot tx" DISEMBUNYIKAN, sama dgn halaman token (2026-10-22): `same_slot_tx` selalu 0 sejak
     pengukurnya dicabut 2026-09-02, jadi "0" hijau adalah artefak ketiadaan data. Hidupkan lagi bila mesin mengisinya. */

  /* ⭐ 1d: kurva dari MESIN saja (panel tak bertanya RugCheck) → berlabel "(engine)" seperti cadangan mesin di halaman
     token; progres yang beku di akhir jendela ukur ditulis "at N min", bukan sbg progres sekarang. */
  if (a.complete === true) {
    f.push({ label: 'Curve progress', value: 'Graduated (engine)', tone: null })
  } else if (a.graduation_pct !== null && (a.graduation_pct > 0 || (a.mcap_sol ?? 0) > 0)) {
    const w = a.window_secs ?? 600
    f.push({
      label: 'Curve progress',
      value: mesinSegar(a.age_secs, w)
        ? `${persen(a.graduation_pct)} (engine)`
        : `${persen(a.graduation_pct)} at ${menitJendela(w)} min (engine)`,
      tone: null,
    })
  }

  /* ⛔ 1d: LP burned & Dex paid DIHAPUS dari panel. Dulu nilai CONTOH ("Not yet" kuning, "Unpaid" merah, bertanda
     mock) yang terukur bertentangan dgn nilai NYATA halaman token (panel "Unpaid", halaman "Paid"). Panel TIDAK
     bertanya sendiri (tiap klik baris = 1 permintaan RugCheck, batas 15); tautan "Open full audit →" di bawah grid
     ini sudah menuju halaman tempat keduanya tampil nyata (keputusan orkestrator, putaran 2). */

  return f
}

export { angka }
