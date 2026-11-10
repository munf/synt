//! Event decoding for four.meme (TokenManager2) and Flap (Portal).
//! Pure functions, no I/O, so everything here is unit tested.
//!
//! Every event parameter on both launchpads is NON-indexed: the values live in
//! `data`, not in `topics`. Topic hashes were computed from the signatures
//! listed in `docs/NOTES.md` and checked against logs on chain
//! (`tools/topics.py` recomputes them).

pub const FOURMEME_TOKEN_MANAGER2: &str = "0x5c952063c7fc8610ffdb798152d69f0b9550762b";
pub const FOURMEME_HELPER3: &str = "0xf251f83e40a78868fcfa3fa4599dad6494e46034";

// four.meme TokenManager2
pub const FM_TOKEN_CREATE: &str = "0x396d5e902b675b032348d3d2e9517ee8f0c4a926603fbc075d3d282ff00cad20";
pub const FM_TOKEN_PURCHASE: &str = "0x7db52723a3b2cdd6164364b3b766e65e540d7be48ffa89582956d8eaebe62942";
pub const FM_TOKEN_SALE: &str = "0x0a5575b3648bae2210cee56bf33254cc1ddfbc7bf637c0af2ac18b14fb1bae19";
pub const FM_TRADE_STOP: &str = "0x8f9ab4bd7eff0d085f91575d50cd83f97aa5258e24ded7630d4fd6739e857132";
pub const FM_LIQUIDITY_ADDED: &str = "0xc18aa71171b358b706fe3dd345299685ba21a5316c66ffa9e319268b033c44b0";
/// Uniswap-V2 style `Sync(uint112,uint112)` (PancakeSwap V2). Marks the pair
/// address in a graduation receipt and carries every reserve change afterwards.
pub const V2_SYNC: &str = "0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";

/// `getTokenInfo(address)` on Helper3.
pub const SEL_TOKEN_INFO: &str = "0x1f69565f";
/// V2 pair `getReserves()` / `token0()`.
pub const SEL_RESERVES: &str = "0x0902f1ac";
pub const SEL_TOKEN0: &str = "0x0dfe1681";
/// ERC-20 `decimals()` / `symbol()`.
pub const SEL_DECIMALS: &str = "0x313ce567";
pub const SEL_SYMBOL: &str = "0x95d89b41";

/// Native BNB as a quote asset is the zero address on both launchpads.
pub const BNB: &str = "0x0000000000000000000000000000000000000000";

// PancakeSwap V2. four.meme adds liquidity in a SEPARATE transaction roughly
// 10 seconds after graduation, so the graduation receipt often has no `Sync`
// log. The pair is then looked up with `getPair(token, quote)`.
pub const PANCAKE_V2_FACTORY: &str = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
/// Native BNB (quote `0x0`) is paired on the DEX as WBNB.
pub const WBNB: &str = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
/// V2 factory `getPair(address,address)`.
pub const SEL_GET_PAIR: &str = "0xe6a43905";

// Flap. ONE Portal contract emits creation, trades, configuration and
// graduation for every token.
pub const FLAP_PORTAL: &str = "0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0";
pub const FLAP_TOKEN_CREATED: &str = "0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603";
pub const FLAP_TOKEN_BOUGHT: &str = "0xa800a2038683844fac66747f771bfdfae862eb28b16bcfa387afa9fbacce8ff7";
pub const FLAP_TOKEN_SOLD: &str = "0x03a4693e592f5e75dc7c136acb39b146d2b4966c0e509c34f362dee02b3b861a";
pub const FLAP_LAUNCHED_TO_DEX: &str = "0x6e4f47630b8745b8cacbd44f42a8a33e7eea7cc08ef22fc7630f4f385784ff7d";
pub const FLAP_QUOTE_SET: &str = "0x3ceb902d3c555c21c3415b6aa839104b18e4825b2f8324011ff979089a507a8c";
pub const FLAP_CURVE_SET_V2: &str = "0x71a10912a55f73d3cced0d1515c2b33c396c80342522bad0e295ccbede556f37";
pub const FLAP_TAX_SET: &str = "0x1546924f4680b1b2e093fd251c437c8781d81a21ed8ad1895e1f2c9b78db0cd0";
pub const FLAP_DEX_THRESH_SET: &str = "0x6f10bbe11587431707df676556a0551025a4f66551acdddc5793389e20f0d46e";

pub const ALL_TOPICS: [&str; 13] = [
    FM_TOKEN_CREATE, FM_TOKEN_PURCHASE, FM_TOKEN_SALE, FM_TRADE_STOP, FM_LIQUIDITY_ADDED,
    FLAP_TOKEN_CREATED, FLAP_TOKEN_BOUGHT, FLAP_TOKEN_SOLD, FLAP_LAUNCHED_TO_DEX,
    FLAP_QUOTE_SET, FLAP_CURVE_SET_V2, FLAP_TAX_SET, FLAP_DEX_THRESH_SET,
];

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    Created {
        creator: String,
        token: String,
        request_id: String,
        name: String,
        symbol: String,
        total_supply: String,
        launch_time: u64,
        launch_fee: String,
    },
    Trade {
        buy: bool,
        token: String,
        account: String,
        price: String,
        amount: String,
        cost: String,
        fee: String,
        offers: String,
        funds: String,
    },
    TradeStop { token: String },
    LiquidityAdded { token: String, quote: String, funds: String },
    FlapCreated { creator: String, token: String, name: String, symbol: String, meta: String },
    /// Carries no curve reserves. They are derived from the price and the
    /// curve parameters (see `recorder.rs`).
    FlapTrade { buy: bool, token: String, account: String, amount: String, eth: String, fee: String, price: String },
    FlapGraduated { token: String, pool: String },
    FlapQuoteSet { token: String, quote: String },
    /// Curve `(x + r)(y + h) = k`; x = real quote, y = tokens left on the curve.
    FlapCurveSet { token: String, r: String, h: String, k: String },
    FlapTaxSet { token: String, bps: i32 },
    FlapThresholdSet { token: String, threshold: String },
}

fn words(data: &str) -> Vec<&str> {
    let d = data.trim_start_matches("0x");
    (0..d.len() / 64).map(|i| &d[i * 64..i * 64 + 64]).collect()
}

/// Last 40 hex characters of a word as an address. Never panics: short input
/// yields a string that equals no valid address. For RPC REPLIES use
/// [`address_reply`], which validates.
pub fn address(w: &str) -> String {
    let w = w.trim_start_matches("0x");
    format!("0x{}", w.get(w.len().saturating_sub(40)..).unwrap_or("")).to_lowercase()
}

/// An `eth_call` reply can be `"0x"` (no code at the address, or a lagging
/// node). Slicing it blindly panics, which kills the task and the process.
/// `None` unless the reply is one 256-bit word holding an address.
pub fn address_reply(h: &str) -> Option<String> {
    let h = h.trim_start_matches("0x");
    let w = h.get(..64)?;
    (w.bytes().all(|c| c.is_ascii_hexdigit()) && w[..24].bytes().all(|c| c == b'0')).then(|| address(w))
}

/// `decimals()` reply: one word, value <= 255 (uint8).
pub fn decimals_reply(h: &str) -> Option<i16> {
    let h = h.trim_start_matches("0x");
    let v = word_u128(h.get(..64)?)?;
    (v <= 255).then_some(v as i16)
}

/// `symbol()` reply: ABI `string` (offset, length, bytes) or the legacy
/// `bytes32` form. `None` when unreadable; truncated to 64 characters.
pub fn symbol_reply(h: &str) -> Option<String> {
    let h = h.trim_start_matches("0x");
    let bytes = |hex: &str| -> Option<Vec<u8>> {
        (0..hex.len() / 2).map(|i| u8::from_str_radix(hex.get(i * 2..i * 2 + 2)?, 16).ok()).collect()
    };
    let raw = if h.len() >= 128 && word_u128(h.get(..64)?)? == 32 {
        let n = word_u128(h.get(64..128)?)? as usize;
        bytes(h.get(128..128 + n.checked_mul(2)?)?)?
    } else if h.len() == 64 {
        bytes(h)?.into_iter().take_while(|b| *b != 0).collect()
    } else {
        return None;
    };
    let s: String = String::from_utf8_lossy(&raw).trim_matches(char::from(0)).trim().chars().take(64).collect();
    (!s.is_empty()).then_some(s)
}

/// 256-bit word to u128. `None` when the value exceeds u128, so nothing is
/// truncated silently.
pub fn word_u128(w: &str) -> Option<u128> {
    let w = w.trim_start_matches("0x");
    let (high, low) = w.split_at(w.len().saturating_sub(32));
    if high.chars().any(|c| c != '0') {
        return None;
    }
    u128::from_str_radix(low, 16).ok()
}

/// 18-decimal fixed point number to an exact decimal string for a `numeric`
/// column. Does not go through f64: early curve prices are around 4e-9 and
/// their precision matters for ratios.
pub fn fixed18(v: u128) -> String {
    let e = 1_000_000_000_000_000_000u128;
    let frac = format!("{:018}", v % e);
    let frac = frac.trim_end_matches('0');
    if frac.is_empty() {
        format!("{}", v / e)
    } else {
        format!("{}.{}", v / e, frac)
    }
}

/// 256-bit word to an 18-decimal string, over the FULL word (not u128).
///
/// Flap's curve constant `k` for tokens with a non-BNB quote reaches about
/// 1.9e40, above u128 (3.4e38). Decoding it through [`word_u128`] rejects the
/// whole `TokenCurveSetV2` event, the curve parameters are never stored and
/// the token's reserves cannot be computed. The value goes into a `numeric`
/// column, so there is no reason to cap it at u128.
fn word_fixed18(w: &str) -> Option<String> {
    let w = w.trim_start_matches("0x");
    if w.is_empty() || w.len() > 64 {
        return None;
    }
    // hex to decimal digits (little endian): multiply by 16, add the digit
    let mut dec: Vec<u8> = vec![0];
    for c in w.chars() {
        let mut carry = c.to_digit(16)?;
        for d in dec.iter_mut() {
            let v = *d as u32 * 16 + carry;
            *d = (v % 10) as u8;
            carry = v / 10;
        }
        while carry > 0 {
            dec.push((carry % 10) as u8);
            carry /= 10;
        }
    }
    while dec.len() < 19 {
        dec.push(0);
    }
    let text: String = dec.iter().rev().map(|d| char::from(b'0' + d)).collect();
    let (int, frac) = text.split_at(text.len() - 18);
    let int = int.trim_start_matches('0');
    let int = if int.is_empty() { "0" } else { int };
    let frac = frac.trim_end_matches('0');
    Some(if frac.is_empty() { int.to_string() } else { format!("{int}.{frac}") })
}

fn dyn_string(ws: &[&str], off: &str) -> Option<String> {
    let o = (word_u128(off)? / 32) as usize;
    let n = word_u128(ws.get(o)?)? as usize;
    let mut b = Vec::new();
    for w in ws.get(o + 1..o + 1 + n.div_ceil(32))? {
        for i in 0..32 {
            b.push(u8::from_str_radix(&w[i * 2..i * 2 + 2], 16).ok()?);
        }
    }
    b.truncate(n);
    Some(String::from_utf8_lossy(&b).replace('\0', ""))
}

/// `None` means an unknown topic OR malformed data. The caller tells the two
/// apart with [`is_known`], so malformed data is counted instead of vanishing.
pub fn decode(topic0: &str, data: &str) -> Option<Event> {
    let ws = words(data);
    match topic0 {
        // TokenCreate(creator, token, requestId, name, symbol, totalSupply, launchTime, launchFee)
        FM_TOKEN_CREATE => Some(Event::Created {
            creator: address(ws.first()?),
            token: address(ws.get(1)?),
            request_id: word_u128(ws.get(2)?)?.to_string(),
            name: dyn_string(&ws, ws.get(3)?)?,
            symbol: dyn_string(&ws, ws.get(4)?)?,
            total_supply: word_fixed18(ws.get(5)?)?,
            launch_time: word_u128(ws.get(6)?)? as u64,
            launch_fee: word_fixed18(ws.get(7)?)?,
        }),
        // TokenPurchase/TokenSale(token, account, price, amount, cost, fee, offers, funds)
        FM_TOKEN_PURCHASE | FM_TOKEN_SALE => {
            if ws.len() < 8 {
                return None;
            }
            Some(Event::Trade {
                buy: topic0 == FM_TOKEN_PURCHASE,
                token: address(ws[0]),
                account: address(ws[1]),
                price: word_fixed18(ws[2])?,
                amount: word_fixed18(ws[3])?,
                cost: word_fixed18(ws[4])?,
                fee: word_fixed18(ws[5])?,
                offers: word_fixed18(ws[6])?,
                funds: word_fixed18(ws[7])?,
            })
        }
        FM_TRADE_STOP => Some(Event::TradeStop { token: address(ws.first()?) }),
        // TokenCreated(ts, creator, nonce, token, name, symbol, meta)
        FLAP_TOKEN_CREATED => Some(Event::FlapCreated {
            creator: address(ws.get(1)?),
            token: address(ws.get(3)?),
            name: dyn_string(&ws, ws.get(4)?)?,
            symbol: dyn_string(&ws, ws.get(5)?)?,
            meta: dyn_string(&ws, ws.get(6)?)?,
        }),
        // TokenBought/TokenSold(ts, token, account, amount, eth, fee, postPrice)
        FLAP_TOKEN_BOUGHT | FLAP_TOKEN_SOLD => {
            if ws.len() < 7 {
                return None;
            }
            Some(Event::FlapTrade {
                buy: topic0 == FLAP_TOKEN_BOUGHT,
                token: address(ws[1]),
                account: address(ws[2]),
                amount: word_fixed18(ws[3])?,
                eth: word_fixed18(ws[4])?,
                fee: word_fixed18(ws[5])?,
                price: word_fixed18(ws[6])?,
            })
        }
        // LaunchedToDEX(token, pool, amount, eth)
        FLAP_LAUNCHED_TO_DEX => {
            Some(Event::FlapGraduated { token: address(ws.first()?), pool: address(ws.get(1)?) })
        }
        FLAP_QUOTE_SET => Some(Event::FlapQuoteSet { token: address(ws.first()?), quote: address(ws.get(1)?) }),
        // TokenCurveSetV2(token, r, h, k)
        FLAP_CURVE_SET_V2 => Some(Event::FlapCurveSet {
            token: address(ws.first()?),
            r: word_fixed18(ws.get(1)?)?,
            h: word_fixed18(ws.get(2)?)?,
            k: word_fixed18(ws.get(3)?)?,
        }),
        FLAP_TAX_SET => Some(Event::FlapTaxSet { token: address(ws.first()?), bps: word_u128(ws.get(1)?)? as i32 }),
        FLAP_DEX_THRESH_SET => {
            Some(Event::FlapThresholdSet { token: address(ws.first()?), threshold: word_fixed18(ws.get(1)?)? })
        }
        // LiquidityAdded(base, offers, quote, funds)
        FM_LIQUIDITY_ADDED => Some(Event::LiquidityAdded {
            token: address(ws.first()?),
            quote: address(ws.get(2)?),
            funds: word_fixed18(ws.get(3)?)?,
        }),
        _ => None,
    }
}

pub fn is_known(topic0: &str) -> bool {
    ALL_TOPICS.contains(&topic0)
}

/// Address as a left-padded 32-byte calldata argument.
pub fn address_arg(a: &str) -> String {
    format!("{:0>64}", a.trim_start_matches("0x").to_lowercase())
}

/// Launchpad quote to the counter asset of the DEX pair (native BNB = WBNB).
pub fn pair_quote(quote: &str) -> String {
    let q = quote.to_lowercase();
    if q == BNB { WBNB.to_owned() } else { q }
}

/// Calldata for `getPair(token, quote)` (argument order does not matter on a
/// V2 factory).
pub fn get_pair_calldata(token: &str, quote: &str) -> String {
    format!("{SEL_GET_PAIR}{}{}", address_arg(token), address_arg(&pair_quote(quote)))
}

/// `getPair` reply to a pair address. `None` for the zero address (pair not
/// created yet) or an invalid reply.
pub fn pair_reply(h: &str) -> Option<String> {
    address_reply(h).filter(|a| a != BNB)
}

/// `getReserves()` reply: `Some(true)` when BOTH reserves are > 0. A pair
/// created early (for example by a sniper) but not funded yet reads 0/0 and
/// gives `Some(false)`: do not store it yet, retry. `None` = invalid reply.
pub fn reserves_filled(h: &str) -> Option<bool> {
    let w = words(h);
    if w.len() < 2 {
        return None;
    }
    Some(word_u128(w[0])? > 0 && word_u128(w[1])? > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_pair_calldata_and_reply() {
        let t = "0x9e112839709644b6ba0407bcf4f93a91b6d5ffff";
        // Native BNB quote becomes WBNB.
        assert_eq!(pair_quote(BNB), WBNB);
        assert_eq!(pair_quote("0x55D398326f99059fF775485246999027B3197955"), "0x55d398326f99059ff775485246999027b3197955");
        let d = get_pair_calldata(t, BNB);
        assert_eq!(d.len(), 10 + 128);
        assert!(d.starts_with("0xe6a43905000000000000000000000000"));
        assert!(d.ends_with("bb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"));
        // A real reply for the token above.
        let r = "0x000000000000000000000000f1124f92749d7df364339384a4e8268d31456b3f";
        assert_eq!(pair_reply(r).as_deref(), Some("0xf1124f92749d7df364339384a4e8268d31456b3f"));
        assert_eq!(pair_reply(&format!("0x{}", "0".repeat(64))), None);
        assert_eq!(pair_reply("0x"), None);
    }

    #[test]
    fn empty_reserves_rejected() {
        let k = |a: u128, b: u128| format!("0x{:064x}{:064x}{:064x}", a, b, 1_761_000_000u128);
        assert_eq!(reserves_filled(&k(685_267_292, 4)), Some(true));
        assert_eq!(reserves_filled(&k(0, 0)), Some(false));
        assert_eq!(reserves_filled(&k(5, 0)), Some(false));
        assert_eq!(reserves_filled("0x"), None);
    }

    #[test]
    fn short_rpc_reply_does_not_panic() {
        assert_eq!(address_reply("0x"), None);
        assert_eq!(address_reply(""), None);
        assert_eq!(address("0x"), "0x");
        let w = "0x000000000000000000000000bb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
        assert_eq!(address_reply(w).as_deref(), Some("0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"));
        assert_eq!(address(w), "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c");
        // A word with a non-zero upper part is not an address.
        assert_eq!(address_reply(&format!("0x1{}", &w[3..])), None);
        assert_eq!(decimals_reply("0x"), None);
    }

    #[test]
    fn decimals_and_symbol_from_reply() {
        // Real replies for XAUt on BSC.
        assert_eq!(decimals_reply("0x0000000000000000000000000000000000000000000000000000000000000006"), Some(6));
        assert_eq!(decimals_reply(&format!("0x{:064x}", 1000)), None);
        let s = "0x0000000000000000000000000000000000000000000000000000000000000020\
                 0000000000000000000000000000000000000000000000000000000000000004\
                 5841557400000000000000000000000000000000000000000000000000000000";
        assert_eq!(symbol_reply(s).as_deref(), Some("XAUt"));
        // Legacy bytes32 form (MKR).
        assert_eq!(symbol_reply("0x4d4b520000000000000000000000000000000000000000000000000000000000").as_deref(), Some("MKR"));
        assert_eq!(symbol_reply("0x"), None);
    }

    fn w(v: u128) -> String {
        format!("{v:064x}")
    }

    #[test]
    fn fixed18_is_exact() {
        assert_eq!(fixed18(4_464_288_736_000_000_000), "4.464288736");
        assert_eq!(fixed18(4_464_288_736), "0.000000004464288736");
        assert_eq!(fixed18(13_700_000_000_000_000_000), "13.7");
        assert_eq!(fixed18(0), "0");
    }

    #[test]
    fn word_fixed18_matches_fixed18_for_u128_values() {
        for v in [0u128, 1, 999_999_999_999_999_999, 1_000_000_000_000_000_000, 1_500_000_000_000_000_000, u128::MAX] {
            assert_eq!(word_fixed18(&format!("{v:064x}")), Some(fixed18(v)), "v={v}");
        }
    }

    #[test]
    fn word_fixed18_holds_curve_k_above_u128() {
        // A real curve `k` (tx 0x373b7a17..., block 128593780).
        let k = "00000000000000000000000000000022f6cc95df753c9a45a6202909dbdb33c5";
        assert_eq!(word_u128(k), None);
        // 0x22f6...33c5 = 11897652830617332362332642428995461919685 (computed separately)
        assert_eq!(word_fixed18(k).as_deref(), Some("11897652830617332362332.642428995461919685"));
    }

    #[test]
    fn word_above_u128_rejected() {
        let big = format!("{}{}", "1", "0".repeat(63));
        assert_eq!(word_u128(&big), None);
    }

    #[test]
    fn trade_decodes() {
        // Shape of a real TokenPurchase log (token 0x68f6...4444, quote USDT).
        let data = format!(
            "0x{}{}{}{}{}{}{}{}",
            address_arg("0x68f65417725ec53ea54d17d7ae46fe1339ab4444"),
            address_arg("0x00000000000000000000000000000000000000aa"),
            w(3_328_032_580_137),
            w(1_000_000_000_000_000_000_000),
            w(500_000_000_000_000_000),
            w(5_000_000_000_000_000),
            w(118_600_000 * 1_000_000_000_000_000_000),
            w(73_980_000_000_000_000_000),
        );
        let Some(Event::Trade { buy, token, price, funds, offers, .. }) = decode(FM_TOKEN_PURCHASE, &data)
        else {
            panic!("decode failed")
        };
        assert!(buy);
        assert_eq!(token, "0x68f65417725ec53ea54d17d7ae46fe1339ab4444");
        assert_eq!(price, "0.000003328032580137");
        assert_eq!(funds, "73.98");
        assert_eq!(offers, "118600000");
    }

    #[test]
    fn created_with_strings() {
        // creator, token, requestId, off(name)=0x100, off(symbol)=0x140,
        // supply, launchTime, fee, then "Axel" and "AXEL".
        let s = |t: &str| {
            let mut h = hex(t.as_bytes());
            h.push_str(&"0".repeat(64 - h.len()));
            format!("{}{}", w(t.len() as u128), h)
        };
        let data = format!(
            "0x{}{}{}{}{}{}{}{}{}{}",
            address_arg("0xa79d821cb8c7eac778e6862ad99296fc7958576f"),
            address_arg("0x24a3de6ffef6b5bbbefced881c60a92099d2ffff"),
            w(7),
            w(0x100),
            w(0x140),
            w(1_000_000_000 * 1_000_000_000_000_000_000),
            w(1_760_500_000),
            w(0),
            s("Axel"),
            s("AXEL"),
        );
        let Some(Event::Created { name, symbol, total_supply, token, .. }) = decode(FM_TOKEN_CREATE, &data)
        else {
            panic!("decode failed")
        };
        assert_eq!((name.as_str(), symbol.as_str()), ("Axel", "AXEL"));
        assert_eq!(total_supply, "1000000000");
        assert_eq!(token, "0x24a3de6ffef6b5bbbefced881c60a92099d2ffff");
    }

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    #[test]
    fn flap_buy_decodes() {
        // Shape of a real TokenBought log: amount 222.658..., eth 9.94e-6, postPrice 4.2856e-8.
        let data = format!(
            "0x{}{}{}{}{}{}{}",
            w(1_760_540_000),
            address_arg("0x2d208cc14371cd13a426a15bc97470d737e27777"),
            address_arg("0x00000000000000000000000000000000000000bb"),
            w(222_658_698_408_395_540_000),
            w(9_940_000_000_000),
            w(99_400_000_000),
            w(42_856_647_430),
        );
        let Some(Event::FlapTrade { buy, token, eth, price, .. }) = decode(FLAP_TOKEN_BOUGHT, &data) else {
            panic!("decode failed")
        };
        assert!(buy);
        assert_eq!(token, "0x2d208cc14371cd13a426a15bc97470d737e27777");
        assert_eq!(eth, "0.00000994");
        assert_eq!(price, "0.00000004285664743");
    }

    #[test]
    fn unknown_topic_is_none() {
        assert!(decode("0xdeadbeef", "0x").is_none());
        assert!(!is_known("0xdeadbeef"));
    }
}
