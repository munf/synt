# synt account service

The backend for synt accounts and non-custodial trading. A single Rust binary (axum and sqlx) with its own Postgres database. It verifies wallet signatures and builds unsigned transactions. It never holds a private key.

## What it does

| Area | Files | Endpoints (all under `/api/akun`) |
|---|---|---|
| Sign in with Solana (SIWS, ed25519) and with Ethereum (SIWE, EIP-4361) | `siws.rs`, `siwe.rs`, `api.rs` | `POST /nonce`, `POST /masuk`, `POST /keluar` |
| Profile, public profile, self-service account deletion | `api.rs`, `profil.rs` | `GET/PATCH/DELETE /saya`, `GET /profil/:handle` |
| Watchlist and settings synced across devices | `sinkron.rs` | `/pantauan`, `/preferensi` |
| Alerts (score change, price move, new follower), system messages, follows | `kotak.rs`, `pemantau.rs` | `/kotak`, `/kotak/baca`, `/ikuti/:handle` |
| Solana trading through Jupiter | `dagang.rs`, `soltx.rs` | `/dagang/siapkan`, `/dagang/kirim`, `/dagang/lacak`, `/dagang/saldo`, `/dagang/riwayat`, `/dagang/posisi`, `/dagang/:id` |
| BNB Chain trading (four.meme, Flap.sh, KyberSwap) | `bnb.rs` | `/dagang/bnb/siapkan`, `/dagang/bnb/lacak`, `/dagang/bnb/saldo`, `/dagang/bnb/posisi` |
| Rate limits | `batas.rs` | |

Route names are Indonesian (`siapkan` = prepare, `kirim` = send, `lacak` = track, `saldo` = balance, `posisi` = positions, `masuk` = sign in).

## A Solana trade, step by step

1. `POST /dagang/siapkan` with `{ mint, side, amount | percent, slippageBps, priorityLamports }`.
   - The service gets a route from Jupiter `/swap/v2/build`.
   - It assembles a v0 message with the route's lookup tables (`soltx.rs`, written by hand without `solana-sdk`).
   - It simulates the transaction with `sigVerify: false` and `replaceRecentBlockhash`.
   - It rebuilds the transaction with a compute limit of `used × 1.2 + 10,000` and a priority fee of `priorityLamports / CU`.
   - When the whole balance of one token account is sold, a `CloseAccount` instruction is appended so the rent comes back.
   - The unsigned transaction and the quote are stored as `prepared` and returned.
2. The wallet signs the transaction.
3. The signed transaction goes back to the service, which then tracks it until it confirms or its blockhash expires. Wallets that can sign without sending use `POST /dagang/kirim`; wallets that can only sign-and-send use `POST /dagang/lacak`.
   - **`kirim`:** the service checks that the fee payer is the signed-in account's wallet and that the signature is valid (`verify_strict`). It then sends the transaction with `skipPreflight` and rebroadcasts the same signed bytes every 2 s.
   - **`lacak`:** the wallet sends the transaction itself, and the service only tracks the signature.
4. On confirmation the service reads `getTransaction` and stores the real SOL and token balance changes. Positions and P/L come from those values, not from the quote.

Each prepared trade can be sent once. A transaction that the wallet changed after `siapkan` (for example, a different priority fee) is still forwarded, because it belongs to the user and they signed it. The change is logged.

## A BNB Chain trade, step by step

- **Choosing a venue.** The venue is detected on-chain: the four.meme bonding curve (BNB-quoted only), the Flap.sh curve, or KyberSwap for tokens that have graduated to a DEX.
- **Quotes.** Every quote is simulated with `eth_simulateV1`.
- **Honeypot check.** A buy is simulated as buy, approve and sell everything, in one call. Tokens that cannot be sold back are rejected, and the review shows how much BNB would come back.
- **Approvals.** A sell approves exactly the amount being sold, never an unlimited allowance.
- **Sending.** The wallet sends the transaction. `lacak` accepts the hash only if the sender is the account's wallet and the transaction matches the prepared one: SHA-256 of `to ‖ value ‖ data`.

## Setup

Requirements: Rust 1.80 or newer, Postgres 14 or newer.

```bash
# The service refuses to start with any other role or database name, so it can never be pointed at another database.
sudo -u postgres psql -c "CREATE ROLE akun_rw LOGIN PASSWORD 'change-me'"
sudo -u postgres psql -c "CREATE DATABASE synt_akun OWNER akun_rw"

cp .env.example .env   # edit the values
cargo test --release
cargo run --release    # migrations in migrations/ run automatically at boot
```

### Environment

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://akun_rw:...@127.0.0.1/synt_akun` |
| `AKUN_ORIGINS` | yes | Comma-separated origins allowed to sign in and change data, for example `https://localhost:8443`. Empty means every change is refused. |
| `AKUN_BIND`, `AKUN_PORT` | no | Listen address, default `127.0.0.1:5681` |
| `AKUN_RPC_URL` | for Solana trading | Solana mainnet RPC (HTTPS). Unset means Solana trading is turned off. |
| `AKUN_JUP_API_KEY` | no | Jupiter API key. Without it, requests are queued to stay under the keyless rate limit. |
| `AKUN_BSC_RPC_URL` | no | BNB Chain RPC with `eth_simulateV1`. Defaults to the public BNB Chain endpoint. |
| `AKUN_DASH_URL` | no | Public synt data API used for watchlist alerts. Default `http://127.0.0.1:5679`; `https://preview.synt.fun` works. |
| `AKUN_CLOUDFLARE` | no | `1` only when the origin is reachable through Cloudflare alone. Client IPs for rate limits are then read from `CF-Connecting-IP`. |
| `RUST_LOG` | no | Default `synt_akun=info` |

### Test without funds

The binary has a command that builds and simulates a real trade on mainnet without signing anything:

```bash
cargo run --release -- uji-dagang <wallet with SOL> <mint> buy <lamports>
cargo run --release -- uji-dagang <wallet holding the token> <mint> sell <raw amount | habis>
cargo run --release -- uji-bnb <0x wallet with BNB> <token> buy <wei>
```

### Deploy

`ops/synt-akun.service` is the systemd unit used in production. It runs as a `DynamicUser` with a strict sandbox. The binary is copied to `/opt/synt-akun/` because a dynamic user cannot read `/root`.
