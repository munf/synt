/**
 * ⭐ MODE TEMPLATE (lab.synt.fun, 2026-10-24 — permintaan pemilik: "tampilkan mock template awal terminal, bukan
 * duplikat terminal saat ini"). Build dgn `vite build --mode template` (berkas `.env.template`):
 * seluruh halaman memakai DATA CONTOH dari `features/x/mock.ts` dan semua menu yang di preview terkunci dibuka
 * (Leaderboard, Messages, Notifications, Wallet, Profile, Settings, kolom Wallet/Leaderboard di Discovery).
 *
 * Tujuannya peta pekerjaan: terlihat bentuk lengkap produk & apa yang belum tersambung. ⛔ JANGAN dipakai di preview
 * publik — angka contoh tanpa tanda membuat angka nyata ikut diragukan. Flag mati = perilaku preview apa adanya.
 */
// tsconfig proyek tak memuat vite/client, jadi tipe env ditulis di sini
export const TEMPLATE = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_TEMPLATE === 'mock'
