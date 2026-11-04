import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { umur } from '@/lib/format'
import { akunApi, type ButirKotak } from './akun'
import { useAkun } from './useAkun'
import type { Notification, Message } from './types'

/**
 * Lonceng notifikasi & kotak pesan sistem dari synt-akun (tahap C, 1 Nov).
 *
 * Satu sumber untuk popover AppShell DAN rute `/notifications`, `/messages` — menandai dibaca di
 * satu tempat harus langsung terlihat di tempat lain. Dipasang sekali di AppShell (di dalam AkunProvider).
 *
 * Tamu: daftar kosong, tanpa permintaan ke server. Masuk: muat sekarang, lalu tiap 60 dtk dan saat tab
 * kembali aktif (pemantau server pun berjalan per 60 dtk; lebih sering tak membawa kabar baru).
 */

interface NilaiKotak {
  notifications: Notification[]
  messages: Message[]
  /** dari server — bisa lebih besar dari panjang daftar (daftar dibatasi 30 terbaru) */
  unread: { notifications: number; messages: number }
  tandai: (ids: string[]) => void
  tandaiSemua: (tempat: 'notifications' | 'messages') => void
}

const Konteks = createContext<NilaiKotak | null>(null)
const SELANG = 60_000

const lalu = (iso: string) => {
  const detik = (Date.now() - Date.parse(iso)) / 1000
  if (detik < 60) return 'just now'
  const t = umur(detik)
  return t === '—' ? '' : `${t} ago`
}

const keNotifikasi = (b: ButirKotak): Notification => ({
  id: String(b.id),
  kind: b.kind,
  title: b.title,
  text: b.text,
  timeAgo: lalu(b.at),
  read: b.read,
  href: b.href,
})

const kePesan = (b: ButirKotak): Message => ({
  id: String(b.id),
  from: b.title,
  avatar: null,
  preview: b.text,
  timeAgo: lalu(b.at),
  unread: !b.read,
  href: b.href,
})

export function KotakProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAkun()
  const [notif, setNotif] = useState<ButirKotak[]>([])
  const [pesan, setPesan] = useState<ButirKotak[]>([])
  const [belum, setBelum] = useState({ notifications: 0, messages: 0 })
  const masuk = status === 'masuk'
  const hidup = useRef(true)

  const muat = useCallback(() => {
    akunApi
      .kotak()
      .then((k) => {
        if (!hidup.current) return
        setNotif(k.notifications)
        setPesan(k.messages)
        setBelum(k.unread)
      })
      .catch(() => undefined) // gagal sesaat → tampilan lama tetap, coba lagi di siklus berikut
  }, [])

  useEffect(() => {
    hidup.current = true
    if (!masuk) {
      setNotif([])
      setPesan([])
      setBelum({ notifications: 0, messages: 0 })
      return
    }
    muat()
    const t = setInterval(() => document.visibilityState === 'visible' && muat(), SELANG)
    const aktif = () => document.visibilityState === 'visible' && muat()
    document.addEventListener('visibilitychange', aktif)
    return () => {
      hidup.current = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', aktif)
    }
  }, [masuk, muat])

  // ⚠️ hitungan dihitung dari state saat ini, BUKAN di dalam updater setState: StrictMode memanggil updater
  // dua kali, dan efek samping di sana mengurangi hitungan belum-dibaca dua kali.
  const tandai = useCallback(
    (ids: string[]) => {
      const set = new Set(ids)
      const kena = (l: ButirKotak[]) => l.filter((b) => set.has(String(b.id)) && !b.read).length
      const nN = kena(notif), nP = kena(pesan)
      if (!nN && !nP) return
      const baru = (l: ButirKotak[]) => l.map((b) => (set.has(String(b.id)) ? { ...b, read: true } : b))
      setNotif(baru)
      setPesan(baru)
      setBelum((u) => ({ notifications: Math.max(0, u.notifications - nN), messages: Math.max(0, u.messages - nP) }))
      void akunApi.baca({ ids: ids.map(Number) }).catch(() => undefined)
    },
    [notif, pesan],
  )

  const tandaiSemua = useCallback((tempat: 'notifications' | 'messages') => {
    const set = tempat === 'notifications' ? setNotif : setPesan
    set((l) => l.map((b) => ({ ...b, read: true })))
    setBelum((u) => ({ ...u, [tempat]: 0 }))
    void akunApi.baca({ tempat }).catch(() => undefined)
  }, [])

  const nilai = useMemo(
    () => ({
      notifications: notif.map(keNotifikasi),
      messages: pesan.map(kePesan),
      unread: belum,
      tandai,
      tandaiSemua,
    }),
    [notif, pesan, belum, tandai, tandaiSemua],
  )
  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>
}

export function useKotak(): NilaiKotak {
  const k = useContext(Konteks)
  if (!k) throw new Error('useKotak dipakai di luar KotakProvider')
  return k
}
