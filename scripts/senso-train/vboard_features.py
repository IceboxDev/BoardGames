"""Python port of mcts/vboard-features.ts (board value net) from collect-value.ts
round rows: the BEFORE board (squareBefore = `square[...]`, scoreBefore, ...) or the
AFTER board (`squareAfter`, scoreAfter, ...). Parity-pinned by `check_fixture`.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

SEATS = 5
OWNER_CLASSES = 7
PER_SEAT = 5


class BoardRows:
    def __init__(self, samples):
        self.s = samples
        self.cols = samples.columns
        self.at = {c: i for i, c in enumerate(self.cols)}
        self.square_count = sum(1 for c in self.cols if c.startswith("square["))
        self.features = self.square_count * OWNER_CLASSES + SEATS * PER_SEAT + 3 + SEATS

    def block(self, name: str, k: int) -> np.ndarray:
        base = self.at[f"{name}[0]"]
        return self.s.data[:, base : base + k]

    def encode(self, rows: np.ndarray, s_of: np.ndarray, side: str = "before") -> np.ndarray:
        """Features of the `before` or `after` board of `rows` for perspective `s_of`."""
        d = self.s.data
        m = len(rows)
        n = d[rows, self.at["n"]].astype(int)
        idx = np.arange(m)
        sq_name = "square" if side == "before" else "squareAfter"
        squares = self.block(sq_name, self.square_count)[rows].astype(int)
        scores = self.block("scoreBefore" if side == "before" else "scoreAfter", SEATS)[rows]
        cubes = self.block("cubesBefore" if side == "before" else "cubesAfter", SEATS)[rows]
        clans = self.block("clan", SEATS)[rows].astype(int)
        supply_clan = self.block("supply" if side == "before" else "supplyAfter", 4)[rows]
        supply = np.zeros((m, SEATS))
        for seat in range(SEATS):
            c = clans[:, seat]
            ok = c >= 0
            supply[ok, seat] = supply_clan[ok, c[ok]]
        emperor = d[rows, self.at["emperorSeat"]].astype(int)
        rnd = d[rows, self.at["round"]]
        first = d[rows, self.at["firstPlayer"]].astype(int)
        X = np.zeros((m, self.features), dtype=np.float32)
        k = 0
        for sq in range(self.square_count):
            owner = squares[:, sq]
            cls = np.where(owner == -1, 0, np.where(owner == -2, 6, 1 + ((owner - s_of + n) % n)))
            X[idx, k + cls] = 1
            k += OWNER_CLASSES
        for rel in range(SEATS):
            seat = (s_of + rel) % n
            seated = rel < n
            X[:, k] = np.where(seated, scores[idx, seat] / 40, 0)
            X[:, k + 1] = np.where(seated, cubes[idx, seat] / 8, 0)
            X[:, k + 2] = np.where(seated, supply[idx, seat] / 8, 0)
            X[:, k + 3] = np.where(seated & (seat == emperor), 1, 0)
            X[:, k + 4] = np.where(seated, 1, 0)
            k += PER_SEAT
        X[:, k] = rnd / 8
        X[:, k + 1] = (8 - rnd) / 8
        X[:, k + 2] = n / 5
        X[idx, k + 3 + ((first - s_of + n) % n)] = 1
        k += 3 + SEATS
        assert k == self.features
        return X


def check_fixture(columns: list[str], fixture_path: str | Path, atol: float = 1e-5) -> int:
    from samples import Samples

    fx = json.loads(Path(fixture_path).read_text())
    if fx["columns"] != columns:
        raise SystemExit("vboard fixture: the sample columns changed since the fixture was dumped")
    br = BoardRows(Samples("SNVR", 0, np.array(fx["rows"], dtype=np.float32), fx["columns"]))
    if fx["features"] != br.features:
        raise SystemExit(f"vboard features: TS has {fx['features']}, Python {br.features}")
    rows = np.array([c["row"] for c in fx["cases"]])
    s_of = np.array([c["s"] for c in fx["cases"]])
    X = br.encode(rows, s_of, "before")
    expected = np.array([c["x"] for c in fx["cases"]], dtype=np.float32)
    worst = np.abs(X - expected).max()
    if worst > atol:
        bad = np.argwhere(np.abs(X - expected) > atol)[0]
        raise SystemExit(f"vboard features diverge from the TS encoder: case {bad[0]} feature {bad[1]} (|Δ| {worst:.3g})")
    return len(rows)
