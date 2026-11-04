-- synt-akun · tahap C (2026-11-01): notifikasi & pesan sistem, follow.

-- Satu tabel untuk notifikasi (audit/harga/ikuti) DAN pesan sistem (`sistem`): bentuknya sama,
-- yang beda hanya tempat tampilnya (lonceng vs kotak pesan). Pesan antar-pengguna TIDAK ada
-- (keputusan pemilik 1 Nov: pesan = sistem saja).
-- Retensi (dijanjikan halaman Privacy): 30 hari, paling banyak 100 terbaru per pengguna.
CREATE TABLE notifikasi (
    id           bigserial PRIMARY KEY,
    pengguna_id  bigint NOT NULL REFERENCES pengguna (id) ON DELETE CASCADE,
    jenis        text NOT NULL CHECK (jenis IN ('audit', 'harga', 'ikuti', 'sistem')),
    judul        text NOT NULL CHECK (char_length(judul) <= 80),
    isi          text NOT NULL CHECK (char_length(isi) <= 600),
    -- jalur RELATIF di terminal (/coin/…, /profile/…); tautan ke luar tak pernah dibuat di sini
    tautan       text CHECK (tautan IS NULL OR tautan ~ '^/[A-Za-z0-9/_@.-]*$'),
    -- pengikut (jenis 'ikuti'); akun pengikut dihapus → notifikasinya ikut hilang
    aktor_id     bigint REFERENCES pengguna (id) ON DELETE CASCADE,
    dibuat       timestamptz NOT NULL DEFAULT now(),
    dibaca       timestamptz
);
CREATE INDEX notifikasi_pengguna ON notifikasi (pengguna_id, dibuat DESC);
CREATE INDEX notifikasi_dibuat ON notifikasi (dibuat);

CREATE TABLE ikuti (
    pengikut_id  bigint NOT NULL REFERENCES pengguna (id) ON DELETE CASCADE,
    diikuti_id   bigint NOT NULL REFERENCES pengguna (id) ON DELETE CASCADE,
    dibuat       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pengikut_id, diikuti_id),
    CONSTRAINT bukan_diri_sendiri CHECK (pengikut_id <> diikuti_id)
);
CREATE INDEX ikuti_diikuti ON ikuti (diikuti_id);

-- Keadaan terakhir tiap token yang ada di watchlist siapa pun, dibaca pemantau dari API
-- PUBLIK synt-dash (bukan DB engine: role akun_rw tak boleh menyentuh synt_v10/synt_bnb).
-- Bukan data pribadi: tak ada kolom pengguna di sini.
CREATE TABLE jejak_token (
    token        text PRIMARY KEY,
    simbol       text,
    skor         smallint,
    -- harga patokan peringatan harga; diganti tiap kali peringatan harga dikirim
    harga_dasar  double precision,
    harga_kabar  timestamptz,
    diperiksa    timestamptz NOT NULL DEFAULT now()
);
