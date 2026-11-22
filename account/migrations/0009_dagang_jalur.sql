-- synt-akun · perakit langsung (2026-11-22, izin pemilik 15 & 22 Nov; LAB saja): transaksi Solana boleh dirakit
-- layanan perakit lokal (instruksi pump.fun langsung) alih-alih Jupiter, dan dikirim lewat relay ber-stake.
-- 'jupiter' = jalur lama (Jupiter /build + RPC biasa) · 'langsung' = perakit lokal + relay (lihat dagang.rs).
ALTER TABLE dagang ADD COLUMN jalur text NOT NULL DEFAULT 'jupiter' CHECK (jalur IN ('jupiter', 'langsung'));
