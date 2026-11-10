-- bsc-launchpad-recorder schema. Idempotent: applied on every start.
--
-- Addresses and hashes are lowercase hex text with the 0x prefix.
-- Amounts are whole units (18 decimals already divided out) unless noted.

-- One row per token created on a launchpad.
CREATE TABLE IF NOT EXISTS tokens (
    token         text PRIMARY KEY,
    launchpad     text NOT NULL CHECK (launchpad IN ('fourmeme', 'flap')),
    -- `creator` is the address in the event. On Flap this is often a router
    -- contract; `sender` is tx.from, the wallet that signed the transaction.
    creator       text NOT NULL,
    sender        text,
    name          text,
    symbol        text,
    meta          text,            -- Flap only: metadata reference
    request_id    numeric,         -- four.meme only
    total_supply  numeric,         -- four.meme only
    launch_time   timestamptz,     -- four.meme only
    launch_fee    numeric,         -- four.meme only
    block_number  bigint NOT NULL,
    tx_hash       text NOT NULL,
    created_at    timestamptz NOT NULL,   -- block time of the creation
    -- Quote asset: the zero address = native BNB. NULL = not read yet.
    quote         text,
    max_funds     numeric,         -- four.meme: quote raised at graduation
    version       int,             -- four.meme: TokenManager version; NULL = info not read yet
    info_at       timestamptz,
    tax_bps       int,             -- Flap: token tax in basis points
    curve_r       numeric,         -- Flap curve (x + r)(y + h) = k
    curve_h       numeric,
    curve_k       numeric,
    dex_threshold numeric          -- Flap: circulating supply that triggers graduation
);
CREATE INDEX IF NOT EXISTS tokens_created_at_idx ON tokens (created_at);
CREATE INDEX IF NOT EXISTS tokens_sender_idx ON tokens (sender, created_at);
CREATE INDEX IF NOT EXISTS tokens_sender_null_idx ON tokens (block_number) WHERE sender IS NULL;
CREATE INDEX IF NOT EXISTS tokens_version_null_idx ON tokens (created_at) WHERE version IS NULL;

-- One row per bonding curve trade.
CREATE TABLE IF NOT EXISTS trades (
    tx_hash       text NOT NULL,
    log_index     int NOT NULL,
    token         text NOT NULL,
    launchpad     text NOT NULL,
    side          text NOT NULL CHECK (side IN ('B', 'S')),
    account       text NOT NULL,   -- address in the event (may be a router)
    sender        text,            -- tx.from
    price         numeric,         -- quote per token after the trade
    amount        numeric,         -- tokens
    cost          numeric,         -- quote paid (buy) or received (sell)
    fee           numeric,         -- quote
    -- Curve state after the trade. four.meme: from the event. Flap: derived
    -- from the price and the curve parameters; NULL when they are unknown.
    offers        numeric,         -- tokens left on the curve
    funds         numeric,         -- quote held by the curve
    block_number  bigint NOT NULL,
    block_time    timestamptz NOT NULL,
    PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS trades_token_time_idx ON trades (token, block_time);
CREATE INDEX IF NOT EXISTS trades_block_time_idx ON trades (block_time);
CREATE INDEX IF NOT EXISTS trades_tx_hash_idx ON trades (tx_hash);
CREATE INDEX IF NOT EXISTS trades_sender_null_idx ON trades (block_number) WHERE sender IS NULL;

-- One row per token that left its bonding curve for a DEX.
CREATE TABLE IF NOT EXISTS graduations (
    token         text PRIMARY KEY,
    launchpad     text NOT NULL,
    block_number  bigint NOT NULL,
    block_time    timestamptz NOT NULL,
    tx_hash       text NOT NULL,
    pool          text,            -- Flap: pool address in the event
    pair          text,            -- PancakeSwap V2 pair; NULL = not found yet
    quote         text,            -- four.meme: quote in LiquidityAdded
    funds         numeric          -- four.meme: quote moved to the pair
);
CREATE INDEX IF NOT EXISTS graduations_block_time_idx ON graduations (block_time);

-- Pool price after graduation. `price` = quote per token, `quote_reserve` =
-- quote held by the pair, both normalised to whole units.
CREATE TABLE IF NOT EXISTS pool_prices (
    token         text NOT NULL,
    ts            timestamptz NOT NULL,
    price         numeric NOT NULL,
    quote_reserve numeric NOT NULL,
    PRIMARY KEY (token, ts)
);

-- Decimals of quote assets, read on chain once and cached here.
CREATE TABLE IF NOT EXISTS quote_assets (
    quote         text PRIMARY KEY,
    symbol        text,
    decimals      smallint
);

-- Last block that is certainly complete (single row).
CREATE TABLE IF NOT EXISTS sync_cursor (
    id            int PRIMARY KEY CHECK (id = 1),
    block_number  bigint NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
