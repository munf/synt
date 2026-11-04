/** Alamat mint Solana: base58 (tanpa 0 O I l), 32-44 karakter. Dipakai halaman token (rute) & SearchPanel (butir 6). */
export const ALAMAT_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function alamatMint(s: string): boolean {
  return ALAMAT_MINT.test(s)
}
