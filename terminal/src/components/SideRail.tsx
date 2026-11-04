import { VIEWS, type TrenchView, type ViewDef } from '@/features/trenches/stages'
import './SideRail.css'

/**
 * Rail ikon kiri — frame Figma 3:2 (x25, lebar 52px).
 *
 * Tiga kelompok, dipisah garis:
 *   1. Search + empat sub-tampilan Trenches (new pair · trending · bonding ·
 *      graduated) sesuai PRODUK.md §1.2. Urutannya mengikuti perjalanan
 *      token, jadi posisi vertikal ikon punya arti — jangan diacak.
 *   2. Quick buy + wallet.
 *   3. Collapse panel, di kaki rail (posisi sama di frame 3:2 dan 64:1401).
 *
 * Rail ini ikon-saja selebar 52px, jadi setiap tombol WAJIB punya label
 * teks tersembunyi + tooltip: ikon sendirian bukan nama, dan istilah seperti
 * "bonding" tidak bisa ditebak dari gambar.
 */
export function SideRail({
  view,
  onViewChange,
  panelOpen,
  onTogglePanel,
  onSearch,
  onQuickBuy,
  onWallet,
  onTracker,
  onPortfolio,
  views = VIEWS,
}: {
  view: TrenchView
  onViewChange: (v: TrenchView) => void
  panelOpen: boolean
  onTogglePanel: () => void
  onSearch?: () => void
  onQuickBuy?: () => void
  onWallet?: () => void
  onTracker?: () => void
  onPortfolio?: () => void
  /** Butir 14: tampilan yang tersedia (BNB = new & graduated saja). Default = empat tampilan Solana. */
  views?: ViewDef[]
}) {
  return (
    <nav className="rail" aria-label="Trenches filters and navigation">
      <div className="rail-groups">
        {/* butir 14: tanpa onSearch (chain BNB: belum ada pencarian BNB) tombol tak dirender, bukan tombol mati */}
        {onSearch && (
          <>
            <ul className="rail-items">
              <li>
                <RailButton label="Search tokens" onClick={onSearch}>
                  <SearchIcon />
                </RailButton>
              </li>
            </ul>

            <span className="rail-divider" role="separator" />
          </>
        )}

        {/* Sub-tampilan — role=radiogroup karena hanya satu yang bisa aktif. */}
        <ul className="rail-items" role="radiogroup" aria-label="Token views">
          {views.map((v) => (
            <li key={v.id}>
              <RailButton
                label={v.label}
                hint={v.hint}
                active={view === v.id}
                role="radio"
                onClick={() => onViewChange(v.id)}
              >
                <ViewIcon view={v.id} />
              </RailButton>
            </li>
          ))}
        </ul>

        <span className="rail-divider" role="separator" />

        <ul className="rail-items">
          <li>
            <RailButton
              label="Wallet tracker"
              hint="Look up what synt recorded about a wallet"
              onClick={onTracker}
            >
              <TrackerIcon />
            </RailButton>
          </li>
          <li>
            <RailButton
              label="Portfolio"
              hint="Your positions and their audit scores"
              onClick={onPortfolio}
            >
              <PortfolioIcon />
            </RailButton>
          </li>
          <li>
            <RailButton label="Quick buy settings" onClick={onQuickBuy}>
              <SlidersIcon />
            </RailButton>
          </li>
          <li>
            <RailButton label="Wallet" onClick={onWallet}>
              <WalletIcon />
            </RailButton>
          </li>
        </ul>
      </div>

      <button
        type="button"
        className="rail-btn rail-toggle"
        onClick={onTogglePanel}
        aria-expanded={panelOpen}
        aria-controls="token-panel"
        title={panelOpen ? 'Hide detail panel' : 'Show detail panel'}
      >
        <PanelIcon flipped={!panelOpen} />
        <span className="sr-only">
          {panelOpen ? 'Hide detail panel' : 'Show detail panel'}
        </span>
      </button>
    </nav>
  )
}

function RailButton({
  children,
  label,
  hint,
  active,
  role,
  onClick,
}: {
  children: React.ReactNode
  label: string
  hint?: string
  active?: boolean
  role?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={`rail-btn ${active ? 'is-active' : ''}`}
      onClick={onClick}
      role={role}
      aria-checked={role === 'radio' ? active : undefined}
      title={hint ? `${label}: ${hint}` : label}
    >
      {active && <span className="rail-indicator" aria-hidden="true" />}
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}

/**
 * Ikon per sub-tampilan, dipilih supaya bentuknya menceritakan progres:
 * percikan (new pair) → panah naik (trending) → kurva (bonding) →
 * topi wisuda (graduated).
 */
function ViewIcon({ view }: { view: TrenchView }) {
  switch (view) {
    case 'new':
      return (
        <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
          <path
            d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3M4.9 4.9l2.1 2.1M13 13l2.1 2.1M15.1 4.9 13 7M7 13l-2.1 2.1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'trending':
      return (
        <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
          <path
            d="m2.8 13.2 4.4-4.4 3 3 6-6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M12.6 5.8h3.6v3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'bonding':
      // Kurva menanjak — bentuk bonding curve itu sendiri.
      return (
        <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
          <path d="M3 16.5C3 16.5 6.5 15.5 10 11.5C13.5 7.5 17 4 17 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M3 16.5h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".45" />
        </svg>
      )
    case 'graduated':
      return (
        <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
          <path d="m10 3.5 8 3.5-8 3.5-8-3.5 8-3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M5.5 8.8v3.9c0 .9 2 2.3 4.5 2.3s4.5-1.4 4.5-2.3V8.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M18 7v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
  }
}

/** Panah membalik arah mengikuti keadaan, jadi ikonnya menunjukkan apa yang
    akan terjadi saat diklik, bukan keadaan sekarang. */
function PanelIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      aria-hidden="true"
      style={flipped ? { transform: 'scaleX(-1)' } : undefined}
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

/** Wallet tracker: dua wallet dengan garis penghubung — melacak pihak lain. */
function TrackerIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
      <circle cx="6" cy="6.5" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="13.5" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.2 8.2 11.8 11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.6 1.8" />
    </svg>
  )
}

/** Portfolio: batang bertingkat — komposisi kepemilikan. */
function PortfolioIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
      <path d="M3.5 16.5V11M8.5 16.5V5M13.5 16.5V8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2.5 16.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
    </svg>
  )
}

/** Slider — pengaturan quick buy (jumlah default, slippage, priority fee). */
function SlidersIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
      <path d="M3 6.5h14M3 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="6.5" r="2.2" fill="var(--panel-2)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="13" cy="13.5" r="2.2" fill="var(--panel-2)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" fill="none" aria-hidden="true">
      <rect x="2.8" y="5" width="14.4" height="10.5" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.5 10.2h1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
