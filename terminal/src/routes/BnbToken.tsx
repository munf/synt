import { useParams } from 'react-router-dom'
import type { BnbCalibrationResponse, BnbTokenDetail } from '@/api/types'
import { ALAMAT_EVM, BSCSCAN_TOKEN, useBnbCalibration, useBnbToken } from '@/features/bnb/useBnb'
import { TokenSkeleton, TokenView } from '@/features/token/view/TokenView'
import { modelBnb } from '@/features/token/view/adaptBnb'
import '@/features/token/TokenPanel.css'
import '@/features/bnb/Bnb.css'

/**
 * Halaman token BNB — `/bnb/:token` (butir 14, frontend B11).
 *
 * Sumber: `/api/bnb/token/:addr` (15 dtk) + `/api/bnb/calibration` (base rate & kartu kalibrasi).
 * Isi: chart candle (`candle_unit`; waktu = epoch detik `t` dari data, P3), skor detik-120 + alasan, fakta detik-120, pasar, tautan BscScan.
 * ⛔ Tanpa Quick buy / swap / wallet. Alamat yang bukan 0x+40 hex tak pernah dikirim ke synt-dash.
 */
export function BnbTokenRoute() {
  const { token } = useParams<{ token: string }>()
  const addr = token ?? ''
  if (!ALAMAT_EVM.test(addr)) {
    return <section className="page"><p className="tr-empty">Token not found.</p></section>
  }
  // key: ganti alamat = polling & state baru (pelajaran 1b: tanpa remount data token lama tampil di URL baru)
  return <BnbTokenPage key={addr.toLowerCase()} addr={addr} />
}

function BnbTokenPage({ addr }: { addr: string }) {
  const tok = useBnbToken(addr)
  const calS = useBnbCalibration()
  const cal = calS.kind === 'live' || calS.kind === 'contoh' ? calS.data : null
  const calState = calS.kind === 'loading' ? 'loading' : calS.kind === 'error' ? 'error' : 'missing'

  // A5: kerangka kartu (bukan satu teks "Loading…")
  if (tok.kind === 'loading') return <section className="page"><TokenSkeleton /></section>
  if (tok.kind === 'error') {
    return <section className="page"><p className="tr-empty">Cannot reach BNB data. Retrying automatically.</p></section>
  }
  if (tok.kind === 'missing') {
    // 14b: 404 `not_found` (badan JSON bnb.rs) = token tak direkam; 404 tanpa badan / 503 `bnb_unavailable` = BNB
    // belum aktif. Dulu ditebak dari kalibrasi, padahal kalibrasi tetap dilayani walau pool BNB mati.
    const endpointAda = tok.reason === 'not_found'
    return (
      <section className="page">
        <div className="tr-empty bnb-empty" role="status">
          <p><strong>{endpointAda ? 'This token is not in synt’s BNB data.' : 'BNB data is not available yet.'}</strong></p>
          <p className="bnb-empty-sub">
            {endpointAda
              ? 'synt tracks new Flap and four.meme launches on BNB Chain.'
              : 'BNB token pages will open once the BNB feed is connected.'}
          </p>
          <p className="bnb-empty-sub">
            <a className="bnb-ext" href={`${BSCSCAN_TOKEN}${addr}`} target="_blank" rel="noreferrer noopener">
              View on BscScan ↗
            </a>
          </p>
        </div>
      </section>
    )
  }

  return <BnbTokenView d={tok.data} contoh={tok.kind === 'contoh'} stale={tok.kind === 'live' && tok.stale} staleAt={tok.kind === 'live' ? tok.at : null} cal={cal} calContoh={calS.kind === 'contoh'} calState={calState} />
}

function BnbTokenView({ d, contoh, stale, staleAt, cal, calContoh, calState }: {
  d: BnbTokenDetail
  contoh: boolean
  stale: boolean
  staleAt: number | null
  cal: BnbCalibrationResponse | null
  calContoh: boolean
  calState: 'loading' | 'missing' | 'error'
}) {
  // ⭐ A4: halaman yang SAMA dgn /coin (TokenView), diisi adapter BNB.
  return (
    <section className="page">
      <TokenView m={modelBnb(d, { contoh, stale, staleAt, cal, calContoh, calState })} />
    </section>
  )
}
