import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { setSolUsd as setSolUsdTrench, adaptTrench } from '@/features/trenches/adapt'
import { SideRail } from '@/components/SideRail'
import { Drawer } from '@/components/Drawer'
import { QuickBuyPanel } from '@/features/trenches/QuickBuyPanel'
import { WalletPanel } from '@/features/trenches/WalletPanel'
import { SearchPanel } from '@/features/trenches/SearchPanel'
import { ViewBar } from '@/features/trenches/ViewBar'
import { TrackerDrawer, PortfolioDrawer } from '@/features/wallet/panels'
import { VIEWS, type TrenchView } from '@/features/trenches/stages'
import { api } from '@/api/client'
import type { TrenchesResponse, TrenchItem } from '@/api/types'
import { usePolling } from '@/lib/usePolling'
import { useStickyState } from '@/lib/useStickyState'
import { TEMPLATE } from '@/lib/template'
import { ChainSwitch, type Chain } from '@/features/trenches/ChainSwitch'
import { PairTable, kunciKepala, type TableMode } from '@/features/trenches/PairTable'
import { PairPanel, PairPanelSkeleton } from '@/features/trenches/PairPanel'
import { PairSheet } from '@/features/trenches/PairSheet'
import { adaptBnb, adaptSol, type BnbItemK, type PairModel, type SolDetail } from '@/features/trenches/pairModel'
import { useBnbCalibration, useBnbTrenches, type BnbView } from '@/features/bnb/useBnb'
import { hariKalibrasi } from '@/features/bnb/bnbFormat'
import { CalibrationCard, SampleNote, SampleTag } from '@/features/bnb/BnbParts'
import { umur } from '@/lib/format'
import { PairToolbar } from '@/features/trenches/PairToolbar'
import { adaptToken, setSolUsd as setSolUsdToken } from '@/features/token/adapt'
import type { TokenDetail } from '@/features/token/types'
import type { TokenDetail as ApiToken } from '@/api/types'
import {
  bacaFilter,
  bacaSort,
  filterChain,
  sortKeys as kunciSort,
  terapFilter,
  tulisSort,
  urutkan,
  FILTERS,
  type FilterId,
  type Sort,
  type SortKey,
} from '@/features/trenches/pairSort'
import './Trenches.css'

/** Butir 14: tampilan BNB = new & graduated. Definisi & ikon dipinjam dari tampilan Solana. */
const VIEWS_BNB = VIEWS.filter((v) => v.id === 'new' || v.id === 'graduated').map((v) =>
  v.id === 'new'
    // 14b: bnb.rs `new` = token ≤6 jam yang punya pembeli luar di menit-2 atau belum dinilai → yang sepi tak masuk
    ? { ...v, hint: 'Newest Flap and four.meme launches. Launches with no outside buyers by minute 2 are left out.' }
    : { ...v, hint: 'Left the bonding curve for a DEX pair' },
)

/** Panel samping yang sedang terbuka; null = tidak ada. */
type Drawer = 'search' | 'quickbuy' | 'wallet' | 'tracker' | 'portfolio' | 'calibration' | null

const VIEW_SOL = new Set<TrenchView>(['new', 'trending', 'bonding', 'graduated'])

/** matchMedia sebagai state (mode tata letak Trenches). */
function useMedia(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(q)
    if (!mq) return
    const f = () => setM(mq.matches)
    f()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [q])
  return m
}

/**
 * Trenches — terminal utama (PRODUK.md §1.2).
 *
 * ⭐ A3 (28 Okt, DESIGN-TERMINAL §3.1): satu tampilan utk kedua chain. Tabel = `PairTable`, panel = `PairPanel`,
 * keduanya membaca `PairModel` dari adapter (`adaptSol` / `adaptBnb`). Chain & tampilan di URL
 * (`/trenches?chain=bnb&view=graduated`), nilai tersimpan hanya bawaan saat URL tak menyebutnya.
 *
 * Tata letak (R1, 28 Okt = preview, DESIGN-TERMINAL §0):
 *   > 1100px  rail · panel kiri 384 · tabel (kartu bergulir sendiri). Baris pertama terpilih.
 *   561-1100  bar tampilan di atas · panel lebar penuh DI ATAS tabel (seperti preview) · halaman menggulir.
 *   ≤ 560     bar tampilan · tabel preview · panel = bottom sheet saat baris diketuk (fungsi lab, §0.2).
 *
 * ⭐ Feed SOL: `view` = parameter permintaan (bukan saringan klien), cache per tampilan + prefetch 30 dtk.
 * Saringan teks tabel di klien (hasil yang sudah tampil); pencarian seluruh populasi = drawer SearchPanel (B1).
 */
export function TrenchesRoute() {
  const [panelOpen, setPanelOpen] = useStickyState('synt.trenches.panel', true)
  const [viewSimpan, setViewSimpan] = useStickyState<TrenchView>('synt.trenches.view', 'new')
  const [chainSimpan, setChainSimpan] = useStickyState<Chain>('synt.trenches.chain', 'sol')
  const [bnbViewSimpan, setBnbViewSimpan] = useStickyState<BnbView>('synt.trenches.bnbView', 'new')
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const tutupDrawer = useCallback(() => setDrawer(null), [])

  const phone = useMedia('(max-width: 560px)')
  // R1: batas tumpuk = preview (≤1100: panel di atas tabel, lebar penuh)
  const narrow = useMedia('(max-width: 1100px)')
  const mode: TableMode = phone ? 'phone' : narrow ? 'mid' : 'wide'

  /* ── chain & tampilan dari URL ── */
  // ⚠️ U21: skrip <head> index.html menebak chain & view dgn aturan YANG SAMA (URL → nilai tersimpan → bawaan) utk preload
  // feed; ubah aturan di sini → selaraskan di sana, kalau tidak feed diunduh dua kali.
  const [params, setParams] = useSearchParams()
  const pChain = params.get('chain')
  const chain: Chain = pChain === 'bnb' || pChain === 'sol' ? pChain : chainSimpan === 'bnb' ? 'bnb' : 'sol'
  const pView = params.get('view') as TrenchView | null
  const view: TrenchView =
    chain === 'bnb'
      ? pView === 'graduated' || pView === 'new' ? pView : bnbViewSimpan === 'graduated' ? 'graduated' : 'new'
      : pView && VIEW_SOL.has(pView) ? pView : VIEW_SOL.has(viewSimpan) ? viewSimpan : 'new'
  const bnbView: BnbView = view === 'graduated' ? 'graduated' : 'new'

  // URL selalu memuat chain & view (bisa di-bookmark; footer & pemberitahuan membacanya); nilai tersimpan ikut
  useEffect(() => {
    if (params.get('chain') !== chain || params.get('view') !== view) {
      const p = new URLSearchParams(params)
      p.set('chain', chain)
      p.set('view', view)
      setParams(p, { replace: true })
    }
    setChainSimpan(chain)
    if (chain === 'bnb') setBnbViewSimpan(bnbView)
    else setViewSimpan(view)
  }, [chain, view, bnbView, params, setParams, setChainSimpan, setBnbViewSimpan, setViewSimpan])

  // back/forward bisa mengganti chain/tampilan lewat URL → laci/sheet milik tampilan lama ditutup
  useEffect(() => {
    setSheetOpen(false)
  }, [chain, view])

  const pilihChain = (c: Chain) => {
    if (c === chain) return
    const p = new URLSearchParams(params)
    p.set('chain', c)
    p.set('view', c === 'bnb' ? bnbViewSimpan : viewSimpan)
    // A6: filter khusus chain lama (mis. Tax ≤ 5%) tak dibawa; sortir dibaca ulang per tampilan (kunci tak sah = bawaan)
    const sisa = bacaFilter(params.get('filter'), c)
    if (sisa.length) p.set('filter', sisa.join(','))
    else p.delete('filter')
    // push (bukan replace): tombol back menelusuri chain/tampilan sebelumnya
    setParams(p)
    setSelected(null)
    setSheetOpen(false)
  }
  const pilihView = (v: TrenchView) => {
    const p = new URLSearchParams(params)
    p.set('chain', chain)
    p.set('view', chain === 'bnb' ? (v === 'graduated' ? 'graduated' : 'new') : v)
    if (p.toString() !== params.toString()) setParams(p)
    setSheetOpen(false)
  }

  /* ── A6: sortir & filter chip dari URL (`&sort=score-desc&filter=scored,tax5`) ── */
  const keys = kunciSort(chain, view)
  const sort = bacaSort(params.get('sort'), keys)
  const filters = bacaFilter(params.get('filter'), chain)
  // push (bukan replace), sama dgn pilihan chain/tampilan: back mengembalikan sortir/filter sebelumnya
  const aturSort = (s: Sort) => {
    const p = new URLSearchParams(params)
    const t = tulisSort(s)
    if (t) p.set('sort', t)
    else p.delete('sort')
    if (p.toString() !== params.toString()) setParams(p)
  }
  const aturFilter = (ids: FilterId[]) => {
    const p = new URLSearchParams(params)
    const urut = FILTERS.filter((f) => ids.includes(f.id)).map((f) => f.id)
    if (urut.length) p.set('filter', urut.join(','))
    else p.delete('filter')
    if (p.toString() !== params.toString()) setParams(p)
  }
  const toggleFilter = (id: FilterId) => aturFilter(filters.includes(id) ? filters.filter((x) => x !== id) : [...filters, id])

  // Pencarian dari topbar mendarat di sini lewat ?q=
  const urlQuery = params.get('q') ?? ''
  useEffect(() => {
    if (urlQuery) setQuery(urlQuery)
  }, [urlQuery])
  // ⭐ B1: kiriman dari kotak search topbar membuka drawer search (state dihapus setelah dipakai, lihat 6g)
  const location = useLocation()
  const navigate = useNavigate()
  const dariTopbar = (location.state as { cari?: boolean } | null)?.cari === true
  useEffect(() => {
    if (!dariTopbar) return
    // butir 14: search topbar = pencarian Solana → kembali ke chain SOL supaya drawer & tabel selaras
    const p = new URLSearchParams(location.search)
    p.set('chain', 'sol')
    p.set('view', viewSimpan)
    setDrawer('search')
    navigate({ pathname: location.pathname, search: `?${p.toString()}` }, { replace: true, state: null })
  }, [dariTopbar, location.key, location.pathname, location.search, navigate, viewSimpan])

  /* ── feed SOL (null saat BNB: tanpa jaringan) — ⭐ interval 5 dtk, `view` = kunci polling ── */
  const solView = chain === 'sol' ? view : 'new'
  const poll = usePolling(
    async (signal) => (chain === 'sol' ? { view: solView, res: await api.trenches(solView, 50, signal) } : null),
    5_000,
    `${solView}|${chain}`,
  )
  const [cache, setCache] = useState<Partial<Record<TrenchView, TrenchesResponse>>>({})
  useEffect(() => {
    if (poll.data) setCache((c) => ({ ...c, [poll.data!.view]: poll.data!.res }))
  }, [poll.data])
  /* ⭐ U5 (audit 7 Nov): loop 30 dtk hanya memuat tampilan LAIN (tampilan aktif sudah dipoll 5 dtk oleh `poll` di
     atas; dulu ikut dimuat lagi → 24 permintaan `/api/trenches`/menit) dan BERHENTI saat tab tersembunyi (dulu jalan
     terus, 8/menit selamanya). Tab tampil lagi → tampilan lain langsung dimuat ulang (tampilan aktif oleh `usePolling`),
     lalu loop 30 dtk menyala lagi. Tampilan aktif dibaca dari ref supaya ganti tampilan tak memicu muat ulang. */
  const viewAktif = useRef(solView)
  viewAktif.current = solView
  useEffect(() => {
    if (chain !== 'sol') return
    const ctl = new AbortController()
    let t: ReturnType<typeof setInterval> | undefined
    const muat = () =>
      VIEWS.forEach((v) => {
        if (v.id === viewAktif.current) return
        api.trenches(v.id, 50, ctl.signal)
          .then((res) => setCache((c) => ({ ...c, [v.id]: res })))
          .catch(() => {})
      })
    const nyala = () => {
      clearInterval(t)
      muat()
      t = setInterval(muat, 30_000)
    }
    const onVisible = () => {
      if (document.hidden) clearInterval(t)
      else nyala()
    }
    if (!document.hidden) nyala()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      ctl.abort()
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [chain])

  const solData = poll.data?.view === solView ? poll.data.res : (cache[solView] ?? null)
  const cocok = useCallback(
    (sym: string, addr: string, extra = '') => {
      const q = query.trim().toLowerCase()
      return !q || sym.toLowerCase().includes(q) || addr.toLowerCase().includes(q) || extra.toLowerCase().includes(q)
    },
    [query],
  )
  /* ⭐ Kurs dari server sebelum adaptasi (konstanta 190 di klien terukur 65% terlalu tinggi) */
  const solRows = useMemo(() => {
    setSolUsdTrench(solData?.sol_usd)
    return (solData?.items ?? []).map((it, i) => ({ it, row: adaptTrench(it, i + 1) }))
  }, [solData])
  const solTampil = useMemo(
    () => solRows.filter(({ row }) => cocok(row.symbol, row.mint, row.handle ?? '')),
    [solRows, cocok],
  )
  // U15: model tabel dibuat sekali per data/saringan (dulu tiap render rute → semua baris dianggap baru)
  const solModel = useMemo(() => solTampil.map(({ it, row }) => adaptSol(it, null, row)), [solTampil])

  const bnb = chain === 'bnb'
  const pilihBaris = (id: string) => {
    setSelected(id)
    if (mode === 'phone') setSheetOpen(true)
  }
  const common = {
    chain, view, mode, panelOpen, selected, sheetOpen, onSelect: pilihBaris, onCloseSheet: () => setSheetOpen(false), query,
    sort, sortKeys: keys, onSort: aturSort, filters, onToggleFilter: toggleFilter, onClearFilters: () => aturFilter([]),
  }

  const chainSw = <ChainSwitch chain={chain} onChange={pilihChain} caption={mode === 'wide'} />

  return (
    <div className={`tr tr-${mode} ${panelOpen ? 'is-open' : 'is-closed'}`}>
      <SideRail
        view={view}
        onViewChange={pilihView}
        views={bnb ? VIEWS_BNB : VIEWS}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
        onSearch={bnb ? undefined : () => setDrawer('search')}
        onQuickBuy={() => setDrawer('quickbuy')}
        onWallet={() => setDrawer('wallet')}
        onTracker={() => setDrawer('tracker')}
        onPortfolio={() => setDrawer('portfolio')}
      />

      <div className="tr-col">
        {/* ≤1100px: rail disembunyikan → bar ini memegang chain, tampilan & search (butir 2m) */}
        <ViewBar
          view={view}
          onViewChange={pilihView}
          views={bnb ? VIEWS_BNB : VIEWS}
          query={bnb ? '' : query}
          onSearch={bnb ? undefined : () => setDrawer('search')}
          chain={<ChainSwitch chain={chain} onChange={pilihChain} />}
        />

        {bnb ? (
          <BnbBody {...common} view={bnbView} chainBar={chainSw} cocok={cocok} onCalibration={() => setDrawer('calibration')} />
        ) : (
          <Body
            {...common}
            chainBar={chainSw}
            rows={solModel}
            total={solRows.length}
            state={solData ? 'ok' : poll.error ? 'error' : 'loading'}
            emptyText={query.trim() ? <>No tokens matching <strong>{query}</strong> in this view.</> : <>No tokens in this view yet.</>}
            foot={solData ? solFoot(view, solRows.length) : null}
            renderPanel={(m, ringkas) => {
              const it = solTampil.find((x) => x.it.mint === m.id)
              return it ? <SolPanel it={it.it} row={it.row} ringkas={ringkas} /> : <PairPanel m={m} ringkasTabel={ringkas} />
            }}
          />
        )}
      </div>

      <Drawer open={drawer === 'search'} title="Search tokens" onClose={tutupDrawer}>
        <SearchPanel
          query={query}
          onQueryChange={(q) => {
            setQuery(q)
            // Jaga URL tetap mencerminkan pencarian aktif (chain & view ikut).
            const p = new URLSearchParams(params)
            if (q) p.set('q', q)
            else p.delete('q')
            setParams(p, { replace: true })
          }}
          results={solTampil.map((x) => x.row)}
          viewLabel={view === 'new' ? 'New pairs' : VIEWS.find((v) => v.id === view)?.label ?? ''}
          onPick={(mint) => {
            setSelected(mint)
            setDrawer(null)
            if (mode === 'phone') setSheetOpen(true)
          }}
        />
      </Drawer>

      <Drawer open={drawer === 'calibration'} title="How BNB scores are calibrated" onClose={tutupDrawer}>
        <BnbCalibrationDrawer />
      </Drawer>

      <Drawer open={drawer === 'quickbuy'} title="Quick buy settings" onClose={tutupDrawer}>
        <QuickBuyPanel />
      </Drawer>

      <Drawer open={drawer === 'wallet'} title="Wallet" onClose={tutupDrawer}>
        <WalletPanel />
      </Drawer>

      <Drawer open={drawer === 'tracker'} title="Wallet tracker" onClose={tutupDrawer}>
        <TrackerDrawer onClose={tutupDrawer} />
      </Drawer>

      <Drawer open={drawer === 'portfolio'} title="Portfolio" onClose={tutupDrawer}>
        <PortfolioDrawer onClose={tutupDrawer} />
      </Drawer>
    </div>
  )
}

/** "Scored only and Tax ≤ 5%" (keadaan kosong karena filter). */
function daftarFilter(ids: FilterId[]): string {
  const l = FILTERS.filter((f) => ids.includes(f.id)).map((f) => f.label)
  return l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`
}

/** Kepadatan di bawah tabel SOL: jendela & syarat tiap tampilan (synt-dash api.rs `trenches_where`/`_jendela`).
 *  ⭐ U13 (audit 7 Nov): hitungan = pair BERSKOR. Feed SOL hanya memuat pair yang lewat gate-2 (`v10_rpc.skor2` ada,
 *  CTE `kandidat` di api.rs; vonis runtuh ∧ skor sehat ≤ 3 dibuang), jadi "N pairs detected" di samping footer
 *  "DETECTED 604/h" (semua deteksi) terbaca seolah hanya N pair terdeteksi. Kata "scored" = slot SCORED di footer;
 *  "detected in the last …" tetap = jendela waktu (`detected_at`). Kata sama di keempat tampilan. */
function solFoot(view: TrenchView, n: number): string {
  const p = `${n} scored ${n === 1 ? 'pair' : 'pairs'}`
  switch (view) {
    case 'trending':
      return `${p} trading above 1.5× their first price, detected in the last 12 hours, most recently traded first`
    case 'bonding':
      return `${p} under 30% of the bonding curve, detected in the last 6 hours`
    case 'graduated':
      return `${p} that left the bonding curve, detected in the last 24 hours`
    default:
      return `${p} detected in the last 40 minutes`
  }
}

type BodyCommon = {
  chain: Chain
  view: TrenchView
  mode: TableMode
  panelOpen: boolean
  selected: string | null
  sheetOpen: boolean
  onSelect: (id: string) => void
  onCloseSheet: () => void
  chainBar: React.ReactNode
  query: string
  sort: Sort
  sortKeys: ReturnType<typeof kunciSort>
  onSort: (s: Sort) => void
  filters: FilterId[]
  onToggleFilter: (id: FilterId) => void
  onClearFilters: () => void
}

/**
 * Isi Trenches yang SAMA utk kedua chain: panel kiri (wide) / laci / sheet + tabel + kepadatan & sumber.
 * Tiga keadaan kosong tetap terbedakan: memuat (skeleton), gagal menghubungi mesin, benar-benar kosong.
 */
function Body({
  chain, view, mode, panelOpen, selected, sheetOpen, onSelect, onCloseSheet, chainBar,
  rows: rowsQ, total, state, emptyText, foot, source, renderPanel, banner, provisional, missingText,
  query, sort, sortKeys, onSort, filters, onToggleFilter, onClearFilters,
}: BodyCommon & {
  /** Baris tampilan ini SETELAH saringan teks `?q=` (sebelum chip & sortir). */
  rows: PairModel[]
  /** Jumlah pair tampilan ini sebelum saringan apa pun. */
  total: number
  state: 'loading' | 'error' | 'missing' | 'ok'
  emptyText: React.ReactNode
  foot: string | null
  source?: string
  /** `ringkas` = tabel dlm mode sempit (U26b putaran 2). */
  renderPanel: (m: PairModel, ringkas: boolean) => React.ReactNode
  banner?: React.ReactNode
  provisional?: string | null
  missingText?: React.ReactNode
}) {
  const wide = mode === 'wide'
  /* R1 (Reviewer B4): Sort ringkas di bar bila ada kunci sortir tanpa kepala kolom terlihat (Age selalu; Liq/Buyers
     saat panel terbuka) atau sortir aktif kolomnya tersembunyi → tak ada fungsi A6 yang hilang. Ponsel: selalu. */
  // Panel terbuka: tabel bisa membuang kolom lagi agar muat → pakai laporan tabel bila utk chain·tampilan·panel ini
  const kunciTabel = `${chain}:${view}:${panelOpen}`
  const [dariTabel, setDariTabel] = useState<{ k: string; keys: SortKey[] } | null>(null)
  const onTerlihat = useCallback((keys: SortKey[]) => setDariTabel({ k: kunciTabel, keys }), [kunciTabel])
  const terlihat = dariTabel?.k === kunciTabel ? dariTabel.keys : kunciKepala(chain, view, panelOpen)
  /* ⭐ U26b putaran 2: tabel sempit (ponsel / kartu < 700 px) tak punya chevron detail → panel & sheet menampilkan isinya
     (lintasan skor + sparkline, disclaimer audit). Hanya mode sempit; panel di layar lebar tak berubah. */
  const [sempitTabel, setSempitTabel] = useState<{ k: string; v: boolean } | null>(null)
  const onSempit = useCallback((v: boolean) => setSempitTabel({ k: kunciTabel, v }), [kunciTabel])
  const ringkas = sempitTabel?.k === kunciTabel && sempitTabel.v
  const sortTersembunyi =
    mode === 'phone' || sortKeys.some((k) => !terlihat.includes(k)) || (!!sort && !terlihat.includes(sort.key))
  // R1: panel sebaris (lebar) / di atas tabel (≤1100, preview); ponsel = bottom sheet saat baris diketuk
  const inline = mode !== 'phone'
  /* A6: chip filter lalu sortir. Feed hidup diurutkan ulang di setiap polling (memo atas baris baru). */
  const rows = useMemo(() => urutkan(terapFilter(rowsQ, filters), sort), [rowsQ, filters, sort])
  // "Tax ≤ 5%": pair yang lolos saringan lain tapi pajaknya tak terukur → disebut, bukan diam-diam hilang
  const unknownTax = useMemo(
    () => (filters.includes('tax5') ? terapFilter(rowsQ, filters.filter((f) => f !== 'tax5')).filter((m) => m.taxBps == null).length : 0),
    [rowsQ, filters],
  )
  /* Layar lebar: tanpa pilihan eksplisit panel memakai baris pertama. Setelah itu pilihan otomatis DIPEGANG selama
     barisnya masih ada → sortir ulang tiap polling tak mengganti isi panel diam-diam. */
  const otomatis = useRef<string | null>(null)
  let activeId = selected
  if (inline) {
    activeId = rows.some((r) => r.id === selected)
      ? selected
      : otomatis.current && rows.some((r) => r.id === otomatis.current) ? otomatis.current : (rows[0]?.id ?? null)
    otomatis.current = activeId
  }
  // Laci/sheet: baris yang dipilih bisa keluar dari feed saat terbuka → model terakhir tetap ditampilkan
  const terakhir = useRef<PairModel | null>(null)
  const active = rows.find((r) => r.id === activeId) ?? (!inline && sheetOpen && terakhir.current?.id === selected ? terakhir.current : null)
  if (active) terakhir.current = active

  const isi =
    state === 'loading' ? (
      // U21: `onTerlihat` juga saat memuat → cadangan toolbar tahu apakah Sort ringkas akan tampil (tinggi bar sama)
      <PairTable rows={[]} chain={chain} view={view} compact={panelOpen} selectedId={null} onSelect={onSelect} loading provisional={provisional} onTerlihat={onTerlihat} onSempit={onSempit} />
    ) : state === 'error' ? (
      <p className="tr-empty">Cannot reach the engine. Retrying automatically.</p>
    ) : state === 'missing' ? (
      <div className="tr-empty" role="status">{missingText}</div>
    ) : rowsQ.length === 0 ? (
      <p className="tr-empty">{emptyText}</p>
    ) : rows.length === 0 ? (
      // A6: semua tersaring chip → katakan apa yang menyaring & berapa yang tersembunyi, beri jalan keluar
      <div className="tr-empty" role="status">
        <p className="tr-empty-t">
          No pairs in this view match {daftarFilter(filters)}
          {query.trim() ? <> and the search <strong>{query.trim()}</strong></> : null}. {rowsQ.length} hidden by filters.
        </p>
        <button type="button" className="ptb-clear" onClick={onClearFilters}>Clear filters</button>
      </div>
    ) : (
      <PairTable
        rows={rows}
        chain={chain}
        view={view}
        compact={panelOpen}
        selectedId={activeId}
        onSelect={onSelect}
        provisional={provisional}
        sort={sort}
        sortKeys={sortKeys}
        onSort={onSort}
        onTerlihat={onTerlihat}
        onSempit={onSempit}
      />
    )

  return (
    <div className="tr-body">
      {inline && panelOpen && (
        <aside className="tr-panel" id="token-panel" aria-label="Token details">
          {active ? renderPanel(active, ringkas) : state === 'loading' ? <PairPanelSkeleton /> : (
            <p className="tr-empty">Select a token</p>
          )}
        </aside>
      )}

      <div className="tr-main">
        {/* U21 (kerangka statis index.html / styles/kerangka.css meniru tinggi ini & PairPanelSkeleton):
            ≤1100 bar ini baru muncul bersama data (toolbar) → selama memuat dicadangkan setinggi toolbar, supaya
            tabel skeleton yang sudah terlihat tak turun saat data tiba (dulu +40 px di ponsel) */}
        {!wide && state === 'loading' && (
          // tanpa chip filter & tanpa Sort ringkas (SOL, panel tertutup) toolbar hanya teks jumlah → bar lebih pendek
          <div className={`tr-bar tr-bar-skel is-${chain}${filterChain(chain).length === 0 && !sortTersembunyi ? ' is-ringkas' : ''}`} aria-hidden="true">
            <i className="sk" />
          </div>
        )}
        {(wide || (state === 'ok' && total > 0)) && <div className="tr-bar">
          {wide && <div className="tr-chainbar">{chainBar}</div>}
          {state === 'ok' && total > 0 && (
            <PairToolbar
              total={total}
              shown={rows.length}
              filters={filterChain(chain)}
              active={filters}
              onToggle={onToggleFilter}
              query={query}
              unknownTax={unknownTax}
              sort={sort}
              sortKeys={sortKeys}
              onSort={onSort}
              showSort={sortTersembunyi}
            />
          )}
        </div>}
        {banner}
        {isi}
        {foot && (
          <div className="tr-foot">
            <span>{foot}</span>
            <span>{source ?? `Source: synt engine (${chain === 'sol' ? 'Solana, pump.fun' : 'BNB Chain, Flap and four.meme'}), refreshed every 5 seconds`}</span>
          </div>
        )}
      </div>

      {!inline && (
        <PairSheet open={sheetOpen && !!active} label={active ? `${active.symbol} details` : 'Token details'} onClose={onCloseSheet}>
          {active && renderPanel(active, ringkas)}
        </PairSheet>
      )}
    </div>
  )
}

/**
 * Panel SOL: model baris (angka sama dgn tabel) + `/api/token` utk waktu skor & jendela ukur ("scored at 7m",
 * "first 10 min"). ⛔ Respons wajib milik mint yang diminta (respons lama bisa tiba setelah berpindah baris).
 */
function SolPanel({ it, row, ringkas }: { it: TrenchItem; row: ReturnType<typeof adaptTrench>; ringkas: boolean }) {
  const { data } = usePolling(
    (signal) => api.token(it.mint, signal),
    15_000,
    it.mint,
  )
  const [detail, setDetail] = useState<SolDetail | null>(null)
  const [tampil, setTampil] = useState<TokenDetail | null>(null)
  useEffect(() => {
    if (data && data.mint === it.mint) {
      setDetail(data)
      // R1: bar FLOW/DEVELOPER & fakta More Info = adaptToken preview (kurs dari server sebelum adaptasi)
      // ⚠️ `sol_usd` dikirim synt-dash tapi belum ada di tipe `TokenDetail` api/types.ts (milik bersama) → dibaca
      // lewat satu pelebaran tipe; tanpa nilai sah `setSolUsd` mempertahankan kurs sebelumnya (perilaku preview).
      setSolUsdToken((data as ApiToken & { sol_usd?: number | null }).sol_usd)
      setTampil(adaptToken(data))
    }
  }, [data, it.mint])
  return <PairPanel m={adaptSol(it, detail, row)} detail={tampil && tampil.mint === it.mint ? tampil : null} ringkasTabel={ringkas} />
}

/* ── BNB ── */

function BnbBody(props: BodyCommon & { view: BnbView; cocok: (s: string, a: string, n?: string) => boolean; onCalibration: () => void; query: string }) {
  const { view, cocok, onCalibration, query } = props
  const feed = useBnbTrenches(view)
  const calS = useBnbCalibration()
  const cal = calS.kind === 'live' || calS.kind === 'contoh' ? calS.data : null
  const contoh = feed.kind === 'contoh'
  const items = feed.kind === 'live' || feed.kind === 'contoh' ? (feed.data.items as BnbItemK[]) : []
  const rows = useMemo(
    () => items.map((it) => adaptBnb(it, cal)).filter((m) => cocok(m.symbol, m.address, m.name ?? '')),
    [items, cal, cocok],
  )
  const hari = cal ? hariKalibrasi(cal) : null
  const provisional = cal?.provisional
    ? `BNB calibration is provisional${hari ? `: ${hari} ${hari === 1 ? 'day' : 'days'} of data` : ''}, ${cal.base.n.toLocaleString('en-US')} scored tokens. Score colours use the same base rate bands as Solana.`
    : null
  const computed = feed.kind === 'live' ? Date.parse(feed.data.computed_at) : NaN
  const n = items.length
  const foot =
    feed.kind === 'live' || feed.kind === 'contoh'
      ? view === 'new'
        ? `${n} ${n === 1 ? 'launch' : 'launches'} from the last 6 hours, newest first. Launches with no outside buyer by minute 2 are left out.`
        : `${n} graduated ${n === 1 ? 'pair' : 'pairs'}, most recent graduation first. Scored at minute 2, outcome after a 90 minute window.`
      : null

  return (
    <Body
      {...props}
      view={view}
      rows={rows}
      total={items.length}
      state={feed.kind === 'loading' ? 'loading' : feed.kind === 'error' ? 'error' : feed.kind === 'missing' ? 'missing' : 'ok'}
      missingText={<><strong>BNB data is not available yet.</strong> BNB pairs will appear here once the BNB feed is connected.</>}
      emptyText={query.trim() ? <>No BNB pairs matching <strong>{query}</strong> in this view.</> : <>No {view === 'new' ? 'new' : 'graduated'} BNB pairs yet.</>}
      foot={foot}
      source={
        Number.isFinite(computed)
          ? `Source: synt engine (BNB Chain, Flap and four.meme), computed ${umur(Math.max(0, (Date.now() - computed) / 1000))} ago`
          : undefined
      }
      provisional={provisional}
      banner={
        <>
          {TEMPLATE && contoh && <SampleNote />}
          {feed.kind === 'live' && feed.stale && (
            <p className="tr-stale" role="status">Not updating, showing the last result. Retrying automatically.</p>
          )}
        </>
      }
      renderPanel={(m, ringkas) => <PairPanel m={m} onCalibration={onCalibration} badges={TEMPLATE && contoh ? <SampleTag /> : undefined} ringkasTabel={ringkas} />}
    />
  )
}

/** Laci "How BNB scores are calibrated" (dulu kartu di bawah tabel). */
function BnbCalibrationDrawer() {
  const calS = useBnbCalibration()
  const cal = calS.kind === 'live' || calS.kind === 'contoh' ? calS.data : null
  const state = calS.kind === 'loading' ? 'loading' : calS.kind === 'error' ? 'error' : 'missing'
  return <CalibrationCard cal={cal} contoh={calS.kind === 'contoh'} state={state} />
}
