/* Klien synt-akun (`/api/akun/*`) + wallet Solana yang terpasang di browser.

   ⭐ Login = wallet menandatangani PESAN TEKS (Sign-In With Solana), bukan
   transaksi. Terminal tak pernah meminta tanda tangan transaksi lewat jalur ini,
   dan server hanya memverifikasi tanda tangan: tak ada kunci yang berpindah.

   Wallet dibaca langsung dari ekstensi (Wallet Standard + global lama, lihat
   bagian wallet) alih-alih @solana/wallet-adapter: adapter menyeret web3.js
   (ratusan KB) hanya untuk dua panggilan, connect & signMessage. */

const BASE = '/api/akun'

export interface AkunProfil {
  /** alamat lengkap — hanya ada di profil milik sendiri */
  wallet?: string
  walletShort: string
  handle: string | null
  displayName: string | null
  bio: string | null
  joined: string
  /** angka publik (tahap C) */
  followers?: number
  following?: number
  /** hanya di profil orang lain, saat yang melihat sedang masuk */
  isFollowing?: boolean
}

/** Satu baris lonceng / kotak pesan dari `/kotak`. */
export interface ButirKotak {
  id: number
  kind: 'audit' | 'price' | 'social' | 'system'
  title: string
  text: string
  href: string | null
  at: string
  read: boolean
}

export class AkunGalat extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'AkunGalat'
  }
}

/** Dipakai juga oleh fitur trading (`features/trade/dagang.ts`): rute `/api/akun/dagang/*`. */
export async function minta<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  let isi: unknown = null
  try {
    isi = await res.json()
  } catch {
    /* badan bukan JSON: rute belum ada (preview tanpa synt-akun) atau proxy galat */
  }
  if (!res.ok) {
    const pesan = (isi as { error?: string } | null)?.error ?? 'Account service is unavailable.'
    throw new AkunGalat(pesan, res.status)
  }
  return isi as T
}

export const akunApi = {
  /** undefined = belum masuk (204) */
  saya: () => minta<AkunProfil | undefined>('GET', '/saya'),
  nonce: (address: string) => minta<{ nonce: string; message: string }>('POST', '/nonce', { address }),
  masuk: (address: string, nonce: string, signature: string) =>
    minta<AkunProfil>('POST', '/masuk', { address, nonce, signature }),
  keluar: () => minta<void>('POST', '/keluar'),
  /** hapus akun + semua sesi; dijanjikan halaman Privacy */
  hapus: () => minta<void>('DELETE', '/saya'),
  ubah: (u: { handle?: string; displayName?: string; bio?: string }) => minta<AkunProfil>('PATCH', '/saya', u),
  pantauan: () => minta<{ tokens: string[] }>('GET', '/pantauan'),
  gabungPantauan: (tokens: string[]) => minta<{ tokens: string[] }>('POST', '/pantauan/gabung', { tokens }),
  pantau: (token: string) => minta<void>('PUT', `/pantauan/${encodeURIComponent(token)}`),
  lepasPantau: (token: string) => minta<void>('DELETE', `/pantauan/${encodeURIComponent(token)}`),
  preferensi: () => minta<{ data: Record<string, unknown> | null }>('GET', '/preferensi'),
  simpanPreferensi: (data: Record<string, unknown>) => minta<void>('PUT', '/preferensi', { data }),
  kotak: () =>
    minta<{
      notifications: ButirKotak[]
      messages: ButirKotak[]
      unread: { notifications: number; messages: number }
    }>('GET', '/kotak'),
  baca: (b: { ids?: number[]; tempat?: 'notifications' | 'messages' }) => minta<void>('POST', '/kotak/baca', b),
  ikuti: (handle: string) => minta<void>('PUT', `/ikuti/${encodeURIComponent(handle)}`),
  berhentiIkuti: (handle: string) => minta<void>('DELETE', `/ikuti/${encodeURIComponent(handle)}`),
  profil: (handle: string) => minta<AkunProfil>('GET', `/profil/${encodeURIComponent(handle)}`),
}

// ── wallet ──────────────────────────────────────────────────────────────────
//
// Tiga jalur menemukan wallet di browser:
//  1. Wallet Standard (event `wallet-standard:*`, 1 Nov): MetaMask, Phantom, Solflare, Backpack dan
//     wallet Solana lain yang mendaftarkan diri. ⚠️ MetaMask HANYA ada di jalur ini: ia tak menyuntikkan
//     global Solana apa pun ke window.
//  2. Global lama (`window.phantom.solana` dst.): cadangan untuk versi ekstensi yang belum mendaftar.
//  3. EIP-6963 (event `eip6963:*`): wallet EVM — akun 0x MetaMask dkk., login SIWE. Satu alamat 0x =
//     akun TERPISAH dari akun alamat Solana orang yang sama (keputusan pemilik 1 Nov: tanpa penautan).
//     `window.ethereum` hanya cadangan bila tak ada satu pun wallet yang mengumumkan diri.
// Protokol sisi aplikasi ditulis tangan alih-alih @wallet-standard/app, alasannya sama dgn adapter di atas.

interface KunciPublik {
  toBase58(): string
}

/** Irisan antarmuka global lama yang sama di Phantom, Solflare, dan Backpack. */
interface ProviderSolana {
  publicKey?: KunciPublik | null
  connect(): Promise<{ publicKey?: KunciPublik } | void>
  signMessage(pesan: Uint8Array, tampil?: 'utf8'): Promise<{ signature: Uint8Array } | Uint8Array>
}

type JendelaWallet = {
  phantom?: { solana?: ProviderSolana & { isPhantom?: boolean } }
  solflare?: ProviderSolana & { isSolflare?: boolean }
  backpack?: ProviderSolana & { isBackpack?: boolean }
}

function globalLama(id: string): ProviderSolana | null {
  const w = window as unknown as JendelaWallet
  if (id === 'phantom') return w.phantom?.solana?.isPhantom ? w.phantom.solana : null
  if (id === 'solflare') return w.solflare?.isSolflare ? w.solflare : null
  if (id === 'backpack') return w.backpack?.isBackpack ? w.backpack : null
  return null
}

interface AkunStandar {
  address: string
  chains?: readonly string[]
}

interface WalletStandar {
  name: string
  icon?: string
  chains: readonly string[]
  accounts: readonly AkunStandar[]
  features: Record<string, unknown>
}

type FiturConnect = { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly AkunStandar[] }> }
type FiturSignMessage = {
  signMessage(...input: Array<{ account: AkunStandar; message: Uint8Array }>): Promise<Array<{ signature: Uint8Array }>>
}

type FiturSignTx = {
  signTransaction(
    ...input: Array<{ account: AkunStandar; transaction: Uint8Array; chain?: string }>
  ): Promise<Array<{ signedTransaction: Uint8Array }>>
}
type FiturSignSendTx = {
  signAndSendTransaction(
    ...input: Array<{ account: AkunStandar; transaction: Uint8Array; chain: string }>
  ): Promise<Array<{ signature: Uint8Array }>>
}

/** Wallet yang bisa dipakai login: punya `connect` + `signMessage` dan mengaku mendukung Solana. */
const bisaMasuk = (w: WalletStandar) =>
  Array.isArray(w.chains) &&
  w.chains.some((c) => c.startsWith('solana:')) &&
  !!w.features?.['standard:connect'] &&
  !!w.features?.['solana:signMessage']

/** Wallet terkenal: urutan tampil + tautan pasang bila belum ada. */
export const WALLET_DIKENAL = [
  { id: 'metamask', nama: 'MetaMask', pasang: 'https://metamask.io/download/' },
  { id: 'phantom', nama: 'Phantom', pasang: 'https://phantom.com/download' },
  { id: 'solflare', nama: 'Solflare', pasang: 'https://solflare.com/download' },
  { id: 'backpack', nama: 'Backpack', pasang: 'https://backpack.app/download' },
] as const

export type Rantai = 'solana' | 'evm'

export interface Dompet {
  /** unik di daftar; wallet Solana = nama huruf kecil (`metamask`), EVM = `evm:` + rdns */
  id: string
  rantai: Rantai
  nama: string
  /** data URI dari wallet sendiri (Wallet Standard mewajibkannya); null utk global lama */
  ikon: string | null
  /** `tandatangani` mengembalikan tanda tangan dalam bentuk yang diterima server: base58 (Solana), 0x-hex (EVM) */
  sambung(): Promise<{ alamat: string; tandatangani: (pesan: string) => Promise<string> }>
}

const idDari = (nama: string) => nama.trim().toLowerCase()

function dariStandar(w: WalletStandar): Dompet {
  return {
    id: idDari(w.name),
    rantai: 'solana',
    nama: w.name,
    ikon: typeof w.icon === 'string' && /^data:image\/(svg\+xml|png|webp|gif|jpeg);/.test(w.icon) ? w.icon : null,
    async sambung() {
      const { accounts } = await (w.features['standard:connect'] as FiturConnect).connect()
      const daftar = accounts?.length ? accounts : w.accounts
      // wallet multi-chain bisa memberi akun EVM juga: pilih yang menyebut Solana, bila ada keterangan chain
      const akun = daftar.find((a) => !a.chains || a.chains.some((c) => c.startsWith('solana:')))
      if (!akun) throw new AkunGalat('The wallet did not share a Solana address.', 0)
      return {
        alamat: akun.address,
        tandatangani: async (pesan) => {
          const [h] = await (w.features['solana:signMessage'] as FiturSignMessage).signMessage({
            account: akun,
            message: new TextEncoder().encode(pesan),
          })
          if (!h?.signature) throw new AkunGalat('The wallet did not return a signature.', 0)
          return base58(h.signature)
        },
      }
    },
  }
}

function dariGlobal(id: string, nama: string, p: ProviderSolana): Dompet {
  return {
    id,
    rantai: 'solana',
    nama,
    ikon: null,
    async sambung() {
      const hasil = await p.connect()
      const kunci = (hasil && hasil.publicKey) || p.publicKey
      if (!kunci) throw new AkunGalat('The wallet did not share an address.', 0)
      return {
        alamat: kunci.toBase58(),
        tandatangani: async (pesan) => {
          const ttd = await p.signMessage(new TextEncoder().encode(pesan), 'utf8')
          return base58(ttd instanceof Uint8Array ? ttd : ttd.signature)
        },
      }
    },
  }
}

/** Provider EIP-1193 — cukup `request` untuk dua panggilan login. */
interface ProviderEvm {
  request(a: { method: string; params?: unknown[] }): Promise<unknown>
  isMetaMask?: boolean
}

interface InfoEip6963 {
  uuid: string
  name: string
  icon: string
  rdns: string
}

const hexUtf8 = (s: string) =>
  '0x' + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')

function dariEvm(info: Pick<InfoEip6963, 'name' | 'icon' | 'rdns'>, p: ProviderEvm): Dompet {
  return {
    id: `evm:${info.rdns}`,
    rantai: 'evm',
    nama: info.name,
    ikon: /^data:image\/(svg\+xml|png|webp|gif|jpeg);/.test(info.icon) ? info.icon : null,
    async sambung() {
      const akun = (await p.request({ method: 'eth_requestAccounts' })) as string[] | undefined
      const alamat = akun?.[0]
      if (!alamat || !/^0x[0-9a-fA-F]{40}$/.test(alamat)) throw new AkunGalat('The wallet did not share an address.', 0)
      return {
        alamat,
        tandatangani: async (pesan) => {
          // alamat penanda tangan = baris ke-2 pesan (checksum EIP-55 dari server): MetaMask hanya mengenali
          // pesan sebagai SIWE (& menampilkan pemeriksaan domain) bila `from` berbentuk checksum
          const dari = pesan.split('\n')[1]
          const ttd = await p.request({ method: 'personal_sign', params: [hexUtf8(pesan), dari] })
          if (typeof ttd !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(ttd)) {
            throw new AkunGalat('The wallet did not return a signature.', 0)
          }
          return ttd
        },
      }
    },
  }
}

const diumumkan = new Map<string, { info: InfoEip6963; provider: ProviderEvm }>()

const terdaftar: WalletStandar[] = []
const pendengar = new Set<() => void>()
let cuplikan: Dompet[] = []
let dimulai = false

function susunUlang() {
  const dari = terdaftar.filter(bisaMasuk).map(dariStandar)
  for (const k of WALLET_DIKENAL) {
    const p = globalLama(k.id)
    if (p && !dari.some((d) => d.id === k.id)) dari.push(dariGlobal(k.id, k.nama, p))
  }
  for (const { info, provider } of diumumkan.values()) {
    if (typeof info?.rdns === 'string' && typeof info.name === 'string' && typeof provider?.request === 'function') {
      dari.push(dariEvm(info, provider))
    }
  }
  const eth = (window as unknown as { ethereum?: ProviderEvm }).ethereum
  if (!dari.some((d) => d.rantai === 'evm') && typeof eth?.request === 'function') {
    dari.push(dariEvm({ name: eth.isMetaMask ? 'MetaMask' : 'Browser wallet', icon: '', rdns: 'window.ethereum' }, eth))
  }
  const urut = (d: Dompet) => {
    const nama = d.rantai === 'evm' ? idDari(d.nama) : d.id
    const i = WALLET_DIKENAL.findIndex((k) => k.id === nama)
    return i < 0 ? WALLET_DIKENAL.length : i
  }
  // satu id satu baris: ekstensi ganda/tiruan dgn nama sama tak menggandakan daftar
  cuplikan = dari.filter((d, i) => dari.findIndex((x) => x.id === d.id) === i).sort((a, b) => urut(a) - urut(b))
  pendengar.forEach((f) => f())
}

function mulai() {
  if (dimulai) return
  dimulai = true
  const api = {
    register(...ws: WalletStandar[]) {
      for (const w of ws) if (w && !terdaftar.includes(w)) terdaftar.push(w)
      susunUlang()
      return () => {
        for (const w of ws) {
          const i = terdaftar.indexOf(w)
          if (i >= 0) terdaftar.splice(i, 1)
        }
        susunUlang()
      }
    },
  }
  // wallet yang dimuat SETELAH halaman: ia memancarkan register-wallet
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    try {
      ;(e as CustomEvent<(a: typeof api) => void>).detail(api)
    } catch {
      // satu wallet rusak tak boleh mengosongkan daftar
    }
  })
  // wallet yang dimuat SEBELUM halaman: ia menunggu app-ready lalu mendaftar
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }))
  // EIP-6963: wallet menjawab requestProvider, dan mengumumkan diri sendiri bila dimuat belakangan
  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = (e as CustomEvent<{ info: InfoEip6963; provider: ProviderEvm }>).detail
    if (!d?.info?.uuid) return
    diumumkan.set(d.info.uuid, d)
    susunUlang()
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  susunUlang()
}

/** Untuk `useSyncExternalStore`: daftar wallet yang terdeteksi, berubah saat wallet mendaftar. */
export const dompetTerdeteksi = {
  langgan(f: () => void) {
    mulai()
    pendengar.add(f)
    return () => {
      pendengar.delete(f)
    }
  },
  ambil(): Dompet[] {
    mulai()
    return cuplikan
  },
}

const ABJAD = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58(byte: Uint8Array): string {
  let n = 0n
  for (const b of byte) n = (n << 8n) + BigInt(b)
  let s = ''
  while (n > 0n) {
    s = ABJAD[Number(n % 58n)] + s
    n /= 58n
  }
  for (const b of byte) {
    if (b !== 0) break
    s = '1' + s
  }
  return s
}

/** Kode 4001 = pengguna menolak di jendela wallet (konvensi EIP-1193 yang dipakai wallet Solana juga). */
function ditolakPengguna(e: unknown): boolean {
  const k = e as { code?: number; message?: string } | null
  return k?.code === 4001 || /reject|cancel|denied/i.test(k?.message ?? '')
}

/** id wallet Solana terakhir yang dipakai masuk — trading mencoba wallet ini dulu */
const KUNCI_DOMPET = 'synt.akun.dompet'
/** sama, utk wallet EVM (rdns EIP-6963) — trading BNB mencoba wallet ini dulu */
const KUNCI_DOMPET_EVM = 'synt.akun.dompet.evm'

export async function masukDenganWallet(d: Dompet): Promise<AkunProfil> {
  try {
    try {
      localStorage.setItem(d.rantai === 'solana' ? KUNCI_DOMPET : KUNCI_DOMPET_EVM, d.id)
    } catch {
      /* penyimpanan diblokir: trading tetap mencari wallet yang memegang alamat akun */
    }
    const { alamat, tandatangani } = await d.sambung()
    const { nonce, message } = await akunApi.nonce(alamat)
    // Jangan minta tanda tangan atas pesan yang tak menyebut situs INI, jenis akun INI dan alamat INI:
    // pesan login untuk domain lain = bahan phishing, apa pun alasan server mengirimnya.
    // (alamat EVM dibandingkan tanpa beda huruf: server mengembalikannya dalam bentuk checksum)
    const [judul, tertulis = ''] = message.split('\n')
    const jenis = d.rantai === 'evm' ? 'Ethereum' : 'Solana'
    const samaAlamat = d.rantai === 'evm' ? tertulis.toLowerCase() === alamat.toLowerCase() : tertulis === alamat
    if (judul !== `${window.location.host} wants you to sign in with your ${jenis} account:` || !samaAlamat) {
      throw new AkunGalat('The sign-in message did not match this site. Nothing was signed.', 0)
    }
    const ttd = await tandatangani(message)
    return await akunApi.masuk(tertulis, nonce, ttd)
  } catch (e) {
    if (e instanceof AkunGalat) throw e
    if (ditolakPengguna(e)) throw new AkunGalat('The signature request was cancelled in the wallet.', 0)
    throw new AkunGalat('The wallet could not complete the sign-in.', 0)
  }
}

// ── tanda tangan transaksi (trading, 2 Nov) ────────────────────────────────
//
// Hanya lewat Wallet Standard: `solana:signTransaction` (kita yang mengirim ke RPC & melacak) atau,
// bila wallet hanya punya itu, `solana:signAndSendTransaction` (wallet yang mengirim). Global lama
// (`window.phantom.solana`) menuntut objek @solana/web3.js, jadi tak dipakai untuk trading.
// ⚠️ synt tak pernah melihat kunci privat: yang keluar dari sini hanya transaksi yang sudah ditandatangani.

export type HasilTandaTx = { tx: Uint8Array } | { tanda: string }

export interface PenandaTx {
  nama: string
  tandatangani(tx: Uint8Array): Promise<HasilTandaTx>
}

const bisaTx = (w: WalletStandar) =>
  bisaMasuk(w) && (!!w.features['solana:signTransaction'] || !!w.features['solana:signAndSendTransaction'])

const punya = (w: WalletStandar, alamat: string) => w.accounts?.find((a) => a.address === alamat)

const pendek = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`

function penanda(w: WalletStandar, akun: AkunStandar): PenandaTx {
  return {
    nama: w.name,
    async tandatangani(tx) {
      try {
        const sign = w.features['solana:signTransaction'] as FiturSignTx | undefined
        if (sign) {
          const [h] = await sign.signTransaction({ account: akun, transaction: tx, chain: 'solana:mainnet' })
          if (!h?.signedTransaction) throw new AkunGalat('The wallet did not return a signed transaction.', 0)
          return { tx: h.signedTransaction }
        }
        const kirim = w.features['solana:signAndSendTransaction'] as FiturSignSendTx
        const [h] = await kirim.signAndSendTransaction({ account: akun, transaction: tx, chain: 'solana:mainnet' })
        if (!h?.signature) throw new AkunGalat('The wallet did not return a signature.', 0)
        return { tanda: base58(h.signature) }
      } catch (e) {
        if (e instanceof AkunGalat) throw e
        if (ditolakPengguna(e)) throw new AkunGalat('You cancelled the transaction in the wallet. Nothing was sent.', 0)
        throw new AkunGalat('The wallet could not sign this transaction.', 0)
      }
    },
  }
}

/**
 * Wallet yang memegang `alamat` (alamat akun yang masuk). Urutan: wallet yang sudah membagikan alamat itu,
 * lalu sambung diam-diam (`silent`), lalu minta sambung ke wallet terakhir yang dipakai masuk.
 * Alamat lain = galat: menandatangani dgn wallet lain berarti membayar dari wallet yang salah.
 */
export async function penandaUntuk(alamat: string): Promise<PenandaTx> {
  mulai()
  const calon = terdaftar.filter(bisaTx)
  if (calon.length === 0) {
    throw new AkunGalat('No wallet here can sign Solana transactions. Use Phantom, Solflare, Backpack or MetaMask.', 0)
  }
  for (const w of calon) {
    const a = punya(w, alamat)
    if (a) return penanda(w, a)
  }
  for (const w of calon) {
    try {
      const { accounts } = await (w.features['standard:connect'] as FiturConnect).connect({ silent: true })
      const a = accounts?.find((x) => x.address === alamat)
      if (a) return penanda(w, a)
    } catch {
      /* sambung diam ditolak: coba wallet berikutnya */
    }
  }
  let favorit: string | null = null
  try {
    favorit = localStorage.getItem(KUNCI_DOMPET)
  } catch {
    /* tanpa penyimpanan: pakai wallet pertama */
  }
  const w = calon.find((x) => idDari(x.name) === favorit) ?? calon[0]!
  let accounts: readonly AkunStandar[] = []
  try {
    accounts = (await (w.features['standard:connect'] as FiturConnect).connect()).accounts ?? w.accounts
  } catch (e) {
    if (ditolakPengguna(e)) throw new AkunGalat('You cancelled the wallet connection.', 0)
    throw new AkunGalat(`${w.name} did not connect.`, 0)
  }
  const a = accounts.find((x) => x.address === alamat)
  if (!a) {
    throw new AkunGalat(`Switch ${w.name} to the account you signed in with (${pendek(alamat)}), then try again.`, 0)
  }
  return penanda(w, a)
}

// ── transaksi EVM (trading BNB Chain, 3 Nov) ───────────────────────────────
//
// Wallet EVM yang MENGIRIM (`eth_sendTransaction`); synt hanya menyusun calldata & melacak hash-nya.
// Sebelum mengirim: wallet harus memegang alamat akun dan berada di BNB Chain (56) — bila tidak, diminta pindah.

export interface TxEvm {
  to: string
  data: string
  value: string
  gas?: string | null
}

export interface PenandaEvm {
  nama: string
  /** kirim lewat wallet → hash tx */
  kirim(tx: TxEvm): Promise<string>
  /** tunggu receipt lewat RPC wallet; true = berhasil */
  tunggu(hash: string, batasMs?: number): Promise<boolean>
}

const BSC = '0x38'
const BSC_TAMBAH = {
  chainId: BSC,
  chainName: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
  blockExplorerUrls: ['https://bscscan.com'],
}

function penyediaEvm(): Array<{ id: string; nama: string; p: ProviderEvm }> {
  mulai()
  const daftar = [...diumumkan.values()]
    .filter((x) => typeof x.provider?.request === 'function' && typeof x.info?.rdns === 'string')
    .map((x) => ({ id: `evm:${x.info.rdns}`, nama: x.info.name, p: x.provider }))
  const eth = (window as unknown as { ethereum?: ProviderEvm }).ethereum
  if (daftar.length === 0 && typeof eth?.request === 'function') {
    daftar.push({ id: 'evm:window.ethereum', nama: eth.isMetaMask ? 'MetaMask' : 'Browser wallet', p: eth })
  }
  return daftar
}

const samaEvm = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

async function keBsc(p: ProviderEvm, nama: string) {
  if ((await p.request({ method: 'eth_chainId' })) === BSC) return
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC }] })
  } catch (e) {
    if ((e as { code?: number })?.code !== 4902) {
      if (ditolakPengguna(e)) throw new AkunGalat(`Switch ${nama} to BNB Chain to trade.`, 0)
      throw new AkunGalat(`${nama} could not switch to BNB Chain.`, 0)
    }
    await p.request({ method: 'wallet_addEthereumChain', params: [BSC_TAMBAH] })
  }
  if ((await p.request({ method: 'eth_chainId' })) !== BSC) throw new AkunGalat(`Switch ${nama} to BNB Chain to trade.`, 0)
}

/**
 * Wallet EVM yang memegang `alamat` (akun 0x yang masuk). Urutan: wallet yang sudah membagikan alamat itu
 * (`eth_accounts`, tanpa jendela), lalu minta sambung ke wallet terakhir yang dipakai masuk.
 */
export async function penandaEvmUntuk(alamat: string): Promise<PenandaEvm> {
  const calon = penyediaEvm()
  if (calon.length === 0) throw new AkunGalat('No EVM wallet found. Install MetaMask to trade on BNB Chain.', 0)
  let pilih: (typeof calon)[number] | undefined
  for (const c of calon) {
    try {
      const akun = (await c.p.request({ method: 'eth_accounts' })) as unknown[]
      if (akun?.some((a) => samaEvm(a, alamat))) {
        pilih = c
        break
      }
    } catch {
      /* wallet ini menolak eth_accounts: coba berikutnya */
    }
  }
  if (!pilih) {
    let favorit: string | null = null
    try {
      favorit = localStorage.getItem(KUNCI_DOMPET_EVM)
    } catch {
      /* tanpa penyimpanan: pakai wallet pertama */
    }
    const c = calon.find((x) => x.id === favorit) ?? calon[0]!
    let akun: unknown[] = []
    try {
      akun = (await c.p.request({ method: 'eth_requestAccounts' })) as unknown[]
    } catch (e) {
      if (ditolakPengguna(e)) throw new AkunGalat('You cancelled the wallet connection.', 0)
      throw new AkunGalat(`${c.nama} did not connect.`, 0)
    }
    if (!akun?.some((a) => samaEvm(a, alamat))) {
      throw new AkunGalat(`Switch ${c.nama} to the account you signed in with (${pendek(alamat)}), then try again.`, 0)
    }
    pilih = c
  }
  const { p, nama } = pilih
  return {
    nama,
    async kirim(tx) {
      try {
        await keBsc(p, nama)
        const hash = await p.request({
          method: 'eth_sendTransaction',
          params: [{ from: alamat, to: tx.to, data: tx.data, value: tx.value, ...(tx.gas ? { gas: tx.gas } : {}) }],
        })
        if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
          throw new AkunGalat('The wallet did not return a transaction hash.', 0)
        }
        return hash
      } catch (e) {
        if (e instanceof AkunGalat) throw e
        if (ditolakPengguna(e)) throw new AkunGalat('You cancelled the transaction in the wallet. Nothing was sent.', 0)
        throw new AkunGalat('The wallet could not send this transaction.', 0)
      }
    },
    async tunggu(hash, batasMs = 120_000) {
      const mulaiPada = Date.now()
      while (Date.now() - mulaiPada < batasMs) {
        await new Promise((r) => setTimeout(r, 1_500))
        try {
          const r = (await p.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as { status?: string } | null
          if (r?.status) return r.status === '0x1'
        } catch {
          /* RPC wallet sesaat gagal: coba lagi */
        }
      }
      throw new AkunGalat('The approval is taking too long. Check your wallet, then try again.', 0)
    },
  }
}
