import { Link } from 'react-router-dom'
import { Kontak } from './bersama'

/*
 * Kebijakan Privasi — isi EN & ID. Struktur & gaya mengikuti eel.synt.fun/privasi (synteel).
 * Pengelola = Muhammad Fajar Nugraha (perorangan) sejak 10 Nov; synt BUKAN milik PT Synt Tekno Multikarya (PT hanya synteel).
 * ⚠️ Tiap kalimat = janji yang harus cocok dgn sistem (lihat komentar di ../Legal.tsx). ⛔ Tanpa em dash.
 */

export function PrivasiEn() {
  return (
    <>
      <section className="lg-ringkas" aria-label="In short">
        <h2>In short</h2>
        <ul>
          <li>You can use the terminal without an account. synt does not ask who you are.</li>
          <li>
            If you sign in, synt keeps your wallet address, the profile you write, your watchlist, who you follow,
            your alerts, your terminal settings and the trades you make on synt. Nothing else about you, apart from
            support requests you choose to send.
          </li>
          <li>
            synt never sees your private key or seed phrase. Signing in never moves funds, and a trade moves funds
            only after you sign it in your wallet.
          </li>
          <li>synt does not sell data, shows no ads and uses no tracking tools.</li>
          <li>You can delete your account in the terminal: My profile, then Edit profile, then Delete account.</li>
        </ul>
      </section>

      <h2>1. Who manages the data</h2>
      <p>
        Muhammad Fajar Nugraha, an individual in Indonesia, runs the synt terminal at synt.fun and its subdomains. In
        this policy, &quot;synt&quot; means Muhammad Fajar Nugraha.
      </p>
      <p>
        This policy follows Indonesian Law No. 27 of 2022 on Personal Data Protection (UU PDP) and is part of the synt{' '}
        <Link to="/terms">Terms of Use</Link>.
      </p>
      <p>
        Contact for anything about personal data: <Kontak />.
      </p>

      <h2>2. What data synt collects</h2>
      <h3>Without an account</h3>
      <p>
        Nothing that identifies you. Your preferences stay on your device (section 6). When you look up a wallet in the
        wallet tracker, the address goes to synt&apos;s servers and to blockchain data providers only to fetch its public
        on-chain data. synt does not save the addresses you look up or link them to you.
      </p>
      <h3>With an account</h3>
      <div className="lg-tabel-wadah">
        <table className="lg-tabel">
          <thead>
            <tr>
              <th>Data</th>
              <th>Why</th>
              <th>How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Data">Wallet address: a Solana address or a 0x (EVM) address, depending on how you sign in (public)</td>
              <td data-label="Why">Identifies your account</td>
              <td data-label="How long">While the account exists</td>
            </tr>
            <tr>
              <td data-label="Data">Handle, display name and bio you choose</td>
              <td data-label="Why">Your public profile</td>
              <td data-label="How long">Until you change them or delete the account</td>
            </tr>
            <tr>
              <td data-label="Data">Date you joined and your last sign-in time</td>
              <td data-label="Why">Shown as &quot;joined&quot;, and to spot account misuse</td>
              <td data-label="How long">While the account exists</td>
            </tr>
            <tr>
              <td data-label="Data">Watchlist: the token addresses you star</td>
              <td data-label="Why">The same watchlist on every device you sign in on</td>
              <td data-label="How long">Until you remove them or delete the account</td>
            </tr>
            <tr>
              <td data-label="Data">Terminal settings: notification switches, display and quick buy presets</td>
              <td data-label="Why">The same settings on every device</td>
              <td data-label="How long">While the account exists</td>
            </tr>
            <tr>
              <td data-label="Data">
                Trades you make on synt: token, buy or sell, amounts, the quote, transaction signature or hash, status and the
                actual change in your wallet balance (the transaction itself is public on-chain)
              </td>
              <td data-label="Why">Shows the trade status, your positions and your trade history</td>
              <td data-label="How long">While the account exists; a prepared trade you never sign is removed after 1 day</td>
            </tr>
            <tr>
              <td data-label="Data">Who you follow</td>
              <td data-label="Why">Follower and following counts on profiles</td>
              <td data-label="How long">Until you unfollow or either account is deleted</td>
            </tr>
            <tr>
              <td data-label="Data">Alerts and messages: watchlist alerts, new followers and messages from synt</td>
              <td data-label="Why">Your notifications and messages in the terminal</td>
              <td data-label="How long">30 days, at most the newest 100</td>
            </tr>
            <tr>
              <td data-label="Data">Sign-in session: a one-way hash of the session token, with its start, expiry and last-used time</td>
              <td data-label="Why">Keeps you signed in</td>
              <td data-label="How long">30 days, or until you sign out</td>
            </tr>
            <tr>
              <td data-label="Data">The one-time sign-in message your wallet signs</td>
              <td data-label="Why">Proves the request came from your wallet, once</td>
              <td data-label="How long">Used once, removed within 20 minutes</td>
            </tr>
            <tr>
              <td data-label="Data">A handle you gave up, with a one-way hash of your wallet address</td>
              <td data-label="Why">Stops someone else taking it right away; only your wallet can take it back</td>
              <td data-label="How long">30 days</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Support requests</h3>
      <p>
        When you send a request from Help &amp; support, synt keeps the topic, your message and the contact you write
        (required only when you are not signed in). The form also attaches, and shows you before sending: the page you
        were on, the token on that page, your last trade on synt in that browser tab (its status, error and transaction
        signature), your wallet address when you are signed in, the terminal version and your screen size. You can
        remove any of these before sending. A request from a signed-in user is linked to the account so the reply can
        arrive in Messages. Requests are forwarded to the synt team&apos;s private Telegram chat.
      </p>
      <h3>Technical data</h3>
      <p>
        A sign-in cookie (<code>__Host-synt_sesi</code>, httpOnly, HTTPS only) that keeps you signed in. The server
        uses your IP address for a short time to limit repeated sign-in attempts and changes; it holds these counts in
        memory, not in the database. Server logs record technical events without profile content: sign-ins and account
        deletions by an internal account number, and errors.
      </p>

      <h2>3. What synt uses the data for</h2>
      <ul>
        <li>Running your account and your public profile.</li>
        <li>Keeping your watchlist and settings the same across your devices.</li>
        <li>Alerting you when a token on your watchlist changes score or moves in price, and sending messages from synt.</li>
        <li>Keeping the service secure and stopping abuse.</li>
        <li>Answering your messages to support.</li>
      </ul>
      <p>
        synt processes this data on the basis of your consent when you sign in and use a feature, and to provide the
        service you ask for. synt does not sell data, does not use it for ads, does not send it to AI services and does
        not use it to train AI models.
      </p>

      <h2>4. What is public</h2>
      <p>
        Your handle, display name, bio, join date, follower and following counts and a shortened form of your wallet
        address appear on your public profile. When you follow someone who has turned on Social alerts, they get an
        alert with your display name or handle. Your full wallet address, watchlist, settings and alerts are not shown
        to anyone else. Wallet addresses and
        their history are public on the blockchain itself, so anyone who already knows your address can see its
        on-chain activity, with or without synt.
      </p>

      <h2>5. Who else receives data</h2>
      <p>synt uses these services to run the terminal. Each receives only what it needs:</p>
      <ul>
        <li>
          <strong>Akamai (Linode)</strong>: the server in Singapore that holds the account database.
        </li>
        <li>
          <strong>Cloudflare</strong>: sits in front of the terminal, handles IP addresses and network traffic, and
          stores the encrypted database backups.
        </li>
        <li>
          <strong>Blockchain data providers (RPC services)</strong>: receive token and wallet addresses to return public
          on-chain data, and the transactions you sign so they reach the network. They never receive your account or
          profile.
        </li>
        <li>
          <strong>Jupiter</strong> (swap router): receives your wallet address, the token and the amount to build a
          trade route and quote, and token addresses to return names and prices for your positions.
        </li>
        <li>
          <strong>KyberSwap</strong> (swap router, BNB Chain): receives your wallet address, the token and the amount to
          build a trade route for tokens that already trade on a DEX.
        </li>
        <li>
          <strong>Telegram</strong>: carries support requests to the synt team&apos;s private chat, with the details
          listed under Support requests.
        </li>
        <li>
          <strong>Authorities</strong>, when a valid legal request requires it.
        </li>
        <li>
          <strong>A successor company</strong>, if synt is merged, acquired or its business is transferred. synt tells
          users in the terminal before it happens, and this policy, or one at least as protective, keeps applying.
        </li>
      </ul>
      <p>These providers may process data on servers outside Indonesia, and each has its own privacy policy.</p>

      <h2>6. Data kept only on your device</h2>
      <p>
        When you are not signed in, your watchlist, settings, quick buy presets, panel layout and dismissed notices are
        saved in your browser&apos;s local storage and never sent to synt. Signing out removes the watchlist from the
        device, since the device may be shared; settings stay. Clearing the browser&apos;s site data removes all of it.
      </p>

      <h2>7. How long data is kept</h2>
      <ul>
        <li>Account, profile, watchlist, follows and settings: while the account exists.</li>
        <li>Alerts and messages: 30 days, at most the newest 100.</li>
        <li>Sign-in: 30 days. Signing out ends it.</li>
        <li>Sign-in messages: removed within 20 minutes.</li>
        <li>A handle you gave up: held for 30 days.</li>
        <li>Support requests: 90 days, or until the account is deleted.</li>
        <li>Database backups: up to 35 days.</li>
      </ul>

      <h2>8. Deleting an account</h2>
      <p>
        In the terminal: My profile, then Edit profile, then Delete account, and confirm. synt deletes your profile,
        watchlist, follows, alerts, settings, trade history, support requests and every sign-in session at once. Trades already on the
        blockchain stay there, as every blockchain transaction does. Your handle is held for 30 days so that nobody else can
        take it right away. Deleted data disappears from the backups within 35 days at most. Signing in again later
        with the same wallet starts a new, empty account.
      </p>

      <h2>9. Your rights</h2>
      <p>
        Under UU PDP you may ask synt to show, copy, correct or delete your personal data, may withdraw your consent and
        may object to processing. You can see, correct and delete everything yourself in the terminal. For anything
        else, write to <Kontak />. synt replies within 3 x 24 hours, as UU PDP requires.
      </p>

      <h2>10. Security</h2>
      <p>
        The terminal uses HTTPS. synt stores sign-in sessions only as one-way hashes, every change to an account must
        come from the synt terminal itself, and the account service runs apart from synt&apos;s other systems, with its
        own database, on a server synt manages itself. No system is free of risk. If a data breach affects users, synt
        will tell the affected users and the authority as UU PDP requires.
      </p>

      <h2>11. Age</h2>
      <p>synt is for people aged 18 or older. synt does not knowingly keep data about anyone younger.</p>

      <h2>12. Changes to this policy</h2>
      <p>synt updates the date at the top when this policy changes, and announces bigger changes in the terminal.</p>

      <h2>13. Contact</h2>
      <p>
        Muhammad Fajar Nugraha
        <br />
        <Kontak baris />
      </p>
    </>
  )
}

export function PrivasiId() {
  return (
    <>
      <section className="lg-ringkas" aria-label="Ringkasnya">
        <h2>Ringkasnya</h2>
        <ul>
          <li>Terminal bisa dipakai tanpa akun. synt tidak menanyakan siapa Anda.</li>
          <li>
            Bila Anda masuk, synt menyimpan alamat wallet, profil yang Anda tulis, watchlist, siapa yang Anda ikuti,
            notifikasi, pengaturan terminal dan transaksi yang Anda lakukan di synt. Tidak ada data lain tentang Anda,
            selain permintaan bantuan yang Anda kirim sendiri.
          </li>
          <li>
            synt tidak pernah melihat kunci privat atau seed phrase Anda. Masuk tidak pernah memindahkan dana, dan
            transaksi baru memindahkan dana setelah Anda menandatanganinya di wallet Anda.
          </li>
          <li>synt tidak menjual data, tidak menampilkan iklan dan tidak memakai alat pelacak.</li>
          <li>Akun bisa dihapus sendiri di terminal: My profile, lalu Edit profile, lalu Delete account.</li>
        </ul>
      </section>

      <h2>1. Siapa yang mengelola data</h2>
      <p>
        Muhammad Fajar Nugraha, perorangan di Indonesia, menjalankan terminal synt di synt.fun beserta subdomainnya.
        Dalam kebijakan ini, &quot;synt&quot; berarti Muhammad Fajar Nugraha.
      </p>
      <p>
        Kebijakan ini mengikuti Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) dan menjadi
        bagian dari <Link to="/terms">Syarat Penggunaan</Link> synt.
      </p>
      <p>
        Kontak untuk segala hal tentang data pribadi: <Kontak id />.
      </p>

      <h2>2. Data yang dikumpulkan synt</h2>
      <h3>Tanpa akun</h3>
      <p>
        Tidak ada yang mengenali Anda. Preferensi Anda tetap di perangkat (bagian 6). Saat Anda mencari sebuah wallet di
        wallet tracker, alamatnya dikirim ke server synt dan ke penyedia data blockchain hanya untuk mengambil data
        on-chain publiknya. synt tidak menyimpan alamat yang Anda cari dan tidak mengaitkannya dengan Anda.
      </p>
      <h3>Dengan akun</h3>
      <div className="lg-tabel-wadah">
        <table className="lg-tabel">
          <thead>
            <tr>
              <th>Data</th>
              <th>Untuk apa</th>
              <th>Berapa lama</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Data">Alamat wallet: alamat Solana atau alamat 0x (EVM), sesuai cara Anda masuk (publik)</td>
              <td data-label="Untuk apa">Mengenali akun Anda</td>
              <td data-label="Berapa lama">Selama akun ada</td>
            </tr>
            <tr>
              <td data-label="Data">Handle, nama tampilan dan bio pilihan Anda</td>
              <td data-label="Untuk apa">Profil publik Anda</td>
              <td data-label="Berapa lama">Sampai Anda mengubahnya atau menghapus akun</td>
            </tr>
            <tr>
              <td data-label="Data">Tanggal bergabung dan waktu masuk terakhir</td>
              <td data-label="Untuk apa">Ditampilkan sebagai &quot;joined&quot;, dan untuk mengenali penyalahgunaan akun</td>
              <td data-label="Berapa lama">Selama akun ada</td>
            </tr>
            <tr>
              <td data-label="Data">Watchlist: alamat token yang Anda beri bintang</td>
              <td data-label="Untuk apa">Watchlist yang sama di setiap perangkat tempat Anda masuk</td>
              <td data-label="Berapa lama">Sampai Anda menghapusnya atau menghapus akun</td>
            </tr>
            <tr>
              <td data-label="Data">Pengaturan terminal: tombol notifikasi, tampilan dan preset quick buy</td>
              <td data-label="Untuk apa">Pengaturan yang sama di setiap perangkat</td>
              <td data-label="Berapa lama">Selama akun ada</td>
            </tr>
            <tr>
              <td data-label="Data">
                Transaksi yang Anda lakukan di synt: token, beli atau jual, jumlah, kutipan, tanda tangan atau hash transaksi,
                status dan perubahan saldo wallet yang sebenarnya (transaksinya sendiri publik di blockchain)
              </td>
              <td data-label="Untuk apa">Menampilkan status transaksi, posisi dan riwayat transaksi Anda</td>
              <td data-label="Berapa lama">Selama akun ada; transaksi yang disiapkan tapi tak pernah ditandatangani dihapus setelah 1 hari</td>
            </tr>
            <tr>
              <td data-label="Data">Siapa yang Anda ikuti</td>
              <td data-label="Untuk apa">Jumlah pengikut dan yang diikuti di profil</td>
              <td data-label="Berapa lama">Sampai Anda berhenti mengikuti atau salah satu akun dihapus</td>
            </tr>
            <tr>
              <td data-label="Data">Notifikasi dan pesan: peringatan watchlist, pengikut baru dan pesan dari synt</td>
              <td data-label="Untuk apa">Notifikasi dan pesan Anda di terminal</td>
              <td data-label="Berapa lama">30 hari, paling banyak 100 terbaru</td>
            </tr>
            <tr>
              <td data-label="Data">Sesi masuk: hash satu arah dari token sesi, dengan waktu mulai, kedaluwarsa dan terakhir dipakai</td>
              <td data-label="Untuk apa">Menjaga Anda tetap masuk</td>
              <td data-label="Berapa lama">30 hari, atau sampai Anda keluar</td>
            </tr>
            <tr>
              <td data-label="Data">Pesan masuk sekali pakai yang ditandatangani wallet Anda</td>
              <td data-label="Untuk apa">Membuktikan permintaan datang dari wallet Anda, satu kali</td>
              <td data-label="Berapa lama">Dipakai sekali, dihapus dalam 20 menit</td>
            </tr>
            <tr>
              <td data-label="Data">Handle yang Anda lepas, dengan hash satu arah dari alamat wallet Anda</td>
              <td data-label="Untuk apa">Mencegah orang lain langsung mengambilnya; hanya wallet Anda yang bisa mengambilnya kembali</td>
              <td data-label="Berapa lama">30 hari</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Permintaan bantuan</h3>
      <p>
        Saat Anda mengirim permintaan lewat Help &amp; support, synt menyimpan topik, pesan dan kontak yang Anda tulis
        (wajib hanya bila Anda tidak masuk). Form juga melampirkan, dan menampilkannya sebelum dikirim: halaman yang
        sedang dibuka, token di halaman itu, transaksi terakhir Anda di synt pada tab browser tersebut (status, galat dan
        tanda tangan transaksinya), alamat wallet bila Anda masuk, versi terminal dan ukuran layar. Setiap lampiran bisa
        dilepas sebelum dikirim. Permintaan dari pengguna yang masuk ditautkan ke akunnya supaya balasan sampai di
        Messages. Permintaan diteruskan ke chat Telegram privat tim synt.
      </p>
      <h3>Data teknis</h3>
      <p>
        Cookie masuk (<code>__Host-synt_sesi</code>, httpOnly, hanya lewat HTTPS) yang menjaga Anda tetap masuk. Server
        memakai alamat IP sebentar untuk membatasi percobaan masuk dan perubahan yang berulang; hitungan itu disimpan di
        memori, tidak di database. Log server mencatat kejadian teknis tanpa isi profil: masuk dan penghapusan akun
        dengan nomor akun internal, serta galat.
      </p>

      <h2>3. Untuk apa synt memakai data</h2>
      <ul>
        <li>Menjalankan akun dan profil publik Anda.</li>
        <li>Menjaga watchlist dan pengaturan Anda tetap sama di semua perangkat.</li>
        <li>Memberi tahu Anda saat skor atau harga token di watchlist Anda berubah, dan mengirim pesan dari synt.</li>
        <li>Menjaga keamanan layanan dan mencegah penyalahgunaan.</li>
        <li>Menjawab pesan Anda ke dukungan.</li>
      </ul>
      <p>
        synt memproses data ini atas dasar persetujuan Anda saat masuk dan memakai sebuah fitur, serta untuk memberikan
        layanan yang Anda minta. synt tidak menjual data, tidak memakainya untuk iklan, tidak mengirimnya ke layanan AI
        dan tidak memakainya untuk melatih model AI.
      </p>

      <h2>4. Apa yang publik</h2>
      <p>
        Handle, nama tampilan, bio, tanggal bergabung, jumlah pengikut dan yang diikuti, serta alamat wallet versi
        pendek tampil di profil publik Anda. Saat Anda mengikuti seseorang yang menyalakan notifikasi Social, ia
        menerima notifikasi berisi nama tampilan atau handle Anda. Alamat wallet lengkap, watchlist, pengaturan dan
        notifikasi Anda tidak ditampilkan kepada siapa pun. Alamat wallet dan riwayatnya
        bersifat publik di blockchain itu sendiri, jadi siapa pun yang sudah tahu alamat Anda bisa melihat aktivitas
        on-chain-nya, dengan atau tanpa synt.
      </p>

      <h2>5. Siapa lagi yang menerima data</h2>
      <p>synt memakai layanan berikut untuk menjalankan terminal. Masing-masing hanya menerima yang dibutuhkannya:</p>
      <ul>
        <li>
          <strong>Akamai (Linode)</strong>: server di Singapura yang menyimpan database akun.
        </li>
        <li>
          <strong>Cloudflare</strong>: berada di depan terminal, menangani alamat IP dan lalu lintas jaringan, serta
          menyimpan cadangan database yang terenkripsi.
        </li>
        <li>
          <strong>Penyedia data blockchain (layanan RPC)</strong>: menerima alamat token dan wallet untuk mengembalikan
          data on-chain publik, serta transaksi yang Anda tanda tangani supaya sampai ke jaringan. Mereka tidak pernah
          menerima akun atau profil Anda.
        </li>
        <li>
          <strong>Jupiter</strong> (router swap): menerima alamat wallet, token dan jumlah untuk menyusun rute dan
          kutipan transaksi, serta alamat token untuk mengembalikan nama dan harga posisi Anda.
        </li>
        <li>
          <strong>KyberSwap</strong> (router swap, BNB Chain): menerima alamat wallet, token dan jumlah untuk menyusun
          rute transaksi bagi token yang sudah diperdagangkan di DEX.
        </li>
        <li>
          <strong>Telegram</strong>: membawa permintaan bantuan ke chat privat tim synt, dengan rincian yang disebut di
          bagian Permintaan bantuan.
        </li>
        <li>
          <strong>Aparat berwenang</strong>, bila ada permintaan hukum yang sah.
        </li>
        <li>
          <strong>Perusahaan penerus</strong>, bila synt digabung, diakuisisi atau usahanya dialihkan. synt
          memberitahukannya di terminal sebelum terjadi, dan kebijakan ini, atau kebijakan yang setidaknya sama
          melindunginya, tetap berlaku.
        </li>
      </ul>
      <p>Penyedia ini bisa memproses data di server di luar Indonesia, dan masing-masing punya kebijakan privasi sendiri.</p>

      <h2>6. Data yang hanya ada di perangkat Anda</h2>
      <p>
        Saat Anda tidak masuk, watchlist, pengaturan, preset quick buy, tata letak panel dan pemberitahuan yang sudah
        ditutup disimpan di penyimpanan lokal browser dan tidak pernah dikirim ke synt. Keluar dari akun menghapus
        watchlist dari perangkat, karena perangkat bisa dipakai bersama; pengaturan tetap ada. Menghapus data situs di
        browser menghapus semuanya.
      </p>

      <h2>7. Berapa lama data disimpan</h2>
      <ul>
        <li>Akun, profil, watchlist, daftar yang diikuti dan pengaturan: selama akun ada.</li>
        <li>Notifikasi dan pesan: 30 hari, paling banyak 100 terbaru.</li>
        <li>Sesi masuk: 30 hari. Keluar mengakhirinya.</li>
        <li>Pesan masuk: dihapus dalam 20 menit.</li>
        <li>Handle yang Anda lepas: ditahan 30 hari.</li>
        <li>Permintaan bantuan: 90 hari, atau sampai akun dihapus.</li>
        <li>Cadangan database: paling lama 35 hari.</li>
      </ul>

      <h2>8. Menghapus akun</h2>
      <p>
        Di terminal: My profile, lalu Edit profile, lalu Delete account, lalu konfirmasi. synt langsung menghapus
        profil, watchlist, daftar yang diikuti, notifikasi, pengaturan, riwayat transaksi, permintaan bantuan dan semua
        sesi masuk Anda.
        Transaksi yang sudah ada di blockchain tetap di sana, seperti semua transaksi blockchain. Handle Anda ditahan 30 hari supaya tidak langsung
        diambil orang lain. Data yang dihapus hilang dari cadangan paling lama dalam 35 hari. Masuk lagi nanti dengan
        wallet yang sama akan membuat akun baru yang kosong.
      </p>

      <h2>9. Hak Anda</h2>
      <p>
        Berdasarkan UU PDP, Anda dapat meminta synt menunjukkan, menyalin, memperbaiki atau menghapus data pribadi Anda,
        menarik persetujuan, dan menolak pemrosesan. Semuanya bisa Anda lihat, perbaiki dan hapus sendiri di terminal.
        Untuk hal lain, hubungi <Kontak id />. synt menjawab dalam 3 x 24 jam, sesuai UU PDP.
      </p>

      <h2>10. Keamanan</h2>
      <p>
        Terminal memakai HTTPS. synt menyimpan sesi masuk hanya sebagai hash satu arah, setiap perubahan akun harus
        datang dari terminal synt sendiri, dan layanan akun berjalan terpisah dari sistem synt lainnya, dengan database
        sendiri, di server yang dikelola synt sendiri. Tidak ada sistem yang bebas risiko. Bila terjadi kebocoran data
        yang mengenai pengguna, synt akan memberi tahu pengguna yang terdampak dan otoritas sesuai UU PDP.
      </p>

      <h2>11. Usia</h2>
      <p>synt untuk orang berusia 18 tahun ke atas. synt tidak dengan sengaja menyimpan data orang yang lebih muda.</p>

      <h2>12. Perubahan kebijakan</h2>
      <p>
        synt memperbarui tanggal di bagian atas saat kebijakan ini berubah, dan mengumumkan perubahan yang lebih besar
        di terminal.
      </p>

      <h2>13. Kontak</h2>
      <p>
        Muhammad Fajar Nugraha
        <br />
        <Kontak id baris />
      </p>
    </>
  )
}
