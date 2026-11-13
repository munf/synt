-- synt-akun · tiket support terminal (2026-11-04, keputusan pemilik: form tiket, bukan sekadar kontak).
--
-- Pengguna menulis masalahnya dari tombol "?" di header terminal; tiket disimpan di sini lalu diteruskan ke
-- Telegram tim (dukungan.rs). Balasan untuk pengguna yang masuk = pesan sistem di Messages
-- (`synt-akun balas <id> "<isi>"`); tamu dibalas lewat kontak yang ia tulis sendiri.
--
-- ⚠️ Halaman Privacy terminal menjanjikan isi & retensi tabel ini (90 hari, ikut terhapus bersama akun).
CREATE TABLE tiket (
    id           bigserial PRIMARY KEY,
    -- NULL = tamu (belum masuk). CASCADE: `DELETE /saya` ikut menghapus tiket pengguna itu.
    pengguna_id  bigint REFERENCES pengguna (id) ON DELETE CASCADE,
    kategori     text NOT NULL CHECK (kategori IN ('trading', 'akun', 'skor', 'bug', 'lain')),
    pesan        text NOT NULL CHECK (char_length(pesan) BETWEEN 10 AND 2000),
    -- email / handle Telegram yang DITULIS pengguna sendiri; wajib bagi tamu (tanpa itu tak bisa dibalas)
    kontak       text CHECK (kontak IS NULL OR char_length(kontak) BETWEEN 3 AND 120),
    CHECK (pengguna_id IS NOT NULL OR kontak IS NOT NULL),
    -- konteks yang dilampirkan terminal (halaman, token, transaksi, build, ukuran layar) — daftar putih di
    -- dukungan.rs, bukan isi bebas
    konteks      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(konteks::text) <= 2048),
    -- pengguna boleh melepas alamat wallet dari lampiran; tiket tetap tertaut ke akun agar bisa dibalas
    sertakan_wallet boolean NOT NULL DEFAULT true,
    status       text NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'dibalas', 'selesai')),
    -- terkirim ke Telegram tim; false = dicoba ulang pemroses latar (maks 1 hari)
    diteruskan   boolean NOT NULL DEFAULT false,
    dibuat       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tiket_pengguna ON tiket (pengguna_id, dibuat DESC);
CREATE INDEX tiket_tertunda ON tiket (dibuat) WHERE NOT diteruskan;
