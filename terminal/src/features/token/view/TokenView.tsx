import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { InfoPopover } from '@/components/Popover'
import { nadaDariBase } from '@/components/ScoreCell'
import { useCopy } from '@/lib/useCopy'
import { useWatchlist } from '@/lib/useWatchlist'
import { alamatPendek } from '@/lib/format'
import { CatatanBasi } from '../chart/ChartRingan'
import { persenRuntuh, type BarisFakta, type Delta, type ModelBeliJual, type ModelSkor, type SelStrip, type TabModel, type TautanKepala, type TokenViewModel } from './model'
import './TokenView.css'

/**
 * ⭐ R2 (DESIGN-TERMINAL §0, pemilik 28 Okt): SATU halaman token utk `/coin/:mint` & `/bnb/:token`, digambar dgn
 * TAMPILAN PREVIEW (master `CoinDetailView` / `CoinDetail.css`), bukan mockup A4.
 *
 * Susunan = preview:
 *   kepala (kartu): avatar · simbol/nama · chip alamat (salin) · bintang · ikon tautan  |  strip tile metrik
 *   kiri : kartu chart (bilah Pro · strip OHLC A5 · kanvas) + strip timeframe + sumber
 *          kartu skor (cincin · base rate · bonding curve · tangga skor terlipat) + tab dlm kartu yang sama
 *   kanan: kartu harga (harga besar + Δ · grid 2 kolom · pita beli/jual) → Trade (SOL) → Agent / kalibrasi → Token facts
 * ≤1080: satu kolom, urutan alami (kiri lalu kanan) seperti preview. ≤760: kepala lengket ponsel (fungsi lab A4).
 *
 * ⛔ Skor tak pernah tampil tanpa base rate (PRODUK.md §0). Angka, `checks` & base rate tak diubah di sini.
 */
export function TokenView({ m }: { m: TokenViewModel }) {
  const kepala = useRef<HTMLElement>(null)
  const [lengket, setLengket] = useState(false)

  useEffect(() => {
    const el = kepala.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // kepala lengket muncul saat kartu kepala (harga & metrik) sudah tergulir di atas topbar
    const io = new IntersectionObserver(
      ([e]) => setLengket(!!e && !e.isIntersecting && e.boundingClientRect.top < 0),
      { rootMargin: '-60px 0px 0px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div className={`cd tv tv-${m.chain}`}>
      <KepalaLengket m={m} tampil={lengket} />
      <header className="cd-head" ref={kepala}>
        <Identitas m={m} />
        <dl className="cd-metrics">
          {m.metrik.map((x) => <Tile key={x.key} x={x} />)}
        </dl>
      </header>
      {m.basi && <CatatanBasi sejak={m.basi.sejak} className="tv-stale" />}
      {m.catatan}

      <div className="cd-body">
        <div className="cd-main">
          <ChartCard m={m} />
          <section className="cd-card">
            <ScoreCard s={m.skor} />
            <Tabs tabs={m.tabs} />
          </section>
        </div>
        <aside className="cd-side">
          <KartuHarga m={m} />
          {m.trade}
          {m.penutup}
          <FactsCard rows={m.fakta.rows} sumber={m.fakta.sumber} />
        </aside>
      </div>
    </div>
  )
}

/* ── Kepala ── */

function Identitas({ m }: { m: TokenViewModel }) {
  const watchlist = useWatchlist()
  const dipantau = watchlist.has(m.id)
  const { copy, copied } = useCopy()
  const id = m.identitas
  return (
    <div className="cd-identity">
      <Avatar name={id.symbol} src={id.src} size={44} />
      <div className="cd-names">
        <h1 className="cd-symbol">{id.symbol}</h1>
        {id.name && <span className="cd-name">{id.name}</span>}
      </div>
      <button type="button" className="cd-addr" onClick={() => copy(id.address, 'addr')} title="Copy contract address">
        {copied === 'addr' ? 'Copied' : alamatPendek(id.address)}
        <CopyIcon />
      </button>
      {(id.badges || id.tags) && <span className="cd-chips">{id.badges}{id.tags}</span>}
      <button
        type="button"
        className={`cd-star ${dipantau ? 'is-on' : ''}`}
        aria-pressed={dipantau}
        aria-label={dipantau ? 'Remove from watchlist' : 'Add to watchlist'}
        onClick={() => watchlist.toggle(m.id)}
      >
        <StarIcon filled={dipantau} />
      </button>
      <Tautan tautan={m.tautan} catatan={m.tautanCatatan} />
    </div>
  )
}

/** Ikon tautan kepala ala preview: web · X · Telegram · explorer. Creator & Launch tx (BNB) ada di Token facts. */
function Tautan({ tautan, catatan }: { tautan: TautanKepala[]; catatan?: string }) {
  const urut: TautanKepala['jenis'][] = ['web', 'x', 'tg', 'explorer']
  const ikon = urut.flatMap((j) => tautan.filter((t) => t.jenis === j))
  if (!ikon.length && !catatan) return null
  return (
    <div className="cd-links">
      {ikon.map((t) => (
        <a key={t.jenis + t.href} href={t.href} target="_blank" rel="noopener noreferrer nofollow" aria-label={t.label} title={t.label}>
          {t.jenis === 'web' ? <GlobeIcon /> : t.jenis === 'x' ? <XIcon /> : t.jenis === 'tg' ? <TelegramIcon /> : <ExternalIcon />}
        </a>
      ))}
      {catatan && <span className="cd-links-note">{catatan}</span>}
    </div>
  )
}

/** Tile metrik kepala (preview `cd-metric`). "—" dgn sebab → popover ketuk. */
function Tile({ x }: { x: SelStrip }) {
  return (
    <div className={`cd-metric${x.lipat ? ' is-lipat' : ''}${x.hanyaSampai ? ` is-sampai-${x.hanyaSampai}` : ''}`}>
      <dt>{x.label}</dt>
      <dd className={x.tone}>
        <Nilai x={x} />
      </dd>
    </div>
  )
}

function Nilai({ x }: { x: SelStrip }) {
  const v = x.value ?? '—'
  if (x.why && v === '—') return <InfoPopover info={x.why} label={x.label}><span className="is-empty">—</span></InfoPopover>
  if (x.title) return <InfoPopover info={x.title} label={x.label}>{v}</InfoPopover>
  return <>{v}</>
}

/** Kepala lengket ponsel (≤760, CSS): muncul setelah kartu kepala tergulir lewat topbar. */
function KepalaLengket({ m, tampil }: { m: TokenViewModel; tampil: boolean }) {
  const k = m.skor.skor
  const d = m.harga.deltas.find((x) => x.value !== null && Number.isFinite(x.value))
  return (
    <div className={`tv-sticky ${tampil ? 'is-on' : ''}`} aria-hidden={!tampil}>
      <Avatar name={m.identitas.symbol} src={m.identitas.src} size="sm" />
      <span className="tv-sticky-sym">{m.identitas.symbol}</span>
      {/* dua baris: harga di atas Δ berlabel (rentang wajib tertulis: SOL pertama = Since launch, BNB = 5m) */}
      <span className="tv-sticky-pd">
        <span className="tv-sticky-price">{m.harga.teks ?? '—'}</span>
        {d && (
          <span className="tv-sticky-delta">
            <span className="tv-delta-k">{d.label}</span> <span className={`tv-dv ${kelasDelta(d.value!)}`}>{teksPersen(d.value!)}</span>
          </span>
        )}
      </span>
      <span className="tv-sticky-score">
        {k.kind === 'value' ? (
          <>
            <span><b className={`tv-tone-${nadaDariBase(k.rate)}`}>{k.value}</b><span className="tv-max">/{k.max}</span></span>
            {k.rate !== null && <span className="tv-sticky-rate">{k.rateTeks} collapsed</span>}
          </>
        ) : (
          <span className="tv-ss-empty">{k.judul}</span>
        )}
      </span>
    </div>
  )
}

/** |Δ| < 0,05% = datar; tanda minus tipografis (DESIGN §2 PriceChange). */
export function kelasDelta(v: number): string {
  return Math.abs(v) < 0.05 ? 'is-flat' : v > 0 ? 'is-up' : 'is-down'
}
export function teksPersen(v: number): string {
  const a = Math.abs(v)
  const s = a >= 1000 ? `${Math.round(a).toLocaleString('en-US')}%` : `${a.toFixed(1)}%`
  return Math.abs(v) < 0.05 ? s : `${v > 0 ? '+' : '−'}${s}`
}

/* ── Chart ── */

/**
 * Kartu chart preview: isi chart (bilah periode → strip OHLC A5 → kanvas) + catatan, lalu strip timeframe di bawah
 * chart (pola GMGN/Axiom/DexScreener) dan sumbernya. Sumber chart (A5) = satu baris kecil dgn popover ketuk.
 */
function ChartCard({ m }: { m: TokenViewModel }) {
  const c = m.chart
  return (
    <section className="cd-card cd-chart tv-chart" aria-label="Price chart">
      <div className="tv-chart-body">{c.isi}</div>
      {c.catatan}
      {m.harga.deltas.length > 0 && (
        <div className="cd-tfstrip" style={{ gridTemplateColumns: `repeat(${m.harga.deltas.length}, 1fr)` }}>
          {m.harga.deltas.map((d) => <TfCell key={d.label} d={d} />)}
        </div>
      )}
      {(c.tfKet || c.sumber) && (
        <p className="cd-tf-src">
          {c.tfKet}
          {c.tfKet && c.sumber ? ' ' : null}
          {c.sumber && (
            <span className="tv-chart-src">
              Chart:{' '}
              {c.sumberInfo ? <InfoPopover info={c.sumberInfo} label="Chart source">{c.sumber}</InfoPopover> : c.sumber}
              {c.satuan ? `, ${c.satuan}` : ''}.
            </span>
          )}
        </p>
      )}
    </section>
  )
}

/** Satu sel strip timeframe. `null` = belum terukur ("—" + sebab lewat popover ketuk), bukan 0%. */
function TfCell({ d }: { d: Delta }) {
  const ada = d.value !== null && Number.isFinite(d.value)
  return (
    <div className="cd-tfcell">
      <span className="cd-tflabel">{d.label}</span>
      <span className={`cd-tfvalue ${ada ? kelasDelta(d.value!) : 'is-empty'}`}>
        {ada ? teksPersen(d.value!) : d.why ? <InfoPopover info={d.why} label={`${d.label} change`}>—</InfoPopover> : '—'}
      </span>
    </div>
  )
}

/**
 * A5: kerangka halaman token saat `/api/token` / `/api/bnb/token` belum menjawab — bentuk kartu preview (kepala + tile,
 * chart, kartu kanan) berisi blok `--raise`, bukan satu teks "Loading…".
 */
export function TokenSkeleton() {
  return (
    <div className="cd tv tv-skel" role="status" aria-label="Loading token">
      <header className="cd-head">
        <div className="cd-identity"><i className="sk sk-av" /><i className="sk sk-l" /></div>
        {/* U17: sel ke-2 & ke-3 = posisi tile harga & Δ utama (tampil sampai 1080 px) */}
        <div className="cd-metrics">{Array.from({ length: 7 }, (_, i) => <i key={i} className={`sk sk-cell${i === 1 || i === 2 ? ' is-sampai-1080' : ''}`} />)}</div>
      </header>
      <div className="cd-body">
        <div className="cd-main">
          <section className="cd-card cd-chart"><i className="sk sk-chart" /></section>
        </div>
        <aside className="cd-side">
          <section className="cd-card tv-skel-card"><i className="sk sk-num" /><i className="sk sk-m" /><i className="sk sk-m" /><i className="sk sk-m" /></section>
          <section className="cd-card tv-skel-card"><i className="sk sk-t" /><i className="sk sk-m" /><i className="sk sk-m" /></section>
        </aside>
      </div>
    </div>
  )
}

/* ── Kartu skor ── */

/**
 * Kartu skor preview: cincin + "Audit score" + status, kotak base rate, baris Bonding curve. Tangga skor (lab A4)
 * terlipat di bawahnya dgn gaya baris yang sama (§0.5). Warna cincin = nada base rate (§6.1-2), angka tetap.
 * ⛔ Base rate WAJIB tampil bersama skor (PRODUK.md §0).
 */
function ScoreCard({ s }: { s: ModelSkor }) {
  const k = s.skor
  const r = 26
  const circ = 2 * Math.PI * r
  const isi = k.kind === 'value' ? (Math.min(k.max, Math.max(0, k.value)) / k.max) * circ : 0
  const nada = k.kind === 'value' ? nadaDariBase(k.rate) : 0
  const aktif = s.tangga.find((t) => t.aktif)
  return (
    <header className="cd-score">
      <div className="cd-score-top">
        <div className={`cd-ring tv-ring-${nada}`}>
          <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
            <circle cx="30" cy="30" r={r} className="cd-ring-track" />
            {isi > 0 && (
              <circle cx="30" cy="30" r={r} className="cd-ring-fill" strokeDasharray={`${isi} ${circ}`} transform="rotate(-90 30 30)" />
            )}
          </svg>
          <span className="cd-ring-value">
            {k.kind === 'value' ? k.value : '—'}
          </span>
        </div>
        <div className="cd-score-id">
          <span className="cd-score-label">
            Audit score{s.aside && <span className="cd-score-aside"> · {s.aside}</span>}
          </span>
          <span className={`cd-score-status ${k.kind === 'value' ? `tv-tone-${nada}` : 'is-empty'}`}>
            {k.kind === 'value' ? (k.label ?? (k.measured ? k.measured : `${k.value} of ${k.max}`)) : k.judul}
          </span>
        </div>
        {s.chips && <span className="cd-score-chips">{s.chips}</span>}
      </div>

      {/* Inilah kalimat yang membedakan audit dari jaminan. */}
      <p className="cd-baserate">{k.kind === 'value' ? k.kalimat : k.sub}</p>
      {s.arti && <p className="cd-score-arti">{s.arti}</p>}

      {s.kurva && (
        <div className="cd-curve">
          <div className="cd-curve-head">
            <span>Bonding curve</span>
            <span>{s.kurva.teks}</span>
          </div>
          {/* bar hanya bila ada angka progres yang berlaku SEKARANG */}
          {s.kurva.pct !== null && (
            <div className="cd-curve-track" role="meter" aria-valuenow={s.kurva.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Bonding curve progress">
              <span className="cd-curve-fill" style={{ width: `${Math.min(100, Math.max(0, s.kurva.pct))}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Tangga skor (A4) terlipat: kepala sebaris "Bonding curve", isi = persen runtuh tiap skor */}
      <details className="cd-ladder">
        <summary className="cd-curve-head">
          <span>Collapse rate at each score</span>
          <span>{aktif ? `${aktif.label}: ${persenRuntuh(aktif.rate, true)}` : s.tangga.length ? `${s.tangga.length} levels` : 'Not available'}</span>
        </summary>
        {s.tangga.length > 0 && (
          <ol className="tv-ladder" aria-label="Collapse rate at each score">
            {s.tangga.map((t) => (
              <li key={t.label} className={`tv-ladder-row ${t.aktif ? 'is-on' : ''} ${t.sedikit ? 'is-few' : ''}`} aria-current={t.aktif ? 'true' : undefined}>
                <span className="tv-ladder-s">{t.label}</span>
                <span className="tv-ladder-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, Math.max(2, (t.rate ?? 0) * 2))}%`, background: `var(--tone-${t.netral ? 0 : nadaDariBase(t.rate)})` }} />
                </span>
                <span className="tv-ladder-r">{persenRuntuh(t.rate, true)}</span>
                {t.n !== undefined && <span className="tv-ladder-n">n {t.n.toLocaleString('en-US')}</span>}
              </li>
            ))}
          </ol>
        )}
        <p className="cd-ladder-note">{s.kakiTangga}</p>
      </details>
      {s.kaki}
    </header>
  )
}

/* ── Tab ── */

function Tabs({ tabs }: { tabs: TabModel[] }) {
  const [aktif, setAktif] = useState(tabs[0]?.id ?? '')
  const t = tabs.find((x) => x.id === aktif) ?? tabs[0]
  if (!t) return null
  return (
    <>
      <div className="cd-tabs" role="tablist" aria-label="Token detail">
        {tabs.map((x) => (
          <button
            key={x.id}
            id={`tv-tab-${x.id}`}
            type="button"
            role="tab"
            aria-selected={x.id === t.id}
            aria-controls={`tv-panel-${x.id}`}
            className={x.id === t.id ? 'is-active' : ''}
            onClick={() => setAktif(x.id)}
          >
            {x.label}
            {x.n !== undefined && x.n !== null && <span className="cd-tab-n">{x.n}</span>}
          </button>
        ))}
      </div>
      <div className="tv-tab-panel" role="tabpanel" id={`tv-panel-${t.id}`} aria-labelledby={`tv-tab-${t.id}`}>
        {t.isi}
      </div>
    </>
  )
}

/* ── Kartu harga (kanan atas) ── */

/**
 * Metrik dasar — kartu teratas sidebar (preview `MetricsCard`): harga besar + Δ, grid 2 kolom, pita beli/jual.
 * Urutan sidebar = keputusan pemilik: angka dulu, alat transaksi kemudian.
 * ⭐ U17 (audit 7 Nov): grid hanya memuat yang TAK ada di strip kepala (SOL: Curve; BNB: Age, Curve, Tax). MC,
 * likuiditas, holders, Top 10, Net flow, Buyers tinggal di kepala (satu tempat, terlihat di semua lebar).
 */
function KartuHarga({ m }: { m: TokenViewModel }) {
  const h = m.harga
  const u = h.utama
  return (
    <section className="cd-card">
      <div className="cd-mc-price">
        <span className="cd-mc-value">
          {h.teks === null
            ? (h.why ? <InfoPopover info={h.why} label="Price">—</InfoPopover> : '—')
            : h.title
              // A5: info harga (mis. "Price as of 3h ago") lewat popover ketuk, bukan `title`
              ? <InfoPopover info={h.title} label="Price">{h.teks}</InfoPopover>
              : h.teks}
        </span>
        {h.label && (
          <span className="cd-mc-nomarket">
            {h.label.why ? <InfoPopover info={h.label.why} label="Market">{h.label.teks}</InfoPopover> : h.label.teks}
          </span>
        )}
        {u && u.value !== null && Number.isFinite(u.value) && (
          <span className={`cd-mc-delta ${kelasDelta(u.value)}`}>{teksPersen(u.value)} {u.label}</span>
        )}
      </div>
      {m.pasar.length > 0 && <div className="cd-mc-grid">
        {m.pasar.map((x) => (
          <div key={x.key} className="cd-stat">
            <span className="cd-stat-label">{x.label}</span>
            <span className={`cd-stat-value ${x.tone ?? ''}`}><Nilai x={x} /></span>
            {x.note && <span className="cd-stat-note">{x.note}</span>}
          </div>
        ))}
      </div>}
      {m.beliJual && <BeliJual bj={m.beliJual} />}
    </section>
  )
}

/** Pita beli/jual (preview `cd-mc-bs`). Tak terukur → bar putus-putus, bukan 50/50 yang terbaca sbg data. */
function BeliJual({ bj }: { bj: ModelBeliJual }) {
  const { b, s } = bj
  const total = (b ?? 0) + (s ?? 0)
  const pb = total > 0 ? Math.round(((b ?? 0) / total) * 100) : 0
  return (
    <div className="cd-mc-bs">
      <div className="cd-mc-bs-head">
        <span className="cd-dim">{bj.title ? <InfoPopover info={bj.title} label={bj.judul}>{bj.judul}</InfoPopover> : bj.judul}</span>
        <span className="cd-mc-bs-n">{b === null || s === null ? '—' : `${b} / ${s}`}</span>
      </div>
      {total > 0 ? (
        <div className="cd-mc-bs-bar" role="img" aria-label={`${pb}% buys, ${100 - pb}% sells`}>
          <span className="is-buy" style={{ width: `${pb}%` }} />
          <span className="is-sell" style={{ width: `${100 - pb}%` }} />
        </div>
      ) : (
        <div className="cd-mc-bs-bar is-empty">
          <span style={{ width: '100%' }} />
        </div>
      )}
      <p className="cd-mc-bs-note">{bj.catatan}</p>
    </div>
  )
}

/* ── Fakta ── */

export function FactsCard({ rows, sumber, solo = false }: { rows: BarisFakta[]; sumber?: React.ReactNode; solo?: boolean }) {
  return (
    <section className={`cd-card cd-facts ${solo ? 'cd-facts-solo' : ''}`} aria-labelledby="tv-facts-h">
      <h2 id="tv-facts-h" className="cd-card-title">Token facts</h2>
      <dl className="cd-facts-list">
        {rows.map((r) => (
          <div key={r.label} className="cd-fact">
            <dt>{r.label}</dt>
            <dd className={r.tone ? `is-${r.tone}` : undefined}>
              {r.info ? <InfoPopover info={r.info} label={r.label}>{r.value}</InfoPopover> : r.value}
            </dd>
          </div>
        ))}
      </dl>
      {sumber && <p className="cd-facts-src">{sumber}</p>}
    </section>
  )
}

/* ── Potongan bersama utk adapter ── */

/** Daftar faktor skor preview (ikon ✓/⚠ + bobot). SOL: badge risiko; BNB: `signals`. `bad: null` = tak terukur. */
export function DaftarFaktor({ items, kosong }: {
  items: { id: string; judul: string; detail: string; bad: boolean | null; bobot?: number }[]
  kosong?: string
}) {
  if (!items.length) return <p className="tv-empty">{kosong ?? 'No factors were returned with this score.'}</p>
  return (
    <ul className="cd-factors">
      {items.map((f) => (
        <li key={f.id} className={f.bad === true ? 'is-fail' : f.bad === false ? 'is-pass' : 'is-unmeasured'}>
          <span className="cd-factor-icon" aria-hidden="true">{f.bad === true ? <AlertIcon /> : f.bad === false ? <CheckIcon /> : <DotIcon />}</span>
          <span className="sr-only">{f.bad === true ? 'Against:' : f.bad === false ? 'In favour:' : 'Not measured:'}</span>
          <span className="cd-factor-body">
            <span className="cd-factor-head">
              <span className="cd-factor-label">{f.judul}</span>
              {f.bobot !== undefined && (
                <span className={`cd-factor-weight ${f.bobot >= 0 ? 'is-up' : 'is-down'}`}>
                  {f.bobot >= 0 ? '+' : ''}{f.bobot}
                </span>
              )}
            </span>
            <span className="cd-factor-detail">{f.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Tab tanpa data: judul + sebab (bukan tabel kosong yang terbaca "tak ada aktivitas"). */
export function TabKosong({ judul, isi, aksi }: { judul: string; isi: string; aksi?: React.ReactNode }) {
  return (
    <div className="cd-notyet">
      <p className="cd-notyet-title">{judul}</p>
      <p className="cd-notyet-body">{isi}</p>
      {aksi}
    </div>
  )
}

/**
 * Keadaan "belum terukur" preview utk tab yang datanya belum ada: judul + isi + JUDUL KOLOM yang akan dipakai
 * (baris "—"), bukan sekadar "no data".
 */
export function BelumAda({ judul, isi, kolom, aksi }: { judul: string; isi: string; kolom: string[]; aksi?: React.ReactNode }) {
  return (
    <div className="cd-notyet">
      <p className="cd-notyet-title">{judul}</p>
      <p className="cd-notyet-body">{isi}</p>
      {aksi}
      <div className="cd-notyet-head">{kolom.map((h) => <span key={h}>{h}</span>)}</div>
      <div className="cd-notyet-rows">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cd-notyet-row">{kolom.map((h) => <span key={h}>—</span>)}</div>
        ))}
      </div>
    </div>
  )
}

/* ── Ikon (preview) ── */

export function CopyIcon() {
  return (
    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 8h12M8 1.8c1.6 1.8 2.4 3.9 2.4 6.2S9.6 12.4 8 14.2C6.4 12.4 5.6 10.3 5.6 8s.8-4.4 2.4-6.2Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M9.5 7 14.3 1.5h-1.6L8.8 6 5.7 1.5H1.5l5 7.2-5 5.8h1.6l4.2-4.9 3.3 4.9h4.2L9.5 7Zm-1.5 1.7-.5-.7-4-5.7h1.9l3.2 4.6.5.7 4.1 5.9h-1.9L8 8.7Z" fill="currentColor" />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M14 2.5 1.8 7.2c-.6.2-.6 1 0 1.2l3 1 1.2 3.6c.2.5.8.6 1.1.2l1.7-1.8 3 2.2c.4.3 1 .1 1.1-.4L14.9 3.4c.1-.6-.4-1.1-.9-.9Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="m4.8 9.4 6.4-4.2-4.6 5.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="M9 2.5h4.5V7M13 3 7.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 9.8v2.7a1.5 1.5 0 0 1-1.5 1.5H3.5A1.5 1.5 0 0 1 2 12.5V5a1.5 1.5 0 0 1 1.5-1.5h2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <path d="m3 7.2 2.6 2.6L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M7 1.8 13 12H1L7 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 5.8v2.6M7 10.2v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DotIcon() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function WarnIcon() {
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden="true">
      <path d="M7 1.8 13 12H1L7 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 5.8v2.6M7 10.2v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
