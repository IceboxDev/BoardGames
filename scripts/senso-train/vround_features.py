"""Python port of mcts/vround-features.ts — the cell features of the learned
round-end leaf — built from collect-value.ts raw rows. Kept in lock-step with
the TS encoder by `check_fixture(...)`, which the trainer runs first.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

SEATS, TIERS = 5, 5
OWNER_CLASSES = 7
PER_SEAT = 6


class RoundRows:
    """Column lookups over a Samples object (samples.py)."""

    def __init__(self, samples):
        self.s = samples
        self.cols = samples.columns
        self.at = {c: i for i, c in enumerate(self.cols)}
        self.square_count = sum(1 for c in self.cols if c.startswith("square["))
        self.features = self.square_count * OWNER_CLASSES + SEATS * PER_SEAT + TIERS + 2 + 3 + SEATS

    def block(self, name: str, k: int) -> np.ndarray:
        base = self.at[f"{name}[0]"]
        return self.s.data[:, base : base + k]

    def cells(self, rows: np.ndarray, s_of: np.ndarray, p_of: np.ndarray, t_of: np.ndarray) -> np.ndarray:
        """Feature matrix for cells (row index, perspective, actor, tier index), vectorised."""
        d = self.s.data
        m = len(rows)
        n = d[rows, self.at["n"]].astype(int)
        X = np.zeros((m, self.features), dtype=np.float32)
        squares = self.block("square", self.square_count)[rows].astype(int)  # (m, sq)
        k = 0
        for sq in range(self.square_count):
            owner = squares[:, sq]
            cls = np.where(owner == -1, 0, np.where(owner == -2, 6, 1 + ((owner - s_of + n) % n)))
            X[np.arange(m), k + cls] = 1
            k += OWNER_CLASSES
        scores = self.block("scoreBefore", SEATS)[rows]
        cubes = self.block("cubesBefore", SEATS)[rows]
        clans = self.block("clan", SEATS)[rows].astype(int)
        supply_clan = self.block("supply", 4)[rows]
        supply = np.zeros((m, SEATS))
        for seat in range(SEATS):
            c = clans[:, seat]
            ok = c >= 0
            supply[ok, seat] = supply_clan[ok, c[ok]]
        emperor = d[rows, self.at["emperorSeat"]].astype(int)
        for rel in range(SEATS):
            seat = (s_of + rel) % n
            seated = rel < n
            idx = np.arange(m)
            X[:, k] = np.where(seated, scores[idx, seat] / 40, 0)
            X[:, k + 1] = np.where(seated, cubes[idx, seat] / 8, 0)
            X[:, k + 2] = np.where(seated, supply[idx, seat] / 8, 0)
            X[:, k + 3] = np.where(seated & (seat == emperor), 1, 0)
            X[:, k + 4] = np.where(seated, 1, 0)
            X[:, k + 5] = np.where(seated & (seat == p_of), 1, 0)
            k += PER_SEAT
        X[np.arange(m), k + t_of] = 1
        k += TIERS
        tier = self.block("tier", SEATS * SEATS * TIERS)[rows]
        X[:, k] = tier[np.arange(m), (s_of * SEATS + p_of) * TIERS + t_of] / 10
        X[:, k + 1] = tier[np.arange(m), (p_of * SEATS + p_of) * TIERS + t_of] / 10
        rnd = d[rows, self.at["round"]]
        X[:, k + 2] = rnd / 8
        X[:, k + 3] = (8 - rnd) / 8
        X[:, k + 4] = n / 5
        first = d[rows, self.at["firstPlayer"]].astype(int)
        X[np.arange(m), k + 5 + ((first - s_of + n) % n)] = 1
        k += 5 + SEATS
        assert k == self.features, (k, self.features)
        return X


def check_fixture(columns: list[str], fixture_path: str | Path, atol: float = 1e-5) -> int:
    """Encode the fixture's own raw rows with this port and compare with the TS features."""
    from samples import Samples  # local import: samples.py sits next to this file

    fx = json.loads(Path(fixture_path).read_text())
    if fx["columns"] != columns:
        raise SystemExit("vround fixture: the sample columns changed since the fixture was dumped")
    rr = RoundRows(Samples("SNVR", 0, np.array(fx["rows"], dtype=np.float32), fx["columns"]))
    if fx["features"] != rr.features:
        raise SystemExit(f"vround features: TS has {fx['features']}, Python {rr.features}")
    cases = fx["cases"]
    rows = np.array([c["row"] for c in cases])
    s_of = np.array([c["s"] for c in cases])
    p_of = np.array([c["p"] for c in cases])
    t_of = np.array([c["t"] for c in cases])
    X = rr.cells(rows, s_of, p_of, t_of)
    expected = np.array([c["x"] for c in cases], dtype=np.float32)
    worst = np.abs(X - expected).max()
    if worst > atol:
        bad = np.argwhere(np.abs(X - expected) > atol)[0]
        raise SystemExit(f"vround features diverge from the TS encoder: cell {bad[0]} feature {bad[1]} (|Δ| {worst:.3g})")
    return len(cases)
