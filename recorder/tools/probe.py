#!/usr/bin/env python3
"""Count the logs a contract emitted over recent blocks, grouped by topic0 and
data length. Useful to see what a launchpad contract really emits before
trusting an ABI, and to spot a new event after a contract upgrade.

    python3 tools/probe.py                       # four.meme TokenManager2
    python3 tools/probe.py flap                  # Flap Portal
    python3 tools/probe.py 0x<address> --blocks 5000
    BSC_HTTP_URL=https://... python3 tools/probe.py flap

Known topics are shown with their event name (taken from tools/topics.py).
Standard library only.
"""

import argparse
import collections
import json
import os
import pathlib
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from keccak import keccak256  # noqa: E402
from topics import EVENTS  # noqa: E402

CONTRACTS = {
    "fourmeme": "0x5c952063c7fc8610ffdb798152d69f0b9550762b",
    "flap": "0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0",
}
NAMES = {"0x" + keccak256(s.encode()).hex(): s.split("(")[0] for s in EVENTS.values()}


def rpc(url, method, params):
    req = urllib.request.Request(
        url,
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
        # Some public endpoints reject requests without a User-Agent.
        {"Content-Type": "application/json", "User-Agent": "bsc-launchpad-recorder-probe"},
    )
    reply = json.load(urllib.request.urlopen(req, timeout=30))
    if "error" in reply:
        raise SystemExit(f"{method}: {reply['error']}")
    return reply["result"]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("contract", nargs="?", default="fourmeme", help="fourmeme, flap, or an address")
    ap.add_argument("--blocks", type=int, default=2000, help="how many recent blocks to scan")
    ap.add_argument("--chunk", type=int, default=500, help="blocks per eth_getLogs")
    ap.add_argument("--rpc", default=os.environ.get("BSC_HTTP_URL", "https://bsc-rpc.publicnode.com"))
    args = ap.parse_args()

    address = CONTRACTS.get(args.contract, args.contract).lower()
    head = int(rpc(args.rpc, "eth_blockNumber", []), 16)
    logs = []
    for start in range(head - args.blocks + 1, head + 1, args.chunk):
        end = min(start + args.chunk - 1, head)
        logs += rpc(args.rpc, "eth_getLogs", [{"address": address, "fromBlock": hex(start), "toBlock": hex(end)}])

    counts = collections.Counter((l["topics"][0], (len(l["data"]) - 2) // 2) for l in logs if l["topics"])
    print(f"{address}: {len(logs)} logs in blocks {head - args.blocks + 1}..{head}")
    for (topic, size), n in counts.most_common():
        print(f"{n:>7}  {topic}  {size:>5} bytes  {NAMES.get(topic, '(unknown)')}")


if __name__ == "__main__":
    main()
