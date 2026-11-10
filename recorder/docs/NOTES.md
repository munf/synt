# Chain notes: four.meme and Flap on BNB Chain

Things that are not obvious from the contracts' ABIs and that cost real data
when missed. Everything here was observed on chain while running the recorder.
Contracts get upgraded: treat the numbers as observations with a date (late
2026), not as constants, and re-check with `tools/probe.py`.

## Contracts

| Role | Address |
| --- | --- |
| four.meme TokenManager2 | `0x5c952063c7fc8610ffdb798152d69f0b9550762b` |
| four.meme TokenManagerHelper3 | `0xf251f83e40a78868fcfa3fa4599dad6494e46034` |
| Flap Portal | `0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0` |
| PancakeSwap V2 factory | `0xca143ce32fe78f1f7019d7d551a6402fc5350c73` |
| WBNB | `0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c` |

Native BNB as a quote asset is written as the zero address by both launchpads.

## Events

Every parameter of every event below is NON-indexed. The values are in `data`,
never in `topics`, so a topic filter can only select the event type, not a
token. `tools/topics.py` recomputes each hash from its signature.

### four.meme TokenManager2

| Event | Signature | topic0 |
| --- | --- | --- |
| Token created | `TokenCreate(address,address,uint256,string,string,uint256,uint256,uint256)` | `0x396d5e902b675b032348d3d2e9517ee8f0c4a926603fbc075d3d282ff00cad20` |
| Buy | `TokenPurchase(address,address,uint256,uint256,uint256,uint256,uint256,uint256)` | `0x7db52723a3b2cdd6164364b3b766e65e540d7be48ffa89582956d8eaebe62942` |
| Sell | `TokenSale(address,address,uint256,uint256,uint256,uint256,uint256,uint256)` | `0x0a5575b3648bae2210cee56bf33254cc1ddfbc7bf637c0af2ac18b14fb1bae19` |
| Curve closed | `TradeStop(address)` | `0x8f9ab4bd7eff0d085f91575d50cd83f97aa5258e24ded7630d4fd6739e857132` |
| Liquidity moved | `LiquidityAdded(address,uint256,address,uint256)` | `0xc18aa71171b358b706fe3dd345299685ba21a5316c66ffa9e319268b033c44b0` |

Field order:

- `TokenCreate(creator, token, requestId, name, symbol, totalSupply, launchTime, launchFee)`
- `TokenPurchase` / `TokenSale(token, account, price, amount, cost, fee, offers, funds)`
- `TradeStop(token)`
- `LiquidityAdded(base, offers, quote, funds)`

### Flap Portal

| Event | Signature | topic0 |
| --- | --- | --- |
| Token created | `TokenCreated(uint256,address,uint256,address,string,string,string)` | `0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603` |
| Buy | `TokenBought(uint256,address,address,uint256,uint256,uint256,uint256)` | `0xa800a2038683844fac66747f771bfdfae862eb28b16bcfa387afa9fbacce8ff7` |
| Sell | `TokenSold(uint256,address,address,uint256,uint256,uint256,uint256)` | `0x03a4693e592f5e75dc7c136acb39b146d2b4966c0e509c34f362dee02b3b861a` |
| Graduated | `LaunchedToDEX(address,address,uint256,uint256)` | `0x6e4f47630b8745b8cacbd44f42a8a33e7eea7cc08ef22fc7630f4f385784ff7d` |
| Quote asset | `TokenQuoteSet(address,address)` | `0x3ceb902d3c555c21c3415b6aa839104b18e4825b2f8324011ff979089a507a8c` |
| Curve | `TokenCurveSetV2(address,uint256,uint256,uint256)` | `0x71a10912a55f73d3cced0d1515c2b33c396c80342522bad0e295ccbede556f37` |
| Tax | `FlapTokenTaxSet(address,uint256)` | `0x1546924f4680b1b2e093fd251c437c8781d81a21ed8ad1895e1f2c9b78db0cd0` |
| Graduation threshold | `TokenDexSupplyThreshSet(address,uint256)` | `0x6f10bbe11587431707df676556a0551025a4f66551acdddc5793389e20f0d46e` |

Field order:

- `TokenCreated(ts, creator, nonce, token, name, symbol, meta)`
- `TokenBought` / `TokenSold(ts, token, account, amount, eth, fee, postPrice)`
- `LaunchedToDEX(token, pool, amount, eth)`
- `TokenQuoteSet(token, quote)`
- `TokenCurveSetV2(token, r, h, k)`
- `FlapTokenTaxSet(token, taxBps)`
- `TokenDexSupplyThreshSet(token, threshold)`

### Events that are not decoded

Both contracts emit more than the events above. On 10 Nov 2026 TokenManager2
emitted 2 further topics (one next to each buy, one next to each sell) and the
Portal 9 (two next to each trade, one next to most trades, five next to each
creation, one rare).
Their signatures are not known here and the recorder ignores them.
`tools/probe.py` lists them as `(unknown)` with their counts.

### PancakeSwap V2 pair

`Sync(uint112,uint112)` = `0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1`

### Function selectors

| Call | Selector |
| --- | --- |
| `getTokenInfo(address)` on Helper3 | `0x1f69565f` |
| `getPair(address,address)` on the V2 factory | `0xe6a43905` |
| `getReserves()` | `0x0902f1ac` |
| `token0()` | `0x0dfe1681` |
| `decimals()` | `0x313ce567` |
| `symbol()` | `0x95d89b41` |

## four.meme

**Every trade carries the curve state.** `price`, `offers` (tokens left on the
curve) and `funds` (quote held by the curve) in `TokenPurchase` / `TokenSale`
are the values AFTER the trade. No extra call is needed to follow the curve.

**The quote asset is not always BNB.** A token can be quoted in a stablecoin or
another token. The event does not say which; `Helper3.getTokenInfo(token)`
does. The reply has 12 words:

| # | Field | # | Field |
| --- | --- | --- | --- |
| 0 | version | 6 | launchTime |
| 1 | tokenManager | 7 | offers |
| 2 | quote | 8 | maxOffers |
| 3 | lastPrice | 9 | funds |
| 4 | tradingFeeRate | 10 | maxFunds |
| 5 | minTradingFee | 11 | liquidityAdded |

**A lagging node answers with zeros, not with an error.** Asking a node for a
token it has not seen yet returns an all-zero struct. Stored as is, `quote =
0x0` reads as "BNB" and a stablecoin-quoted token is priced as if it were
quoted in BNB. The recorder treats version 0 or a zero manager as "not ready",
retries 6 times with a growing delay, and a background task retries every
5 minutes after that. The columns stay NULL in the meantime.

**Do not hardcode the graduation threshold.** `maxFunds` differs per token:
values from 13.5 to 18 BNB were observed, and 10,000 or 12,000 for USDT-quoted
tokens. Read it per token.

**Do not compare `funds` or `price` across quote assets.** 18 means 18 BNB for
one token and 18 USDT for another.

**Graduation is two transactions.** `TradeStop` closes the curve.
`LiquidityAdded` moves the funds, but the PancakeSwap pair is funded in a
SEPARATE transaction about 10 seconds later. The graduation receipt therefore
often has no `Sync` log, and reading the pair address from it alone leaves most
four.meme graduations without a pair. The recorder asks the V2 factory
`getPair(token, quote)` (BNB mapped to WBNB) 15, 60 and 300 seconds after the
event, then once an hour for graduations of the last 14 days.

**A pair can exist before it is funded.** Anyone can create the pair early.
Such a pair reads 0/0 reserves; it is stored only once both reserves are above
zero.

**The pool opens at the curve price.** The first pool price equals the last
curve price (ratio 1.0000 when measured).

## Flap

**One contract.** Every token, trade and graduation goes through the Portal.

**Trades carry the price, not the reserves.** The curve is

    (x + r)(y + h) = k

with `x` = quote in the curve, `y` = tokens left on the curve, and `r`, `h`,
`k` set per token by `TokenCurveSetV2` in the creation transaction. The
marginal price is `P = k / (y + h)^2`, so the reserves after a trade follow
from the price in the event:

    x = sqrt(k * P) - r
    y = sqrt(k / P) - h

The default curve when measured: `r = 6.14`, `h = 107,036,752`, graduation at
800 million tokens in circulation, about 16 BNB in the curve.

**`k` does not fit in 128 bits.** For tokens with a non-BNB quote `k` reaches
about 1.9e40, above the u128 maximum (3.4e38). A decoder that reads words as
u128 drops the whole `TokenCurveSetV2` event and the reserves can never be
computed. Decode the full 256-bit word.

**The quote defaults to BNB.** Only a `TokenQuoteSet` in the creation
transaction changes it.

**Most tokens are tax tokens.** `FlapTokenTaxSet` gives the tax in basis
points; values from 100 to 1,000 were observed.

**"account" and "creator" are usually a router.** These fields hold the
contract that called the Portal: an aggregator router, a trading bot, a vault.
Close to nine in ten Flap trades went through such a contract when measured
(well under one in ten on four.meme). Counting distinct `account` values counts
routers, not people. The wallet is `tx.from`, which the recorder stores as
`sender`.

**`pool` in `LaunchedToDEX` is the pair.** In nearly every case it is a
PancakeSwap V2 pair, in the same transaction. A minority of pools are not V2:
they have code but revert `token0()` and `getReserves()`. The recorder stops
asking after 5 consecutive reverts.

**The pool opens above the curve price.** The first pool price was 1.1094 times
the last curve price when measured. A chart that joins curve and pool prices
shows a step there; it is in the data, not a recording error.

## DEX pairs

**Reserves are raw.** Launchpad events normalise amounts to 18 decimals. V2
pair reserves (`getReserves`, `Sync`) are in the quote asset's own decimals.
Quote assets with 6 and 8 decimals are in use; reading them as 18 puts the
price off by a factor of 1e12 or 1e10. The recorder reads `decimals()` once
per quote asset, stores it in `quote_assets`, and never assumes 18. Tokens
created by both launchpads have 18 decimals.

**`token0` is not fixed.** V2 orders the pair by address, so the launchpad
token is `token0` for some pairs and `token1` for others. Read `token0()`.

**One `eth_getLogs` beats many subscriptions.** A request with the `Sync`
topic and an address list of every watched pair returns every reserve change
of all of them. An address list of 331 pairs in one request was accepted. At a
60 second interval the whole sweep costs about 3 requests per minute (head,
block header, logs) whatever the number of pairs.

## RPC behaviour

- BSC produces a block about every 0.45 seconds. 500 blocks are under
  4 minutes.
- Logs from most nodes include `blockTimestamp`. When it is missing the
  recorder reads the block header.
- Some public endpoints reject `eth_getLogs` with a topic filter, limit the
  block range, or reject requests without a `User-Agent` header. The gap
  backfill therefore filters by address only and sorts topics out locally.
- Nodes with limited history drop old transactions first. `tx.from` should be
  fetched soon after the trade.
- Providers bill per JSON-RPC request, including each entry of a batch.
