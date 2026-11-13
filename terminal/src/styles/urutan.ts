/* ⭐ U1 (audit 7 Nov): SEMUA CSS aplikasi tetap dimuat di awal, dalam URUTAN BUNDEL LAMA (satu berkas, sebelum rute
   dimuat malas). Hanya JS yang dipecah per rute.

   Kenapa: banyak kelas dipakai di luar berkas CSS-nya, dan dulu bekerja karena semua CSS global — mis. `.ta-r`
   (TrenchesTable/PairTable) di tabel kalibrasi `/bnb`, `.tr-empty` (Trenches.css) di `/coin` & `/bnb`, `.tt-score*`
   (TrenchesTable) di ScoreCell, `.tp-card` (TokenPanel.css) di kartu kalibrasi Trenches, `.is-rug`/`.is-winner`
   (Creators.css) di chip outcome BNB. Bila CSS ikut dipecah per rute, kelas itu hilang di rute lain dan urutan kaskade
   berubah menurut urutan kunjungan. Daftar ini = urutan modul CSS bundel lama (rollup `moduleIds`, build c6f16ac),
   jadi kaskade identik; berkas CSS komponen tetap mengimpor dirinya sendiri (impor ganda tak berefek).

   ⛔ PENGECUALIAN: `@klinecharts/pro/dist/klinecharts-pro.css` (36 KB) hanya dimuat bersama chart (PriceChartPro/
   BnbChart, malas); tercakup `.klinecharts-pro*`, aturan app yang menimpanya berspesifisitas lebih tinggi.
   `PriceChartPro.css` (1 KB) global lagi sejak putaran 2: `ChartGagal` (`.pcp-empty`) harus bergaya justru saat
   potongan chart GAGAL diunduh.
   CSS baru: impor di komponennya seperti biasa; tambahkan ke sini bila kelasnya dipakai lintas rute. */

import '@/components/DevNotice.css'
import '@/components/Popover.css'
import '@/components/Drawer.css'
import '@/features/trenches/SidePanels.css'
import '@/components/Avatar.css'
import '@/features/trade/Trade.css'
import '@/features/account/Account.css'
import '@/features/support/Support.css'
import '@/components/Metric.css'
import '@/features/engine/EngineBar.css'
import '@/components/AppShell.css'
import '@/features/discovery/Discovery.css'
import '@/components/SideRail.css'
import '@/features/trenches/ViewBar.css'
import '@/components/TokenIdentity.css'
import '@/components/ScoreCell.css'
import '@/components/StatusChip.css'
import '@/features/trenches/TrenchesTable.css'
import '@/features/wallet/Wallet.css'
import '@/features/trenches/ChainSwitch.css'
import '@/features/trenches/PairTable.css'
import '@/features/trenches/PairPanel.css'
import '@/features/trenches/PairSheet.css'
import '@/features/bnb/Bnb.css'
import '@/features/trenches/PairToolbar.css'
import '@/routes/Trenches.css'
import '@/features/token/chart/chart.css'
import '@/features/token/PriceChartPro.css'
import '@/features/token/view/TokenView.css'
import '@/features/discovery/Post.css'
import '@/features/leaderboard/Leaderboard.css'
import '@/features/leaderboard/Creators.css'
import '@/features/token/TokenPanel.css'
import '@/routes/Legal.css'
