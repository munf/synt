-- synt-akun · skema awal (2026-11-01)
--
-- ⚠️ Data PENGGUNA, bukan rekaman pasar. Prinsipnya: simpan sesedikit mungkin.
-- Tak ada IP, tak ada email, tak ada user-agent. Identitas = alamat wallet publik.

CREATE TABLE pengguna (
    id              bigserial PRIMARY KEY,
    -- alamat wallet Solana (base58, kunci publik ed25519). Satu wallet = satu akun.
    wallet          text NOT NULL UNIQUE,
    -- huruf kecil [a-z0-9_], 3-20. NULL = belum memilih handle.
    handle          text UNIQUE,
    nama            text,
    bio             text,
    dibuat          timestamptz NOT NULL DEFAULT now(),
    masuk_terakhir  timestamptz,
    CONSTRAINT handle_bentuk CHECK (handle IS NULL OR handle ~ '^[a-z0-9_]{3,20}$'),
    CONSTRAINT nama_panjang CHECK (nama IS NULL OR char_length(nama) <= 40),
    CONSTRAINT bio_panjang CHECK (bio IS NULL OR char_length(bio) <= 160)
);

-- Pesan login yang menunggu ditandatangani. Sekali pakai: dihapus saat dipakai
-- (DELETE … RETURNING), jadi tanda tangan yang sama tak bisa diputar ulang.
CREATE TABLE nonce_masuk (
    nonce        text PRIMARY KEY,
    wallet       text NOT NULL,
    -- teks PERSIS yang ditandatangani wallet; diverifikasi byte demi byte
    pesan        text NOT NULL,
    kedaluwarsa  timestamptz NOT NULL,
    dibuat       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nonce_masuk_kedaluwarsa ON nonce_masuk (kedaluwarsa);

-- Sesi login. Yang disimpan hanya SHA-256 token; token asli hanya ada di cookie
-- pengguna, jadi bocornya isi tabel ini tak memberi akses ke akun mana pun.
CREATE TABLE sesi (
    token_hash        bytea PRIMARY KEY,
    pengguna_id       bigint NOT NULL REFERENCES pengguna (id) ON DELETE CASCADE,
    dibuat            timestamptz NOT NULL DEFAULT now(),
    kedaluwarsa       timestamptz NOT NULL,
    terakhir_dipakai  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sesi_pengguna ON sesi (pengguna_id);
CREATE INDEX sesi_kedaluwarsa ON sesi (kedaluwarsa);
