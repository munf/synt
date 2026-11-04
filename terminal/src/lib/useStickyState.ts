import { useEffect, useState } from 'react'

/**
 * useState yang bertahan di localStorage.
 *
 * Dipakai untuk preferensi tampilan seperti panel terbuka/tertutup: kalau
 * pengguna menutup panel lalu pindah halaman dan kembali, panel harus tetap
 * tertutup — keadaan yang mereka pilih sendiri, bukan direset diam-diam.
 *
 * localStorage bisa melempar (mode privat Safari, storage penuh, iframe
 * tanpa izin). Kegagalan menyimpan preferensi tampilan tidak layak
 * merusak halaman, jadi ditelan dan nilainya kembali ke default.
 */
export function useStickyState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Preferensi tak tersimpan — tidak fatal, biarkan sesi ini saja.
    }
  }, [key, value])

  return [value, setValue] as const
}
