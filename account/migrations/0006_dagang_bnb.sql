-- synt-akun · trading BNB Chain (2026-11-03): baris `dagang` kini per chain.
--
-- chain 'bnb': mint = alamat token 0x huruf kecil · masuk = wei (beli) / unit token mentah (jual) ·
-- pesan_hash = SHA-256 (to ‖ value 32 byte ‖ data) transaksi yang disiapkan · tanda = hash tx 0x ·
-- prioritas_lamports & blok_akhir = 0 (gas diatur wallet; tak ada blockhash).
ALTER TABLE dagang ADD COLUMN chain text NOT NULL DEFAULT 'sol' CHECK (chain IN ('sol', 'bnb'));
-- perubahan saldo BNB NYATA wallet (wei; bisa melewati i64 → numeric). sol_delta tetap utk Solana.
ALTER TABLE dagang ADD COLUMN native_delta numeric;
