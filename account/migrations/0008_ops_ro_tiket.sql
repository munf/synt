-- synt-akun · hak BACA tiket untuk dasbor ops (2026-11-07, todo #42/#38 disetujui pemilik).
--
-- Halaman Support di metrics.synt.fun (synt-metrics/server/support.mjs) membaca tiket lewat role `ops_ro`
-- (role baca dasbor yang sudah memegang SELECT di synt_bnb), SELECT saja & hanya kolom yang ditampilkan.
-- TAK ADA hak tulis: balasan tetap lewat CLI `synt-akun balas` / `tiket-selesai` (role akun_rw), jalur yang
-- sama dgn ops/balas.sh. ⚠️ Kolom baru yang perlu dibaca dasbor = tambah GRANT di migrasi baru.
--
-- Dilewati bila ops_ro belum ada (DB uji, atau bangun ulang sebelum peran.sh) — boot tak boleh gagal karenanya.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ops_ro') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO ops_ro', current_database());
    GRANT USAGE ON SCHEMA public TO ops_ro;
    GRANT SELECT ON tiket TO ops_ro;
    GRANT SELECT (id, wallet, handle) ON pengguna TO ops_ro;
    GRANT SELECT (id, pengguna_id, chain, sisi, status, tanda, galat, mint, dibuat) ON dagang TO ops_ro;
    GRANT SELECT (id, pengguna_id, jenis, judul, isi, dibuat, dibaca) ON notifikasi TO ops_ro;
  END IF;
END $$;
