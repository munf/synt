import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Salin teks ke clipboard, dengan penanda "copied" sementara.
 *
 * Contract address disalin puluhan kali per sesi di terminal mikro-cap —
 * umpan balik visual wajib, kalau tidak pengguna menekan berkali-kali karena
 * tak yakin berhasil.
 *
 * navigator.clipboard butuh secure context (HTTPS atau localhost); di luar
 * itu ia melempar. Kegagalan menyalin tidak layak merusak halaman, jadi
 * ditangkap dan dilaporkan lewat nilai balik.
 */
export function useCopy(resetMs = 1400) {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text: string, key = text) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(key)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(null), resetMs)
        return true
      } catch {
        return false
      }
    },
    [resetMs],
  )

  return { copy, copied }
}
