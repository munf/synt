import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Terminal TIDAK bicara ke Postgres. Ia konsumen HTTP dari synt-dash, yang
// sudah memegang koneksi read-only (role `dash_ro`). Batas itu ditegakkan
// systemd di sisi synt-dash — menambah koneksi DB di sini akan membatalkannya.
//
// Proxy hanya untuk dev: di produksi reverse-proxy (nginx/Caddy) yang
// mengarahkan /api ke synt-dash, sehingga tak ada CORS dan tak ada URL
// backend yang ikut ter-bundle ke sisi klien.
// klinecharts 9 melipat nol desimal jadi "0.0{5}2160" (ambang bawaan 3) dan teks itu tampil MENTAH di sumbu & OHLC
// halaman token. @klinecharts/pro tak meneruskan opsi `decimalFoldThreshold` ke init(), jadi ambang bawaannya
// dinaikkan saat build (2026-10-22). Gagal-keras bila teks sumber berubah setelah upgrade klinecharts.
//
// A5 (28 Okt): SEMUA teks harga kanvas (sumbu-y, label crosshair, penanda harga terakhir/tertinggi/terendah, legenda
// indikator) lewat SATU fungsi klinecharts `formatFoldDecimal`. Fungsi itu kini lebih dulu bertanya ke kait
// `globalThis.__syntLipatDesimal` (dipasang `features/token/chart/kanvas.ts`, memakai `angkaHarga` lib/format.ts) →
// kanvas menulis "0.0₄4649" persis seperti kartu. Kait tak terpasang / mengembalikan null → perilaku lama (ambang 99 =
// tanpa lipat). Gagal-keras juga bila pola fungsi berubah.
const POLA_LIPAT = 'function formatFoldDecimal(value, threshold) {\n    var vl = "".concat(value);'
let tanpaLipatTerpasang = false
const klinechartsTanpaLipat = {
  name: 'klinecharts-tanpa-lipat',
  // build: kait __syntLipatDesimal kini menentukan angka sumbu chart → tak boleh diam-diam hilang setelah upgrade
  generateBundle() {
    if (!tanpaLipatTerpasang) throw new Error('klinecharts-tanpa-lipat: klinecharts tak pernah ditambal — pola/path berubah?')
  },
  transform(code: string, id: string) {
    if (!/node_modules[\\/]klinecharts[\\/]dist[\\/]/.test(id)) return null
    if (!code.includes('this._decimalFoldThreshold = 3')) {
      if (code.includes('_decimalFoldThreshold')) throw new Error('klinecharts-tanpa-lipat: pola ambang lipat berubah — periksa versi klinecharts')
      return null
    }
    if (code.split(POLA_LIPAT).length !== 2) throw new Error('klinecharts-tanpa-lipat: pola formatFoldDecimal berubah — periksa versi klinecharts')
    const hasil = code
      .replace('this._decimalFoldThreshold = 3', 'this._decimalFoldThreshold = 99')
      .replace(
        POLA_LIPAT,
        POLA_LIPAT +
          '\n    var __kait = globalThis.__syntLipatDesimal;' +
          '\n    if (typeof __kait === "function") { var __r = __kait(vl); if (typeof __r === "string") return __r; }',
      )
    tanpaLipatTerpasang = true
    return { code: hasil, map: null }
  },
}

// P5 (AGEN-BUILD): `vol_sol` = cadangan SOL kurva (synt-stream `candle.rs`: max(likuiditas)), BUKAN volume perdagangan.
// Pane bawah chart token memakai indikator SENDIRI `CURVE_SOL` (PriceChartPro.tsx). Plugin ini menambal UI Pro yang
// dikode keras (putaran 2, Reviewer):
//   1. menu Sub Indicator: "VOL" → "CURVE_SOL"; OBV/VR/PVT/EMV DIBUANG (menghitung "volume" dari level kurva);
//   2. label menu `curve_sol` (en-US & zh-CN) — tanpanya Pro menulis kunci mentah "curve_sol";
//   3. ikon gear CURVE_SOL tak membuka modal pengaturan (tak punya parameter; modal Pro berjudul nama indikator);
//   4. jarak pane sama dgn VOL bawaan.
// ⛔ Gagal-keras: tiap pola WAJIB ada tepat sekali di klinecharts-pro.js, kalau tidak build berhenti (upgrade Pro).
// Dev (`npm run dev`) memakai jalur yang sama karena Pro dikeluarkan dari pre-bundle (`optimizeDeps.exclude`).
const TAMBALAN_PRO: Array<[string, string]> = [
  [
    '["MA", "EMA", "VOL", "MACD", "BOLL", "KDJ", "RSI", "BIAS", "BRAR", "CCI", "DMI", "CR", "PSY", "DMA", "TRIX", "OBV", "VR", "WR", "MTM", "EMV", "SAR", "SMA", "ROC", "PVT", "BBI", "AO"]',
    '["MA", "EMA", "CURVE_SOL", "MACD", "BOLL", "KDJ", "RSI", "BIAS", "BRAR", "CCI", "DMI", "CR", "PSY", "DMA", "TRIX", "WR", "MTM", "SAR", "SMA", "ROC", "BBI", "AO"]',
  ],
  ['  vol: hs,', '  vol: hs,\n  curve_sol: "Curve SOL (not volume)",'],
  ['  vol: ca,', '  vol: ca,\n  curve_sol: "Curve SOL (not volume)",'],
  ['case "setting": {', 'case "setting": {\n            if (f.indicatorName === "CURVE_SOL") break;'],
  ['t === "VOL" && (r = {', '(t === "VOL" || t === "CURVE_SOL") && (r = {'],
  // A5: instance klinecharts di balik Pro (Pro 0.1.1 tak memaparkannya) → strip OHLC di luar kanvas membaca crosshair
  // (`subscribeAction`) & data, dan kanvas memakai font/warna token lewat API publik klinecharts.
  ['    getStyles: () => n.getStyles(),', '    getStyles: () => n.getStyles(),\n    getChart: () => n,'],
]
let tambalanProTerpasang = false
const klinechartsProKurva = {
  name: 'klinecharts-pro-kurva',
  // build: bila Pro ikut di-bundle tapi tambalan tak pernah terpasang (path berubah), berhenti — jangan diam-diam lolos
  generateBundle() {
    if (!tambalanProTerpasang) throw new Error('klinecharts-pro-kurva: klinecharts-pro.js tak pernah ditambal — path @klinecharts/pro berubah?')
  },
  transform(code: string, id: string) {
    if (!/node_modules[\\/]@klinecharts[\\/]pro[\\/]dist[\\/]klinecharts-pro\.js$/.test(id.split('?')[0] ?? id)) return null
    let hasil = code
    for (const [cari, ganti] of TAMBALAN_PRO) {
      const n = hasil.split(cari).length - 1
      if (n !== 1) throw new Error(`klinecharts-pro-kurva: pola ditemukan ${n}× (harus 1): ${cari.slice(0, 60)} — periksa versi @klinecharts/pro`)
      hasil = hasil.replace(cari, ganti)
    }
    tambalanProTerpasang = true
    return { code: hasil, map: null }
  },
}

export default defineConfig({
  plugins: [react(), klinechartsTanpaLipat, klinechartsProKurva],
  // P5 putaran 2: Pro tak di-pre-bundle supaya tambalan `klinecharts-pro-kurva` juga berlaku di dev
  optimizeDeps: { exclude: ['@klinecharts/pro'] },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Urutan penting: '/api/akun' dicocokkan sebelum '/api'. Ketiganya bisa diarahkan ke demo publik
    // (mis. VITE_API_ORIGIN=https://preview.synt.fun) untuk menjalankan terminal tanpa backend lokal.
    proxy: {
      '/api/akun': {
        target: process.env.VITE_AKUN_ORIGIN ?? 'http://127.0.0.1:5681',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:5679',
        changeOrigin: true,
      },
      // synt-stream (SSE harga) melayani /stream/:mint → prefix /live dibuang, sama spt Caddy handle_path
      '/live': {
        target: process.env.VITE_LIVE_ORIGIN ?? 'http://127.0.0.1:5680',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/live/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    // Sourcemap membongkar seluruh kode sumber ke siapa pun yang membuka
    // DevTools. Berguna saat dev, berbahaya di build yang di-deploy —
    // termasuk preview ber-password, karena password hanya membatasi SIAPA
    // yang masuk, bukan apa yang mereka lihat setelah masuk.
    // Nyalakan sementara lewat: SOURCEMAP=1 npm run build
    sourcemap: process.env.SOURCEMAP === '1',
  },
})
