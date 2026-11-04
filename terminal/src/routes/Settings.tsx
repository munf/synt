import { QuickBuyPanel } from '@/features/trenches/QuickBuyPanel'
import { usePreferensi } from '@/features/account/sinkron'
import { useAkun } from '@/features/account/useAkun'
import '@/features/account/Account.css'
import '@/features/trenches/SidePanels.css'

/**
 * Pengaturan — `/settings`.
 *
 * ⭐ 1 Nov (tahap B): preferensi ikut akun saat masuk (`features/account/sinkron.ts`), localStorage saat tamu.
 * ⚠️ Toggle notifikasi belum menggerakkan apa pun — notifikasi sistem = tahap C.
 */
export function SettingsRoute() {
  const { status } = useAkun()
  return (
    <section className="page">
      <div className="ac">
        <p className="ac-hint ac-sinkron" role="status">
          {status === 'masuk'
            ? 'Saved to your account: your watchlist and these settings follow you to every device you sign in on.'
            : 'Saved on this device only. Sign in to keep your watchlist and settings across devices.'}
        </p>
        <div className="ac-card">
          <h1 className="ac-section-title">Notifications</h1>
          <Toggle
            id="synt.notif.audit"
            name="Audit updates"
            hint="When a score on your watchlist changes after the 10-minute window."
            initial
          />
          <Toggle
            id="synt.notif.price"
            name="Price movement"
            hint="Large moves on tokens you follow."
            initial
          />
          <Toggle
            id="synt.notif.social"
            name="Social"
            hint="New followers, replies, and mentions."
            initial={false}
          />
        </div>

        <div className="ac-card">
          <h2 className="ac-section-title">Display</h2>
          <Toggle
            id="synt.display.compact"
            name="Compact rows"
            hint="Fit more tokens on screen at the cost of breathing room."
            initial={false}
          />
          <Toggle
            id="synt.display.confirmBuy"
            name="Confirm before buying"
            hint="Shows a confirmation step when the Buy button is pressed."
            initial
          />
        </div>

        <div className="ac-card">
          <h2 className="ac-section-title">Quick buy</h2>
          <div style={{ padding: 'var(--sp-6)' }}>
            <QuickBuyPanel />
          </div>
        </div>
      </div>
    </section>
  )
}

function Toggle({
  id,
  name,
  hint,
  initial,
}: {
  id: string
  name: string
  hint: string
  initial: boolean
}) {
  const [on, setOn] = usePreferensi(id, initial)

  return (
    <div className="ac-setting">
      <span className="ac-setting-label">
        <span className="ac-setting-name">{name}</span>
        <span className="ac-setting-hint">{hint}</span>
      </span>
      <button
        type="button"
        className="ac-switch"
        role="switch"
        aria-checked={on}
        aria-label={name}
        onClick={() => setOn((v) => !v)}
      />
    </div>
  )
}
