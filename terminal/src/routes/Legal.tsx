import { useState } from 'react'
import { PrivasiEn, PrivasiId } from './legal/Privasi'
import { SyaratEn, SyaratId } from './legal/Syarat'
import './Legal.css'

/**
 * Privacy & Terms — `/privacy`, `/terms`, EN & ID (versi Indonesia yang berlaku, Pasal 16).
 *
 * ⚠️ DRAF (1 Nov) untuk ditinjau pemilik + penasihat hukum; banner "Draft" WAJIB tetap ada sampai disetujui.
 * Bentuk & gaya mengikuti eel.synt.fun/privasi & /syarat (synteel). Pengelola synt = perorangan (10 Nov), bukan PT.
 * Isi halaman adalah JANJI kepada pengguna, jadi tiap kalimat harus cocok dgn kenyataan sistem:
 * - cookie `__Host-synt_sesi` 30 hari, hash token saja (synt-akun/src/api.rs)
 * - IP hanya di memori utk rem laju, tak disimpan (synt-akun/src/batas.rs)
 * - hapus akun mandiri = `DELETE /api/akun/saya` (jangan dicabut tanpa mengubah halaman ini)
 * - masa tunggu handle 30 hari (`MASA_TUNGGU_HANDLE_HARI`), watchlist & preferensi ikut akun (synt-akun/src/sinkron.rs)
 * - cadangan: 3 harian lokal + R2 terenkripsi 7 harian + 4 mingguan (synt-v10/ops/vps/backup-db.sh) → "35 hari"
 * - server di Singapura (Linode), Cloudflare di depan
 * Ubah sistemnya → ubah halaman ini juga (kedua bahasa). ⛔ Tanpa em dash (aturan copy publik).
 */

type Bahasa = 'en' | 'id'
const KUNCI_BAHASA = 'synt.legal.lang'

/** pilihan tersimpan → EN (keputusan pemilik 4 Nov: bawaan bahasa Inggris; Indonesia lewat tombol bahasa) */
function bahasaAwal(): Bahasa {
  try {
    const l = localStorage.getItem(KUNCI_BAHASA)
    if (l === 'en' || l === 'id') return l
  } catch {
    /* tanpa localStorage: bawaan */
  }
  return 'en'
}

const TEKS = {
  en: {
    draf: 'Draft for review. This document is not yet in effect.',
    diperbarui: 'Last updated 10 November 2026',
    pilih: 'Language',
  },
  id: {
    draf: 'Draf untuk ditinjau. Dokumen ini belum berlaku.',
    diperbarui: 'Terakhir diperbarui 10 November 2026',
    pilih: 'Bahasa',
  },
} as const

function Kerangka({ judul, isi }: { judul: Record<Bahasa, string>; isi: Record<Bahasa, React.ReactNode> }) {
  const [bahasa, setBahasa] = useState<Bahasa>(bahasaAwal)
  const pilih = (b: Bahasa) => {
    setBahasa(b)
    try {
      localStorage.setItem(KUNCI_BAHASA, b)
    } catch {
      /* pilihan tak tersimpan: cukup utk kunjungan ini */
    }
  }
  const t = TEKS[bahasa]

  return (
    <section className="page">
      <div className="ac">
        <article className="ac-card lg" lang={bahasa}>
          <header className="lg-head">
            <div className="lg-atas">
              <p className="lg-draf" role="note">
                {t.draf}
              </p>
              <div className="lg-bahasa" role="group" aria-label={t.pilih}>
                {(['en', 'id'] as const).map((b) => (
                  <button key={b} type="button" aria-pressed={bahasa === b} onClick={() => pilih(b)}>
                    {b.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <p className="lg-meta">Muhammad Fajar Nugraha</p>
            <h1>{judul[bahasa]}</h1>
            <p className="lg-meta">{t.diperbarui}</p>
          </header>
          <div className="lg-isi">{isi[bahasa]}</div>
        </article>
      </div>
    </section>
  )
}

export function PrivacyRoute() {
  return (
    <Kerangka
      judul={{ en: 'Privacy policy', id: 'Kebijakan privasi' }}
      isi={{ en: <PrivasiEn />, id: <PrivasiId /> }}
    />
  )
}

export function TermsRoute() {
  return (
    <Kerangka
      judul={{ en: 'Terms of use', id: 'Syarat penggunaan' }}
      isi={{ en: <SyaratEn />, id: <SyaratId /> }}
    />
  )
}
