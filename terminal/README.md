# synt terminal

The web app at https://preview.synt.fun: React 18 and TypeScript, built with Vite. There is no UI framework and no state library; styles are plain CSS with shared tokens in `src/styles/tokens.css`.

## Run it

Requirements: Node 20 or newer.

```bash
npm install

# against the live demo API (no backend needed)
VITE_API_ORIGIN=https://preview.synt.fun \
VITE_LIVE_ORIGIN=https://preview.synt.fun/live \
npm run dev            # http://localhost:5173

npm run typecheck
npm run build          # output in dist/
```

The dev server proxies three paths, so the browser only ever talks to one origin:

| Path | Goes to | Default target | Variable |
|---|---|---|---|
| `/api/akun/*` | account service ([`../account`](../account)) | `http://127.0.0.1:5681` | `VITE_AKUN_ORIGIN` |
| `/api/*` | synt data API (scores, pairs, candles, holders) | `http://127.0.0.1:5679` | `VITE_API_ORIGIN` |
| `/live/*` | synt price stream (Server-Sent Events) | `http://127.0.0.1:5680` | `VITE_LIVE_ORIGIN` |

In production a reverse proxy does the same routing. No backend URL or key is bundled into the client. Vite bundles every `VITE_*` variable into the JavaScript, so never put a secret in one.

`npm run build -- --mode template` builds a version where every page uses sample data (`src/features/*/mock.ts`). It is used to review unfinished pages and is never deployed publicly.

## Map of the code

| Path | What it is |
|---|---|
| `src/routes/` | One file per page: Trenches, Coin (Solana token), BnbToken, Feed (Discovery), Leaderboard, Wallet, Profile, Inbox, Settings, Legal |
| `src/features/trenches/` | The live pair table and side panels: sorting, filters, column dropping by card width, Quick buy |
| `src/features/token/` | The token page: header, market strip, score card with its calibration ladder, explanation, holders, and the KLineChart Pro chart with live candles |
| `src/features/trade/` | Trading: the Buy/Sell panel, the review dialog, transaction status toasts, positions. `dagang.ts` is Solana, `dagangBnb.ts` is BNB Chain |
| `src/features/account/` | Wallet sign-in (Wallet Standard for Solana, EIP-6963 for EVM), session, watchlist and settings sync, alerts and messages |
| `src/features/bnb/` | BNB Chain pairs (four.meme and Flap.sh) |
| `src/features/discovery/` | Posts written by the synt agent and reviewed by the team before they are published |
| `src/api/` | Typed client for the data API |
| `src/lib/` | Formatting, polling, the SSE hook, the watchlist |

## How a trade works in the UI

1. **Panel.** `TradePanel` takes an amount: SOL for a buy, or a percentage or amount of the token for a sell. It reads the wallet balance through the account service.
2. **Quote and review.** `jalankan` in `dagang.ts` asks the account service to prepare an unsigned transaction. It then opens the review dialog (`TradeLayer.tsx`), which shows the quote, the minimum received, the price impact, the slippage, the network and priority fee, and the route.
3. **Re-quote.** If the quote is older than 40 seconds when the user confirms, a fresh quote is fetched and reviewed again.
4. **Sign and send.** The wallet signs through the Wallet Standard `signTransaction`, and the signed bytes go back to the service to be sent and tracked. Wallets that only support sign-and-send send the transaction themselves, and the service tracks it.
5. **Status.** A toast follows the transaction until it is confirmed and links to Solscan. When it confirms, positions and the portfolio reload.

Quick buy in Trenches runs the same flow with a saved default amount. The review dialog is shown unless the user turns off "Confirm before trading" in Quick buy settings.
