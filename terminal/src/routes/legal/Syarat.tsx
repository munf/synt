import { Link } from 'react-router-dom'
import { Kontak } from './bersama'

/*
 * Syarat Penggunaan — isi EN & ID. Bentuk pasal mengikuti eel.synt.fun/syarat (synteel), satu perusahaan;
 * isinya disesuaikan terminal analitik token (bukan nasihat keuangan, non-custodial, 18+).
 * ⚠️ Pasal 4 (kewajiban synt) = janji yang harus tetap benar di terminal: skor + base rate, data contoh ditandai.
 * ⛔ Tanpa em dash.
 */

export function SyaratEn() {
  return (
    <>
      <section className="lg-ringkas" aria-label="In short">
        <h2>In short</h2>
        <ul>
          <li>
            synt is an analytics terminal. Its scores are automated estimates from public on-chain data and can be
            wrong. They are not financial advice.
          </li>
          <li>New tokens and memecoins are extremely risky. Decisions to buy or sell are yours alone.</li>
          <li>synt never holds your funds or keys and never asks for your seed phrase.</li>
          <li>
            You can buy and sell tokens from the terminal. You sign every trade in your own wallet, synt charges no
            fee, and a confirmed trade cannot be reversed.
          </li>
          <li>Users must be 18 or older.</li>
          <li>This summary helps reading; the articles below are what count.</li>
        </ul>
      </section>

      <p>
        These Terms of Use (the &quot;Terms&quot;) are an agreement between PT Synt Tekno Multikarya (&quot;synt&quot;)
        and everyone who uses the synt terminal (a &quot;User&quot;).
      </p>
      <p>
        A User agrees to these Terms and to the synt <Link to="/privacy">Privacy Policy</Link> by using the Terminal or
        by signing in. A User who does not agree may not use the Service.
      </p>

      <h2>Article 1. Definitions</h2>
      <ol>
        <li>Terminal: the synt terminal at synt.fun and its subdomains.</li>
        <li>Service: every function available through the Terminal.</li>
        <li>
          Account: an account created by signing a sign-in message with a Wallet. Each wallet address is its own
          Account: a Solana address and a 0x (EVM) address are two separate Accounts, even in the same Wallet.
        </li>
        <li>Wallet: a crypto wallet controlled by the User, such as MetaMask, Phantom, Solflare or Backpack.</li>
        <li>
          Scores: the scores, tiers, labels, base rates, rankings and explanations the Terminal shows about tokens.
        </li>
        <li>Profile: the handle, display name and bio a User writes.</li>
        <li>Privacy Policy: the synt privacy policy at synt.fun/privacy, which is part of these Terms.</li>
      </ol>

      <h2>Article 2. The Service</h2>
      <ol>
        <li>
          The Service shows market data and Scores for new tokens on Solana and BNB Chain, built from public on-chain
          data, and lets signed-in Users buy and sell Solana and BNB Chain tokens through their own Wallet.
        </li>
        <li>
          The Service is currently free of charge. If synt offers paid features, it will announce the price and terms
          before they apply. synt will not charge a User without the User&apos;s consent.
        </li>
        <li>synt may add, change or remove features to improve the Service.</li>
        <li>
          Alerts about tokens on a watchlist depend on data being available. They can arrive late or not at all, and
          they are not a signal to buy or sell.
        </li>
      </ol>

      <h2>Article 3. What Scores are: an analytics aid</h2>
      <ol>
        <li>
          Scores are an analytics aid. They are not investment, financial, legal or tax advice, and not a
          recommendation to buy, sell or hold any token.
        </li>
        <li>
          Scores are automated estimates from rules and models calibrated on past data. A base rate describes what
          happened to similar tokens in the past; it does not promise what will happen next.
        </li>
        <li>
          Scores can be wrong, late or incomplete, especially when on-chain data is delayed or a data provider is
          disrupted.
        </li>
        <li>
          New tokens and memecoins are extremely risky. Many lose all their value, and some are created to defraud
          buyers.
        </li>
        <li>Decisions to buy, sell or hold any token are the User&apos;s decisions.</li>
        <li>synt does not guarantee any price, profit or outcome, and does not guarantee that a token is safe.</li>
      </ol>

      <h2>Article 4. synt&apos;s obligations</h2>
      <ol>
        <li>
          synt must run the Service with reasonable care, which includes:
          <ol type="a">
            <li>showing a Score in detail together with its historical base rate, so a Score is not read as a guarantee;</li>
            <li>marking sample data and parts of the Terminal that are still in development;</li>
            <li>
              never asking for a seed phrase or private key, and never moving funds without the User&apos;s own
              signature in their Wallet;
            </li>
            <li>fixing errors in the Service that are reported to or found by synt within a reasonable time;</li>
            <li>telling Users in the Terminal when synt knows of a disruption that affects the data shown.</li>
          </ol>
        </li>
        <li>
          synt&apos;s obligation is to make its best effort as set out in paragraph (1), not to guarantee a particular
          result.
        </li>
      </ol>

      <h2>Article 5. Wallets and Accounts</h2>
      <ol>
        <li>Users must be 18 years or older.</li>
        <li>
          synt is non-custodial. It never holds a User&apos;s funds, private keys or seed phrase. Signing in means
          signing a text message; it is not a transaction and costs nothing.
        </li>
        <li>
          Whoever controls a Wallet controls its Account. Keeping the Wallet and the device secure is the User&apos;s
          responsibility, unless a loss happened because of synt&apos;s fault.
        </li>
        <li>One Wallet has one Account.</li>
        <li>
          Trading. synt prepares each buy or sell, tests it before showing it, and shows its estimated result. On
          Solana it is built through a third-party swap router (currently Jupiter); the User signs it in the
          User&apos;s own Wallet and synt forwards the signed transaction to the network. On BNB Chain it goes directly
          to the launchpad&apos;s contract (four.meme or Flap.sh) or through a third-party swap router (currently
          KyberSwap), and the User&apos;s Wallet sends it itself. synt cannot sign, change or reverse a transaction and
          never moves funds without the User&apos;s signature.
        </li>
        <li>
          On BNB Chain, selling a token first needs an approval that lets the contract use exactly the amount being
          sold. The approval is a separate transaction and costs gas. Before a buy, synt tests selling the token back;
          that test is an estimate and does not guarantee the token can be sold later.
        </li>
        <li>
          Quotes are estimates. Prices move between the quote and confirmation, so the amount received can be lower
          than estimated, down to the minimum shown for the slippage the User chose. A transaction can fail or
          expire, and a failed transaction can still cost a network fee.
        </li>
        <li>
          synt charges no fee for trades. Network, priority and gas fees, token account rent, token taxes and the fees
          of the protocols and pools involved, such as a launchpad&apos;s trading fee, apply and are paid from the
          User&apos;s Wallet.
        </li>
        <li>Blockchain transactions are final once confirmed. synt cannot cancel or refund them.</li>
        <li>
          Users may trade only where the law that applies to them allows it, and are responsible for any taxes and
          reporting on their trades.
        </li>
      </ol>

      <h2>Article 6. Profiles</h2>
      <ol>
        <li>Users keep ownership of their Profile.</li>
        <li>
          Users give synt a limited, non-exclusive, royalty-free permission to store and show their Profile in the
          Terminal. This permission is only for running the Service and ends when the Profile is deleted.
        </li>
        <li>
          A Profile must not impersonate synt, its team, another project or another person; must not promote scams,
          fake giveaways or tokens in a misleading way; must not contain anything unlawful, hateful, harassing or
          sexually explicit; and must not infringe other people&apos;s rights.
        </li>
        <li>
          A handle that a User gives up, by changing it or deleting the Account, is held for 30 days. During that time
          only the same Wallet can take it back.
        </li>
        <li>
          synt may change or remove Profile content, or reclaim a handle, that breaks this Article, after telling the
          User the reason.
        </li>
      </ol>

      <h2>Article 7. What Users may not do</h2>
      <p>Users may not:</p>
      <ol type="a">
        <li>use the Service for anything unlawful, including fraud or market manipulation;</li>
        <li>try to enter another person&apos;s Account;</li>
        <li>bypass rate limits, disrupt or overload synt&apos;s servers, or try to break their security;</li>
        <li>collect data from the Terminal automatically without synt&apos;s written permission;</li>
        <li>use the Terminal or a Profile to promote scams or mislead other Users;</li>
        <li>resell or rent out the Service without a written agreement with synt.</li>
      </ol>

      <h2>Article 8. Intellectual property</h2>
      <ol>
        <li>
          The Terminal, its program code, the Scores and the models behind them, the synt name and logo, and its design
          and content other than Profiles belong to PT Synt Tekno Multikarya.
        </li>
        <li>
          Program code that the browser downloads or that the public can see gives no permission to use, copy or
          change it, unless synt states a licence for it in writing.
        </li>
      </ol>

      <h2>Article 9. Third-party services</h2>
      <ol>
        <li>
          The Service depends on third parties, including blockchains, Wallets, blockchain data providers and
          exchanges. Their own terms apply when Users use them.
        </li>
        <li>A disruption at a third-party service can stop or delay some features. synt works to restore them as soon as possible.</li>
      </ol>

      <h2>Article 10. Availability of the Service</h2>
      <ol>
        <li>
          synt works to keep the Service available. The Service can stop for a while because of maintenance, network
          problems, server problems or other causes.
        </li>
        <li>
          If synt stops the Service for good, it tells Users at least 30 days beforehand and gives them the chance to
          ask for a copy of their Profile and watchlist.
        </li>
      </ol>

      <h2>Article 11. Responsibility</h2>
      <ol>
        <li>
          synt is responsible for losses that arise because synt did not carry out its obligations under Article 4, in
          line with the laws and regulations.
        </li>
        <li>A wrong Score that happens even though synt has carried out its obligations under Article 4 is not in itself negligence by synt.</li>
        <li>
          synt is not responsible for losses that arise solely because of:
          <ol type="a">
            <li>the User&apos;s decisions to buy, sell or hold tokens, as referred to in Article 3 paragraph (5);</li>
            <li>price movements, rug pulls or scams carried out by token creators or other third parties;</li>
            <li>blockchains, Wallets, networks or third-party services outside synt&apos;s control;</li>
            <li>the User breaking these Terms, or losing control of their Wallet;</li>
            <li>Force Majeure as referred to in Article 12.</li>
          </ol>
        </li>
        <li>Where a loss arises from synt&apos;s part and the User&apos;s part together, each party&apos;s responsibility is weighed according to the size of its part.</li>
        <li>
          Nothing in these Terms removes or limits any responsibility that by law cannot be removed or limited,
          including the User&apos;s rights under Law No. 8 of 1999 on Consumer Protection.
        </li>
      </ol>

      <h2>Article 12. Force majeure</h2>
      <p>
        synt is not considered at fault when it cannot carry out its obligations because of events beyond its
        reasonable control, including natural disasters, fire, widespread power or network outages, blockchain or data
        centre outages, riots, epidemics or government action. synt tells Users and works to restore the Service as soon
        as possible.
      </p>

      <h2>Article 13. Ending the agreement</h2>
      <ol>
        <li>
          A User can stop at any time by deleting the Account: My profile, then Edit profile, then Delete account. What
          happens to the data is set out in the Privacy Policy.
        </li>
        <li>
          synt may suspend or close an Account that breaks these Terms after telling the User and giving the reason. For
          a serious breach, or one that endangers other Users, synt may act first and then tell the User.
        </li>
      </ol>

      <h2>Article 14. Changes to these Terms</h2>
      <ol>
        <li>synt tells Users in the Terminal at least 14 days before an important change takes effect.</li>
        <li>
          A User who does not agree with a change may delete the Account before it takes effect. A User who keeps using
          the Service after the effective date is taken to agree to the change.
        </li>
      </ol>

      <h2>Article 15. Governing law and disputes</h2>
      <ol>
        <li>These Terms are governed by the law of the Republic of Indonesia.</li>
        <li>A dispute is first settled by deliberation (musyawarah) within 30 days of one party notifying the other in writing.</li>
        <li>
          If deliberation does not succeed, the dispute is settled through the competent district court or through the
          Consumer Dispute Settlement Agency (BPSK), in line with the laws and regulations.
        </li>
      </ol>

      <h2>Article 16. Language</h2>
      <p>These Terms are made in Indonesian and English. If the two differ, the Indonesian version applies.</p>

      <h2>Article 17. Other provisions</h2>
      <ol>
        <li>If one provision is found invalid, the other provisions still apply.</li>
        <li>If synt does not enforce a provision, that does not mean synt gives up its right.</li>
        <li>
          A User may not transfer their rights and obligations under these Terms without synt&apos;s consent. synt may
          transfer them in a merger, acquisition or change of business, after telling Users.
        </li>
      </ol>

      <h2>Article 18. Contact</h2>
      <p>
        PT Synt Tekno Multikarya
        <br />
        <Kontak baris />
      </p>
    </>
  )
}

export function SyaratId() {
  return (
    <>
      <section className="lg-ringkas" aria-label="Ringkasnya">
        <h2>Ringkasnya</h2>
        <ul>
          <li>
            synt adalah terminal analitik. Skornya adalah perkiraan otomatis dari data on-chain publik dan bisa salah.
            Skor bukan nasihat keuangan.
          </li>
          <li>Token baru dan memecoin sangat berisiko. Keputusan membeli atau menjual sepenuhnya milik Anda.</li>
          <li>synt tidak pernah memegang dana atau kunci Anda dan tidak pernah meminta seed phrase Anda.</li>
          <li>
            Anda bisa membeli dan menjual token dari terminal. Setiap transaksi Anda tanda tangani di wallet Anda
            sendiri, synt tidak memungut biaya, dan transaksi yang sudah terkonfirmasi tidak bisa dibatalkan.
          </li>
          <li>Pengguna wajib berusia 18 tahun ke atas.</li>
          <li>Ringkasan ini untuk memudahkan membaca; pasal-pasal di bawah yang berlaku.</li>
        </ul>
      </section>

      <p>
        Syarat Penggunaan ini (&quot;Syarat&quot;) adalah perjanjian antara PT Synt Tekno Multikarya (&quot;synt&quot;)
        dan setiap orang yang memakai terminal synt (&quot;Pengguna&quot;).
      </p>
      <p>
        Pengguna menyetujui Syarat ini dan <Link to="/privacy">Kebijakan Privasi</Link> synt dengan memakai Terminal
        atau dengan masuk. Pengguna yang tidak setuju tidak boleh memakai Layanan.
      </p>

      <h2>Pasal 1. Definisi</h2>
      <ol>
        <li>Terminal: terminal synt di synt.fun beserta subdomainnya.</li>
        <li>Layanan: setiap fungsi yang tersedia melalui Terminal.</li>
        <li>
          Akun: akun yang dibuat dengan menandatangani pesan masuk menggunakan Wallet. Setiap alamat wallet adalah Akun
          tersendiri: alamat Solana dan alamat 0x (EVM) adalah dua Akun terpisah, meskipun berada di Wallet yang sama.
        </li>
        <li>Wallet: dompet kripto yang dikendalikan Pengguna, seperti MetaMask, Phantom, Solflare atau Backpack.</li>
        <li>Skor: skor, tingkat, label, base rate, peringkat dan penjelasan yang ditampilkan Terminal tentang token.</li>
        <li>Profil: handle, nama tampilan dan bio yang ditulis Pengguna.</li>
        <li>Kebijakan Privasi: kebijakan privasi synt di synt.fun/privacy, yang merupakan bagian dari Syarat ini.</li>
      </ol>

      <h2>Pasal 2. Layanan</h2>
      <ol>
        <li>
          Layanan menampilkan data pasar dan Skor untuk token baru di Solana dan BNB Chain, yang disusun dari data
          on-chain publik, dan memungkinkan Pengguna yang masuk membeli dan menjual token Solana dan BNB Chain lewat
          Wallet-nya sendiri.
        </li>
        <li>
          Layanan saat ini gratis. Bila synt menawarkan fitur berbayar, synt akan mengumumkan harga dan ketentuannya
          sebelum berlaku. synt tidak akan menagih Pengguna tanpa persetujuan Pengguna.
        </li>
        <li>synt dapat menambah, mengubah atau menghapus fitur untuk memperbaiki Layanan.</li>
        <li>
          Notifikasi tentang token di watchlist bergantung pada ketersediaan data. Notifikasi bisa terlambat atau tidak
          terkirim, dan bukan sinyal untuk membeli atau menjual.
        </li>
      </ol>

      <h2>Pasal 3. Apa itu Skor: alat bantu analisis</h2>
      <ol>
        <li>
          Skor adalah alat bantu analisis. Skor bukan nasihat investasi, keuangan, hukum atau pajak, dan bukan anjuran
          untuk membeli, menjual atau menahan token apa pun.
        </li>
        <li>
          Skor adalah perkiraan otomatis dari aturan dan model yang dikalibrasi dengan data masa lalu. Base rate
          menggambarkan apa yang terjadi pada token serupa di masa lalu; base rate tidak menjanjikan apa yang akan
          terjadi.
        </li>
        <li>Skor bisa salah, terlambat atau tidak lengkap, terutama saat data on-chain tertunda atau penyedia data terganggu.</li>
        <li>Token baru dan memecoin sangat berisiko. Banyak yang kehilangan seluruh nilainya, dan sebagian dibuat untuk menipu pembeli.</li>
        <li>Keputusan membeli, menjual atau menahan token adalah keputusan Pengguna.</li>
        <li>synt tidak menjamin harga, keuntungan atau hasil apa pun, dan tidak menjamin bahwa sebuah token aman.</li>
      </ol>

      <h2>Pasal 4. Kewajiban synt</h2>
      <ol>
        <li>
          synt wajib menjalankan Layanan dengan kehati-hatian yang wajar, termasuk:
          <ol type="a">
            <li>menampilkan rincian Skor bersama base rate historisnya, supaya Skor tidak dibaca sebagai jaminan;</li>
            <li>menandai data contoh dan bagian Terminal yang masih dikembangkan;</li>
            <li>tidak pernah meminta seed phrase atau kunci privat, dan tidak pernah memindahkan dana tanpa tanda tangan Pengguna sendiri di Wallet-nya;</li>
            <li>memperbaiki kesalahan Layanan yang dilaporkan kepada atau ditemukan oleh synt dalam waktu yang wajar;</li>
            <li>memberi tahu Pengguna di Terminal bila synt mengetahui gangguan yang memengaruhi data yang ditampilkan.</li>
          </ol>
        </li>
        <li>Kewajiban synt adalah berupaya sebaik-baiknya sebagaimana diatur pada ayat (1), bukan menjamin hasil tertentu.</li>
      </ol>

      <h2>Pasal 5. Wallet dan Akun</h2>
      <ol>
        <li>Pengguna wajib berusia 18 tahun ke atas.</li>
        <li>
          synt bersifat non-kustodial. synt tidak pernah memegang dana, kunci privat atau seed phrase Pengguna. Masuk
          berarti menandatangani pesan teks; itu bukan transaksi dan tidak dikenai biaya.
        </li>
        <li>
          Siapa pun yang mengendalikan sebuah Wallet mengendalikan Akunnya. Menjaga keamanan Wallet dan perangkat adalah
          tanggung jawab Pengguna, kecuali kerugian terjadi karena kesalahan synt.
        </li>
        <li>Satu Wallet memiliki satu Akun.</li>
        <li>
          Transaksi. synt menyiapkan setiap pembelian atau penjualan, mengujinya sebelum ditampilkan, dan menampilkan
          perkiraan hasilnya. Di Solana transaksi disusun lewat router swap pihak ketiga (saat ini Jupiter); Pengguna
          menandatanganinya di Wallet Pengguna sendiri dan synt meneruskan transaksi yang sudah ditandatangani ke
          jaringan. Di BNB Chain transaksi langsung menuju kontrak launchpad (four.meme atau Flap.sh) atau lewat router
          swap pihak ketiga (saat ini KyberSwap), dan Wallet Pengguna sendiri yang mengirimnya. synt tidak bisa
          menandatangani, mengubah atau membatalkan transaksi, dan tidak pernah memindahkan dana tanpa tanda tangan
          Pengguna.
        </li>
        <li>
          Di BNB Chain, menjual token lebih dulu membutuhkan persetujuan (approval) yang mengizinkan kontrak memakai
          tepat sebesar jumlah yang dijual. Persetujuan itu transaksi tersendiri dan dikenai biaya gas. Sebelum
          pembelian, synt menguji penjualan kembali token tersebut; uji itu perkiraan dan tidak menjamin token bisa
          dijual di kemudian hari.
        </li>
        <li>
          Kutipan harga adalah perkiraan. Harga bergerak antara kutipan dan konfirmasi, sehingga jumlah yang diterima
          bisa lebih kecil dari perkiraan, sampai batas minimum yang ditampilkan untuk slippage pilihan Pengguna.
          Transaksi bisa gagal atau kedaluwarsa, dan transaksi yang gagal tetap bisa dikenai biaya jaringan.
        </li>
        <li>
          synt tidak memungut biaya transaksi. Biaya jaringan, prioritas dan gas, sewa akun token, pajak token, serta
          biaya protokol dan pool yang terlibat, misalnya biaya trading launchpad, tetap berlaku dan dibayar dari Wallet
          Pengguna.
        </li>
        <li>Transaksi blockchain bersifat final setelah terkonfirmasi. synt tidak bisa membatalkan atau mengembalikannya.</li>
        <li>
          Pengguna hanya boleh bertransaksi bila hukum yang berlaku baginya mengizinkan, dan bertanggung jawab atas
          pajak serta pelaporan atas transaksinya.
        </li>
      </ol>

      <h2>Pasal 6. Profil</h2>
      <ol>
        <li>Pengguna tetap memiliki Profilnya.</li>
        <li>
          Pengguna memberi synt izin terbatas, non-eksklusif dan tanpa royalti untuk menyimpan dan menampilkan Profilnya
          di Terminal. Izin ini hanya untuk menjalankan Layanan dan berakhir saat Profil dihapus.
        </li>
        <li>
          Profil tidak boleh menyamar sebagai synt, timnya, proyek lain atau orang lain; tidak boleh mempromosikan
          penipuan, giveaway palsu atau token secara menyesatkan; tidak boleh memuat konten yang melanggar hukum,
          bernada kebencian, melecehkan atau bermuatan seksual eksplisit; dan tidak boleh melanggar hak orang lain.
        </li>
        <li>
          Handle yang dilepas Pengguna, dengan menggantinya atau menghapus Akun, ditahan selama 30 hari. Selama masa itu
          hanya Wallet yang sama yang dapat mengambilnya kembali.
        </li>
        <li>
          synt dapat mengubah atau menghapus isi Profil, atau mengambil kembali handle, yang melanggar Pasal ini,
          setelah memberi tahu Pengguna alasannya.
        </li>
      </ol>

      <h2>Pasal 7. Larangan bagi Pengguna</h2>
      <p>Pengguna dilarang:</p>
      <ol type="a">
        <li>memakai Layanan untuk hal yang melanggar hukum, termasuk penipuan atau manipulasi pasar;</li>
        <li>mencoba masuk ke Akun orang lain;</li>
        <li>mengakali pembatasan laju, mengganggu atau membebani server synt, atau mencoba membobol keamanannya;</li>
        <li>mengambil data dari Terminal secara otomatis tanpa izin tertulis dari synt;</li>
        <li>memakai Terminal atau Profil untuk mempromosikan penipuan atau menyesatkan Pengguna lain;</li>
        <li>menjual kembali atau menyewakan Layanan tanpa perjanjian tertulis dengan synt.</li>
      </ol>

      <h2>Pasal 8. Kekayaan intelektual</h2>
      <ol>
        <li>
          Terminal, kode programnya, Skor beserta model di baliknya, nama dan logo synt, serta desain dan kontennya
          selain Profil adalah milik PT Synt Tekno Multikarya.
        </li>
        <li>
          Kode program yang diunduh browser atau dapat dilihat publik tidak memberi izin untuk memakai, menyalin atau
          mengubahnya, kecuali synt menyatakan lisensinya secara tertulis.
        </li>
      </ol>

      <h2>Pasal 9. Layanan pihak ketiga</h2>
      <ol>
        <li>
          Layanan bergantung pada pihak ketiga, termasuk blockchain, Wallet, penyedia data blockchain dan bursa.
          Ketentuan mereka sendiri berlaku saat Pengguna memakainya.
        </li>
        <li>Gangguan pada layanan pihak ketiga dapat menghentikan atau menunda sebagian fitur. synt berupaya memulihkannya secepat mungkin.</li>
      </ol>

      <h2>Pasal 10. Ketersediaan Layanan</h2>
      <ol>
        <li>
          synt berupaya menjaga Layanan tetap tersedia. Layanan dapat berhenti sementara karena pemeliharaan, masalah
          jaringan, masalah server atau sebab lain.
        </li>
        <li>
          Bila synt menghentikan Layanan untuk seterusnya, synt memberi tahu Pengguna paling lambat 30 hari sebelumnya
          dan memberi kesempatan meminta salinan Profil dan watchlist.
        </li>
      </ol>

      <h2>Pasal 11. Tanggung jawab</h2>
      <ol>
        <li>
          synt bertanggung jawab atas kerugian yang timbul karena synt tidak menjalankan kewajibannya berdasarkan Pasal
          4, sesuai peraturan perundang-undangan.
        </li>
        <li>Skor yang keliru meskipun synt telah menjalankan kewajibannya berdasarkan Pasal 4 tidak dengan sendirinya merupakan kelalaian synt.</li>
        <li>
          synt tidak bertanggung jawab atas kerugian yang timbul semata-mata karena:
          <ol type="a">
            <li>keputusan Pengguna membeli, menjual atau menahan token, sebagaimana dimaksud Pasal 3 ayat (5);</li>
            <li>pergerakan harga, rug pull atau penipuan yang dilakukan pembuat token atau pihak ketiga lain;</li>
            <li>blockchain, Wallet, jaringan atau layanan pihak ketiga di luar kendali synt;</li>
            <li>Pengguna melanggar Syarat ini, atau kehilangan kendali atas Wallet-nya;</li>
            <li>Keadaan Kahar sebagaimana dimaksud Pasal 12.</li>
          </ol>
        </li>
        <li>Bila kerugian timbul dari bagian synt dan bagian Pengguna bersama-sama, tanggung jawab masing-masing ditimbang sesuai besar bagiannya.</li>
        <li>
          Tidak ada ketentuan dalam Syarat ini yang menghapus atau membatasi tanggung jawab yang menurut hukum tidak
          dapat dihapus atau dibatasi, termasuk hak Pengguna berdasarkan Undang-Undang Nomor 8 Tahun 1999 tentang
          Perlindungan Konsumen.
        </li>
      </ol>

      <h2>Pasal 12. Keadaan kahar</h2>
      <p>
        synt tidak dianggap lalai bila tidak dapat menjalankan kewajibannya karena peristiwa di luar kendali wajarnya,
        termasuk bencana alam, kebakaran, gangguan listrik atau jaringan yang luas, gangguan blockchain atau pusat data,
        kerusuhan, wabah atau tindakan pemerintah. synt memberi tahu Pengguna dan berupaya memulihkan Layanan secepat
        mungkin.
      </p>

      <h2>Pasal 13. Berakhirnya perjanjian</h2>
      <ol>
        <li>
          Pengguna dapat berhenti kapan saja dengan menghapus Akun: My profile, lalu Edit profile, lalu Delete account.
          Apa yang terjadi pada data diatur dalam Kebijakan Privasi.
        </li>
        <li>
          synt dapat menangguhkan atau menutup Akun yang melanggar Syarat ini setelah memberi tahu Pengguna dan
          alasannya. Untuk pelanggaran berat, atau yang membahayakan Pengguna lain, synt dapat bertindak lebih dulu lalu
          memberi tahu Pengguna.
        </li>
      </ol>

      <h2>Pasal 14. Perubahan Syarat</h2>
      <ol>
        <li>synt memberi tahu Pengguna di Terminal paling lambat 14 hari sebelum perubahan penting berlaku.</li>
        <li>
          Pengguna yang tidak setuju dengan perubahan dapat menghapus Akun sebelum perubahan berlaku. Pengguna yang tetap
          memakai Layanan setelah tanggal berlaku dianggap menyetujui perubahan tersebut.
        </li>
      </ol>

      <h2>Pasal 15. Hukum yang berlaku dan penyelesaian sengketa</h2>
      <ol>
        <li>Syarat ini tunduk pada hukum Negara Republik Indonesia.</li>
        <li>Sengketa diselesaikan lebih dulu secara musyawarah dalam 30 hari sejak salah satu pihak memberi tahu pihak lain secara tertulis.</li>
        <li>
          Bila musyawarah tidak berhasil, sengketa diselesaikan melalui pengadilan negeri yang berwenang atau melalui
          Badan Penyelesaian Sengketa Konsumen (BPSK), sesuai peraturan perundang-undangan.
        </li>
      </ol>

      <h2>Pasal 16. Bahasa</h2>
      <p>Syarat ini dibuat dalam bahasa Indonesia dan bahasa Inggris. Bila keduanya berbeda, versi bahasa Indonesia yang berlaku.</p>

      <h2>Pasal 17. Ketentuan lain</h2>
      <ol>
        <li>Bila satu ketentuan dinyatakan tidak sah, ketentuan lain tetap berlaku.</li>
        <li>Bila synt tidak menegakkan suatu ketentuan, itu tidak berarti synt melepaskan haknya.</li>
        <li>
          Pengguna tidak boleh mengalihkan hak dan kewajibannya berdasarkan Syarat ini tanpa persetujuan synt. synt dapat
          mengalihkannya dalam penggabungan, akuisisi atau perubahan usaha, setelah memberi tahu Pengguna.
        </li>
      </ol>

      <h2>Pasal 18. Kontak</h2>
      <p>
        PT Synt Tekno Multikarya
        <br />
        <Kontak id baris />
      </p>
    </>
  )
}
