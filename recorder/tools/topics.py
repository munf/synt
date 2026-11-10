#!/usr/bin/env python3
"""Recompute every event topic and function selector used by the recorder and
compare them with the constants in src/abi.rs.

    python3 tools/topics.py

Exit code 0 = every constant matches its signature. Run it after changing a
signature or adding an event.
"""

import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from keccak import keccak256  # noqa: E402

# constant in src/abi.rs -> canonical signature
EVENTS = {
    # four.meme TokenManager2
    "FM_TOKEN_CREATE": "TokenCreate(address,address,uint256,string,string,uint256,uint256,uint256)",
    "FM_TOKEN_PURCHASE": "TokenPurchase(address,address,uint256,uint256,uint256,uint256,uint256,uint256)",
    "FM_TOKEN_SALE": "TokenSale(address,address,uint256,uint256,uint256,uint256,uint256,uint256)",
    "FM_TRADE_STOP": "TradeStop(address)",
    "FM_LIQUIDITY_ADDED": "LiquidityAdded(address,uint256,address,uint256)",
    # PancakeSwap V2 pair
    "V2_SYNC": "Sync(uint112,uint112)",
    # Flap Portal
    "FLAP_TOKEN_CREATED": "TokenCreated(uint256,address,uint256,address,string,string,string)",
    "FLAP_TOKEN_BOUGHT": "TokenBought(uint256,address,address,uint256,uint256,uint256,uint256)",
    "FLAP_TOKEN_SOLD": "TokenSold(uint256,address,address,uint256,uint256,uint256,uint256)",
    "FLAP_LAUNCHED_TO_DEX": "LaunchedToDEX(address,address,uint256,uint256)",
    "FLAP_QUOTE_SET": "TokenQuoteSet(address,address)",
    "FLAP_CURVE_SET_V2": "TokenCurveSetV2(address,uint256,uint256,uint256)",
    "FLAP_TAX_SET": "FlapTokenTaxSet(address,uint256)",
    "FLAP_DEX_THRESH_SET": "TokenDexSupplyThreshSet(address,uint256)",
}
SELECTORS = {
    "SEL_TOKEN_INFO": "getTokenInfo(address)",
    "SEL_RESERVES": "getReserves()",
    "SEL_TOKEN0": "token0()",
    "SEL_DECIMALS": "decimals()",
    "SEL_SYMBOL": "symbol()",
    "SEL_GET_PAIR": "getPair(address,address)",
}


def main() -> int:
    abi = (pathlib.Path(__file__).resolve().parent.parent / "src" / "abi.rs").read_text()
    constants = dict(re.findall(r'pub const (\w+): &str = "(0x[0-9a-f]+)";', abi))
    bad = 0
    for table, length in ((EVENTS, 32), (SELECTORS, 4)):
        for name, signature in table.items():
            want = "0x" + keccak256(signature.encode())[:length].hex()
            have = constants.get(name)
            ok = have == want
            bad += not ok
            print(f"{'ok ' if ok else 'BAD'} {name:<22} {want}  {signature}")
            if not ok:
                print(f"    src/abi.rs has {have}")
    print(f"{len(EVENTS) + len(SELECTORS) - bad} match, {bad} mismatch")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
