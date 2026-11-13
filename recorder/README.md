# bsc-launchpad-recorder

Records every token launch, bonding curve trade, graduation and
post-graduation pool price of the two main BNB Chain launchpads,
four.meme and Flap, into PostgreSQL.

It is a data layer and nothing else: one small Rust process, one RPC endpoint,
six tables. No scoring, no trading, no API server. Point your own analysis,
dashboard or bot at the database.

Not affiliated with four.meme, Flap or PancakeSwap.

## What you get

| Table | One row per | Source |
| --- | --- | --- |
| `tokens` | token created on a launchpad | `TokenCreate` / `TokenCreated`, plus quote asset, graduation target, curve parameters, tax |
| `trades` | bonding curve buy or sell | `TokenPurchase` / `TokenSale` / `TokenBought` / `TokenSold`, with the curve state after the trade |
| `graduations` | token that moved to a DEX | `TradeStop` / `LiquidityAdded` / `LaunchedToDEX`, plus the PancakeSwap V2 pair |
| `pool_prices` | pool price sample after graduation | `getReserves` polls and `Sync` logs |
| `quote_assets` | quote asset seen in a pair | `decimals()` and `symbol()`, read once |
| `sync_cursor` | (single row) | last block that is certainly complete |

Both the address in the event (`account`, `creator`) and the wallet that signed
the transaction (`sender`, from `tx.from`) are stored. On Flap the first one is
usually a router contract, so wallet-level analysis needs the second.

Column by column documentation is in [`schema.sql`](schema.sql). What the
contracts actually do, and the traps that cost data, are in
[`docs/NOTES.md`](docs/NOTES.md).

## How it works

```
                 eth_subscribe logs (1 subscription, 2 contracts, 13 topics)
 BNB Chain WSS  ------------------------------------------------------------+
                                                                            v
 BNB Chain HTTP --- eth_getLogs (gap backfill after a reconnect) ------> recorder ----> tokens
                --- eth_call getTokenInfo (four.meme quote, target) ---> recorder ----> trades
                --- receipt / getPair (find the DEX pair) -------------> recorder ----> graduations
                --- eth_call getReserves every 30 s (young tokens) ----> pool_poll ---> pool_prices
                --- eth_getLogs Sync every 60 s (all older pairs) -----> pool_sweep --> pool_prices
                --- eth_getTransactionByHash, batched -----------------> sender ------> trades.sender, tokens.sender
```

- **No silent holes.** The subscription is opened first, then the range since
  the stored cursor is filled with `eth_getLogs`. Every insert is idempotent,
  so the overlap is harmless. The cursor only moves once a backfill has
  finished. 90 seconds without a log counts as a dead connection.
- **Nothing is guessed.** A quote asset, a decimals value or a pair that
  cannot be read stays NULL and is retried. Malformed data for a known event is
  logged and counted, never dropped quietly.
- **Two price writers, no overlap.** A graduated token younger than 100 minutes
  is polled every 30 seconds. After that its pair joins a single `Sync` sweep
  that covers every pair graduated in the last 7 days (up to 1,000) and stores
  the open, high, low and close `Sync` of each minute.
- **Crash only.** If any task stops, the process exits. Run it under a
  supervisor; on restart it resumes from the cursor.

## Requirements

- A recent stable Rust toolchain (developed with 1.99).
- PostgreSQL 14 or newer (tested on 18).
- A BNB Chain RPC endpoint with:
  - WebSocket `eth_subscribe` for logs,
  - `eth_getLogs` over ranges of 500 to 1,000 blocks with several addresses,
  - `eth_call` at a recent block number, receipts and transactions by hash,
  - JSON-RPC batch requests (used for `tx.from`, 50 per batch).

The public endpoint `bsc-rpc.publicnode.com` met all of these when tested and
is the default in `.env.example`. It is fine for trying the recorder out. For
continuous recording use a provider you have an agreement with: public
endpoints rate limit, lag and change without notice.

## Quick start

```sh
git clone https://github.com/munf/synt.git && cd synt/recorder

# 1. Database
createuser recorder --pwprompt
createdb launchpads --owner recorder

# 2. Configuration
cp .env.example .env
$EDITOR .env            # set DATABASE_URL; keep the public RPC for a trial

# 3. Run. The schema is created on first start.
cargo run --release
```

Trades show up within seconds, launches as they happen (usually within a
minute or two):

```sh
psql launchpads -c "SELECT launchpad, count(*) FROM tokens GROUP BY 1"
psql launchpads -c "SELECT launchpad, side, count(*) FROM trades GROUP BY 1, 2"
```

Recording starts at the current block. Tokens created earlier are not in
`tokens` (their trades still arrive, see Limits). To start from an earlier
block, insert the cursor yourself before the first start; the recorder then
backfills from there:

```sql
-- after the schema exists (start once, stop, or run schema.sql by hand)
INSERT INTO sync_cursor (id, block_number) VALUES (1, 132000000);
```

Old ranges need an RPC node that still serves those logs, and take about one
request per 500 blocks.

## Configuration

Read from the environment or from `.env` in the working directory.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | | PostgreSQL connection string |
| `BSC_WSS_URL` | yes | | WebSocket RPC, used for the log subscription |
| `BSC_HTTP_URL` | yes | | HTTP RPC, used for everything else |
| `BSC_RPS` | no | `10` | request ceiling per second for recorder and price writers |
| `BSC_RPS_SENDER` | no | `25` | separate ceiling for the `tx.from` backfill |
| `BACKFILL_CHUNK_BLOCKS` | no | `500` | blocks per `eth_getLogs` when filling a gap |
| `RUST_LOG` | no | `info,sqlx=warn` | log filter |

The RPC URLs usually contain an API key. Keep `.env` out of version control
(`.gitignore` already does) and readable only by the service user.

### RPC budget

Providers bill per JSON-RPC request, including each entry of a batch. The
recorder counts requests the same way and prints the total every 5 minutes, so
you can size a plan from a real run instead of an estimate. What drives the
count:

- `sender`: one request per transaction that contains a trade or a launch.
  This is the largest part.
- `pool_poll`: one `eth_call` per 30 seconds for each graduated token younger
  than 100 minutes.
- `pool_sweep`: about 3 requests per minute, whatever the number of pairs,
  plus `getReserves` seeds after a restart.
- `recorder`: one `eth_call` per four.meme launch, a handful per graduation,
  and one `eth_getLogs` per 500 blocks of downtime.

As a reference point, a 5 minute trial on 10 Nov 2026 recorded 27 launches and
548 trades with 552 requests, 537 of them from `sender`. No token graduated in
that window, so the price writers were idle.

The WebSocket subscription delivers every launchpad log. Check how your
provider bills subscription notifications.

## Running as a service

[`deploy/recorder.service`](deploy/recorder.service) is a systemd unit with the
install commands in its header. The process needs no writable directory and no
open port.

Health, from the journal:

```
5 min: created 27, trades 548, graduated 0, malformed 0, backfill logs 0, RPC requests 15 (+537 sender), block 132699787
```

`malformed` should stay 0; anything
else means a contract changed an event, and the warning above it names the
transaction. From the database:

```sql
SELECT block_number, now() - updated_at AS age FROM sync_cursor;
```

`age` should stay under a minute.

## Example queries

Launches per hour:

```sql
SELECT date_trunc('hour', created_at) AS hour, launchpad, count(*)
  FROM tokens
 WHERE created_at > now() - interval '24 hours'
 GROUP BY 1, 2 ORDER BY 1, 2;
```

Graduation rate by launch day:

```sql
SELECT date_trunc('day', t.created_at) AS day, t.launchpad,
       count(*) AS launched, count(g.token) AS graduated,
       round(100.0 * count(g.token) / count(*), 2) AS pct
  FROM tokens t LEFT JOIN graduations g USING (token)
 GROUP BY 1, 2 ORDER BY 1, 2;
```

Distinct wallets (not routers) that bought a token in its first 5 minutes:

```sql
SELECT count(DISTINCT coalesce(tr.sender, tr.account))
  FROM trades tr JOIN tokens t USING (token)
 WHERE tr.token = '0x...' AND tr.side = 'B'
   AND tr.block_time < t.created_at + interval '5 minutes';
```

One-minute candles on the curve, in the token's quote asset:

```sql
SELECT date_trunc('minute', block_time) AS minute,
       (array_agg(price ORDER BY block_number, log_index))[1]           AS open,
       max(price) AS high, min(price) AS low,
       (array_agg(price ORDER BY block_number DESC, log_index DESC))[1] AS close,
       sum(cost) AS volume
  FROM trades
 WHERE token = '0x...'
 GROUP BY 1 ORDER BY 1;
```

Progress of a four.meme token towards graduation:

```sql
SELECT tr.funds, t.max_funds, round(100 * tr.funds / t.max_funds, 1) AS pct
  FROM trades tr JOIN tokens t USING (token)
 WHERE tr.token = '0x...' AND t.max_funds > 0
 ORDER BY tr.block_number DESC, tr.log_index DESC LIMIT 1;
```

Latest price, pool once graduated and curve before that:

```sql
SELECT coalesce(
  (SELECT price FROM pool_prices WHERE token = '0x...' ORDER BY ts DESC LIMIT 1),
  (SELECT price FROM trades WHERE token = '0x...'
    ORDER BY block_number DESC, log_index DESC LIMIT 1)) AS price;
```

Prices and amounts are in each token's own quote asset (`tokens.quote`; the
zero address is BNB). Never sum or compare them across different quotes
without converting first.

## Tools

Python 3, standard library only.

| Script | Use |
| --- | --- |
| `tools/keccak.py "<signature>"` | Keccak-256 of an event or function signature |
| `tools/topics.py` | recompute every topic and selector and compare with `src/abi.rs` |
| `tools/probe.py [fourmeme\|flap\|0x...]` | count what a contract emitted recently, by topic; shows unknown events after an upgrade |

## Limits

- **No history before the first start**, unless you set the cursor (above). A
  trade of a token created before recording started is stored without a
  `tokens` row; for Flap its `offers` and `funds` are NULL because the curve
  parameters were never seen. Such a token's graduation is stored with its
  pair, but it gets no `pool_prices` rows: both price writers need the
  creation time and quote asset from `tokens`.
- **Prices are in the quote asset, not in USD.** No price feed is included.
- **Pool prices cover PancakeSwap V2 pairs only.** A Flap pool that is not a
  V2 pair is recorded in `graduations.pool` but has no rows in `pool_prices`.
- **Pool prices are sampled in the first 100 minutes** of a token's life (every
  30 seconds), not taken from every `Sync`. After that every minute keeps its
  exact open, high, low and close.
- **Pool prices stop** 7 days after graduation, when the quote reserve falls
  below 1% of the first recorded one, or beyond the 1,000 most recent
  graduations.
- **Pool prices have a gap after a restart.** The `Sync` sweep keeps its block
  cursor in memory only. After a restart it starts at the head, 90 seconds
  after the process, and stores each pair's reserves at that block instead.
  `Sync` logs from the stop until then are not recorded, and `pool_poll` takes
  no samples while the process is down.
- **Pool prices go through `f64`.** Curve trades are exact decimal strings from
  the event; pool prices carry about 15 significant digits.
- **Reorgs.** A `removed` log deletes its trade. The `Sync` sweep stays 3
  blocks behind the head. Token and graduation rows from a removed log are not
  deleted.
- **Contracts change.** Both launchpads are upgradeable. A new event is
  ignored until it is added to `src/abi.rs`; a changed one shows up as
  `malformed`. Run `tools/probe.py` now and then.
- **One process per database.** There is no coordination between instances.

## Development

```sh
cargo test                 # 27 unit tests, no network or database needed
python3 tools/topics.py    # topic and selector constants match their signatures
```

Layout:

| File | Role |
| --- | --- |
| `src/abi.rs` | addresses, topics, event decoding (pure, tested) |
| `src/rpc.rs` | JSON-RPC over HTTP, one throttle and one request counter |
| `src/recorder.rs` | subscription, gap backfill, inserts, pair discovery, four.meme token info |
| `src/pool_poll.rs` | pool price of young graduated tokens |
| `src/pool_sweep.rs` | pool price of older pairs from `Sync` logs |
| `src/decimals.rs` | quote asset decimals |
| `src/sender.rs` | `tx.from` for trades and launches |
| `src/main.rs` | configuration, task wiring, periodic report |

## License

MIT. See [LICENSE](LICENSE).
