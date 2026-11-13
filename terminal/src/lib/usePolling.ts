import { useEffect, useRef, useState } from 'react'

export interface PollState<T> {
  data: T | null
  error: Error | null
  /** Hanya true saat muat pertama — refresh berikutnya tidak mengosongkan UI. */
  loading: boolean
  /** A5: epoch ms jawaban sukses terakhir (catatan "showing data from N ago" saat polling gagal). */
  at: number | null
}

/**
 * Polling berkala dengan pembatalan yang benar.
 *
 * Tiga hal yang mudah salah kalau ditulis ad-hoc di tiap komponen:
 *
 * 1. `data` TIDAK dikosongkan saat refetch — kalau dikosongkan, tabel berkedip
 *    setiap 15 detik.
 * 2. Polling berhenti saat tab tersembunyi. Tanpa ini, tab yang ditinggal
 *    seharian menembak ribuan request sia-sia ke synt-dash.
 * 3. Request dibatalkan saat unmount, dan respons yang keburu datang setelah
 *    unmount diabaikan — kalau tidak, React memperingatkan set-state pada
 *    komponen mati, dan request lama bisa menimpa data baru.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  /**
   * Jeda antar-permintaan (ms). ⭐ U11 (audit 7 Nov): boleh FUNGSI dari data terakhir yang sukses (null = belum ada)
   * → interval adaptif tanpa memulai ulang polling. Fungsi dibaca dari ref, identitasnya boleh baru tiap render;
   * jeda baru berlaku mulai tik berikutnya (tak ada permintaan tambahan saat jeda berganti).
   */
  intervalMs: number | ((data: T | null) => number) = 15_000,
  /**
   * ⭐ Penanda sumber. Saat ia berubah, polling DIMULAI ULANG.
   *
   * ⛔ Tanpa ini, hook memanggil `fetcher` yang tersimpan di ref dan effect
   * hanya bergantung `intervalMs` — jadi mengganti argumen fetcher (mis. mint
   * yang dipilih) TIDAK memicu permintaan baru. Terjadi 2026-08-28: kartu
   * detail berhenti berganti saat baris lain diklik, dan gejalanya menyesatkan
   * karena tak ada error sama sekali; panel hanya menampilkan token lama.
   *
   * Biarkan `undefined` untuk sumber yang tak berparameter (mis. /overview).
   */
  kunci?: string | number,
): PollState<T> {
  const [state, setState] = useState<PollState<T>>({
    data: null,
    error: null,
    loading: true,
    at: null,
  })

  // Disimpan di ref supaya identitas fetcher yang berubah tiap render tidak
  // memicu ulang effect (dan menyalakan ulang interval).
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const intervalRef = useRef(intervalMs)
  intervalRef.current = intervalMs
  // angka → perubahan angka tetap memulai ulang polling (perilaku lama); fungsi → tak pernah memulai ulang
  const intervalKunci = typeof intervalMs === 'number' ? intervalMs : 'fungsi'

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    // data sukses terakhir milik sumber INI (kunci) — dasar interval adaptif
    let terakhir: T | null = null
    const jeda = () => {
      const iv = intervalRef.current
      return typeof iv === 'function' ? iv(terakhir) : iv
    }

    const tick = async () => {
      controller?.abort()
      controller = new AbortController()
      try {
        const data = await fetcherRef.current(controller.signal)
        terakhir = data
        if (alive) setState({ data, error: null, loading: false, at: Date.now() })
      } catch (err) {
        if (!alive || (err as Error).name === 'AbortError') return
        // Data lama dipertahankan: satu request gagal bukan alasan
        // mengosongkan layar yang sedang dibaca.
        setState((s) => ({ ...s, error: err as Error, loading: false }))
      } finally {
        if (alive && !document.hidden) timer = setTimeout(tick, jeda())
      }
    }

    const onVisible = () => {
      if (document.hidden) {
        clearTimeout(timer)
        controller?.abort()
      } else {
        void tick()
      }
    }

    void tick()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalKunci, kunci])

  return state
}
