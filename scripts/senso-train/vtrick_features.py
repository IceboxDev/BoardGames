"""Python port of mcts/vtrick-features.ts — the expected-tier net's features from
collect-value.ts ply rows (the full dealt world). Pinned to the TS encoder by
`check_fixture`, run by the trainer before training.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

N_CARDS = 54
SEATS, TIERS = 5, 5
OWNER_CLASSES = 7
TABLE_SLOTS, PER_SLOT = 4, 6
FEATURES = N_CARDS * OWNER_CLASSES + TABLE_SLOTS * PER_SLOT + SEATS + 5 + 1 + SEATS * 2 + SEATS * 4 + 4 + SEATS + 3

# Card index → suit (-1 Ninja) and rank (0 Ninja): FULL_DECK order = 4 clans × ranks 2..14, then wood, jade.
CARD_SUIT = np.array([c // 13 for c in range(52)] + [-1, -1])
CARD_RANK = np.array([2 + (c % 13) for c in range(52)] + [0, 0])
WOOD, JADE = 52, 53


def win_key(card: int, trump: int, lead: int) -> int:
    if card == JADE:
        return 300
    if card == WOOD:
        return 200
    suit = CARD_SUIT[card]
    if suit == trump:
        return 100 + int(CARD_RANK[card])
    if suit == lead:
        return int(CARD_RANK[card])
    return -1


def tier_index(tricks: np.ndarray) -> np.ndarray:
    out = np.zeros_like(tricks, dtype=int)
    out[tricks >= 1] = 1
    out[tricks >= 3] = 2
    out[tricks >= 5] = 3
    out[tricks >= 7] = 4
    return out


class PlyRows:
    def __init__(self, samples):
        self.s = samples
        self.cols = samples.columns
        self.at = {c: i for i, c in enumerate(self.cols)}
        self.features = FEATURES

    def block(self, name: str, k: int) -> np.ndarray:
        base = self.at[f"{name}[0]"]
        return self.s.data[:, base : base + k]

    def encode(self, rows: np.ndarray) -> np.ndarray:
        d = self.s.data
        m = len(rows)
        n = d[rows, self.at["n"]].astype(int)
        me = d[rows, self.at["seat"]].astype(int)
        leader = d[rows, self.at["leader"]].astype(int)
        trump = d[rows, self.at["trump"]].astype(int)
        table_len = d[rows, self.at["tableLen"]].astype(int)
        table = self.block("table", 5)[rows].astype(int)
        owner = self.block("owner", N_CARDS)[rows].astype(int)
        tricks = self.block("tricksWon", SEATS)[rows]
        hands = self.block("handSize", SEATS)[rows]
        voids = self.block("voids", SEATS)[rows].astype(int)
        rnd = d[rows, self.at["round"]]
        X = np.zeros((m, FEATURES), dtype=np.float32)
        idx = np.arange(m)
        k = 0
        for c in range(N_CARDS):
            o = owner[:, c]
            cls = np.where(o == -2, 5, np.where(o == -3, 6, (o - me + n) % n))
            X[idx, k + cls] = 1
            k += OWNER_CLASSES
        lead = np.where(table_len > 0, CARD_SUIT[np.clip(table[:, 0], 0, N_CARDS - 1)], -1)
        for i in range(TABLE_SLOTS):
            present = i < table_len
            card = np.clip(table[:, i], 0, N_CARDS - 1)
            X[:, k] = present
            X[:, k + 1] = np.where(present, CARD_RANK[card] / 14, 0)
            X[:, k + 2] = np.where(present & (CARD_SUIT[card] == trump), 1, 0)
            X[:, k + 3] = np.where(present & (CARD_SUIT[card] >= 0) & (CARD_SUIT[card] == lead), 1, 0)
            X[:, k + 4] = np.where(present & (card == WOOD), 1, 0)
            X[:, k + 5] = np.where(present & (card == JADE), 1, 0)
            k += PER_SLOT
        # current winner (relative)
        for r in range(m):
            if table_len[r] > 0:
                best, best_key = 0, -2
                for i in range(table_len[r]):
                    key = win_key(int(table[r, i]), int(trump[r]), int(lead[r]))
                    if key > best_key:
                        best, best_key = i, key
                winner = (leader[r] + best) % n[r]
                X[r, k + (winner - me[r] + n[r]) % n[r]] = 1
        k += SEATS
        X[idx, k + np.where(lead >= 0, lead, 4)] = 1
        k += 5
        X[:, k] = table_len / 4
        k += 1
        for r in range(SEATS):
            seat = (me + r) % n
            seated = r < n
            X[:, k + r] = np.where(seated, tricks[idx, seat] / 13, 0)
            X[:, k + SEATS + r] = np.where(seated, hands[idx, seat] / 13, 0)
        k += SEATS * 2
        for r in range(SEATS):
            seat = (me + r) % n
            seated = r < n
            for suit in range(4):
                X[:, k + r * 4 + suit] = np.where(seated, (voids[idx, seat] >> suit) & 1, 0)
        k += SEATS * 4
        X[idx, k + trump] = 1
        k += 4
        X[idx, k + (leader - me + n) % n] = 1
        k += SEATS
        cards_left = hands[idx, :].sum(axis=1)
        X[:, k] = cards_left / 50
        X[:, k + 1] = rnd / 8
        X[:, k + 2] = n / 5
        k += 3
        assert k == FEATURES, (k, FEATURES)
        return X

    def targets(self, rows: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Tier index per RELATIVE seat (m, 5) and a seated mask (m, 5)."""
        d = self.s.data
        n = d[rows, self.at["n"]].astype(int)
        me = d[rows, self.at["seat"]].astype(int)
        final = self.block("finalTricks", SEATS)[rows]
        idx = np.arange(len(rows))
        y = np.zeros((len(rows), SEATS), dtype=int)
        mask = np.zeros((len(rows), SEATS), dtype=bool)
        for r in range(SEATS):
            seat = (me + r) % n
            seated = r < n
            y[:, r] = np.where(seated, tier_index(final[idx, seat]), 0)
            mask[:, r] = seated
        return y, mask


def check_fixture(columns: list[str], fixture_path: str | Path, atol: float = 1e-5) -> int:
    from samples import Samples

    fx = json.loads(Path(fixture_path).read_text())
    if fx["columns"] != columns:
        raise SystemExit("vtrick fixture: the ply columns changed since the fixture was dumped")
    pr = PlyRows(Samples("SNVT", 0, np.array(fx["rows"], dtype=np.float32), fx["columns"]))
    if fx["features"] != pr.features:
        raise SystemExit(f"vtrick features: TS has {fx['features']}, Python {pr.features}")
    rows = np.array([c["row"] for c in fx["cases"]])
    X = pr.encode(rows)
    expected = np.array([c["x"] for c in fx["cases"]], dtype=np.float32)
    worst = np.abs(X - expected).max()
    if worst > atol:
        bad = np.argwhere(np.abs(X - expected) > atol)[0]
        raise SystemExit(f"vtrick features diverge from the TS encoder: ply {bad[0]} feature {bad[1]} (|Δ| {worst:.3g})")
    return len(rows)
