#!/usr/bin/env python3
"""Keccak-256 in pure Python (no dependencies).

This is the original Keccak padding used by Ethereum, not NIST SHA3-256, so
`hashlib.sha3_256` gives a different result.

    python3 tools/keccak.py "Sync(uint112,uint112)"
"""

import sys

ROUND_CONSTANTS = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
ROTATION = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
]
MASK = (1 << 64) - 1
RATE = 136  # bytes, for a 256-bit digest


def _rot(x, n):
    return ((x << n) | (x >> (64 - n))) & MASK if n else x


def _permute(a):
    for rc in ROUND_CONSTANTS:
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rot(c[(x + 1) % 5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rot(a[x][y], ROTATION[x][y])
        a = [[b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y]) for y in range(5)] for x in range(5)]
        a[0][0] ^= rc
    return a


def keccak256(data: bytes) -> bytes:
    buf = bytearray(data) + b"\x01"
    buf += b"\x00" * ((-len(buf)) % RATE)
    buf[-1] |= 0x80
    a = [[0] * 5 for _ in range(5)]
    for i in range(0, len(buf), RATE):
        for j in range(RATE // 8):
            a[j % 5][j // 5] ^= int.from_bytes(buf[i + 8 * j:i + 8 * j + 8], "little")
        a = _permute(a)
    return b"".join(a[j % 5][j // 5].to_bytes(8, "little") for j in range(4))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit('usage: keccak.py "<signature>"')
    print("0x" + keccak256(sys.argv[1].encode()).hex())
