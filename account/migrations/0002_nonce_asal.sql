-- Origin tempat nonce diterbitkan (review 1 Nov). /masuk menolak bila origin penukarnya
-- berbeda: pesan untuk situs A tak boleh dipakai login di situs B. Baris lama (NULL)
-- hidup paling lama 10 menit, jadi tak perlu diisi ulang.
ALTER TABLE nonce_masuk ADD COLUMN asal text;
CREATE INDEX nonce_masuk_wallet ON nonce_masuk (wallet);
