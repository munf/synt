-- synt-akun · trading terminal lab (2026-11-02): catatan transaksi beli/jual.
--
-- ⚠️ synt TIDAK memegang dana atau kunci. Layanan menyusun transaksi TAK bertanda, wallet pengguna
-- menandatangani, layanan hanya meneruskan ke RPC dan mencatat hasilnya. Semua isi tabel ini sudah
-- publik di chain; yang baru hanya kaitannya dengan akun (disebut di halaman Privacy).
-- Jumlah disimpan dalam satuan TERKECIL (lamport / unit token mentah) sebagai numeric:
-- unit mentah token bisa melewati i64 (supply 1e12 × desimal 9).
CREATE TABLE dagang (
    id                  bigserial PRIMARY KEY,
    pengguna_id         bigint NOT NULL REFERENCES pengguna (id) ON DELETE CASCADE,
    wallet              text NOT NULL,
    mint                text NOT NULL,
    sisi                text NOT NULL CHECK (sisi IN ('beli', 'jual')),
    -- input yang ditawarkan: lamport (beli) atau unit token (jual)
    masuk               numeric NOT NULL CHECK (masuk > 0),
    -- kutipan Jupiter saat disiapkan: perkiraan keluar & batas minimum setelah slippage
    perkiraan_keluar    numeric NOT NULL,
    minimal_keluar      numeric NOT NULL,
    slippage_bps        integer NOT NULL CHECK (slippage_bps BETWEEN 1 AND 5000),
    prioritas_lamports  bigint NOT NULL CHECK (prioritas_lamports >= 0),
    dampak_harga        double precision,
    rute                text,
    -- SHA-256 byte pesan yang disiapkan: pembanding pesan yang kembali bertanda
    pesan_hash          bytea NOT NULL,
    blok_akhir          bigint NOT NULL,
    status              text NOT NULL DEFAULT 'disiapkan'
                        CHECK (status IN ('disiapkan', 'dikirim', 'berhasil', 'gagal', 'kedaluwarsa')),
    tanda               text UNIQUE,
    galat               text CHECK (galat IS NULL OR char_length(galat) <= 200),
    -- perubahan saldo NYATA wallet dari transaksi terkonfirmasi (bukan kutipan)
    sol_delta           bigint,
    token_delta         numeric,
    dibuat              timestamptz NOT NULL DEFAULT now(),
    dikirim             timestamptz,
    selesai             timestamptz
);
CREATE INDEX dagang_pengguna ON dagang (pengguna_id, dibuat DESC);
CREATE INDEX dagang_berjalan ON dagang (dikirim) WHERE status = 'dikirim';
