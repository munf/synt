-- synt-akun · tahap B (2026-11-01): watchlist & preferensi ikut akun, masa tunggu handle.

-- Watchlist: token yang dipantau pengguna. `token` = alamat mint Solana (base58) atau
-- kontrak BNB (0x…). Plafon 200 per pengguna ditegakkan di API.
CREATE TABLE pantauan (
    pengguna_id  bigint NOT NULL REFERENCES pengguna (id) ON DELETE CASCADE,
    token        text NOT NULL,
    ditambah     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pengguna_id, token),
    CONSTRAINT token_bentuk CHECK (token ~ '^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[0-9a-f]{40})$')
);

-- Preferensi terminal (notifikasi, tampilan, quick buy) sebagai satu objek JSON.
-- Kunci & bentuk nilainya divalidasi di API (daftar putih); di sini hanya plafon ukuran.
CREATE TABLE preferensi (
    pengguna_id  bigint PRIMARY KEY REFERENCES pengguna (id) ON DELETE CASCADE,
    data         jsonb NOT NULL,
    diubah       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_objek CHECK (jsonb_typeof(data) = 'object'),
    CONSTRAINT data_kecil CHECK (octet_length(data::text) <= 2048)
);

-- Masa tunggu handle (review 1 Nov #8): handle yang dilepas (diganti atau akunnya dihapus)
-- tak bisa diambil orang lain selama 30 hari, supaya pengikut/tautan lama tak langsung
-- menunjuk ke orang lain (penyamaran). Wallet pelepas boleh mengambilnya kembali.
-- Yang disimpan hanya SHA-256 wallet, bukan alamatnya: baris ini bertahan setelah akun dihapus.
CREATE TABLE handle_lepas (
    handle       text PRIMARY KEY,
    wallet_hash  bytea NOT NULL,
    dilepas      timestamptz NOT NULL DEFAULT now(),
    sampai       timestamptz NOT NULL
);
CREATE INDEX handle_lepas_sampai ON handle_lepas (sampai);
