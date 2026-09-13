#!/usr/bin/env python3
"""Train the learned round-end leaf ("vround", plan Phase 2a) on collect-value.ts rows.

    uv run --with numpy scripts/senso-train/train_vround.py scratch/value/p02-5p-*.rounds.bin \
        --fixture scratch/value/vround-fixture.json --players 5 --out vround-weights-5p.ts

Model: the additive tier structure with a learned correction per cell —
    pred[s] = Σ_p ( table[s][p][tier_p] + net(x_{s,p,tier_p}) )
trained by MSE against the realized post-rewards standing change of perspective s
(variant 0 = the round as played, variants ≥ 1 = counterfactual rewards phases on the
same board). The net's output layer starts at zero, so epoch 0 IS the tier table and
training can only move away from it where the data says so. Held out by game.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from mlp_np import Mlp  # noqa: E402
from samples import concat  # noqa: E402
from vround_features import SEATS, TIERS, RoundRows, check_fixture  # noqa: E402


def tier_index(tricks: np.ndarray) -> np.ndarray:
    out = np.zeros_like(tricks, dtype=int)
    out[tricks >= 1] = 1
    out[tricks >= 3] = 2
    out[tricks >= 5] = 3
    out[tricks >= 7] = 4
    return out


def r2(y: np.ndarray, pred: np.ndarray) -> float:
    ss = np.sum((y - y.mean()) ** 2)
    return float(1 - np.sum((y - pred) ** 2) / ss) if ss > 0 else float("nan")


def objective(scores: np.ndarray, cubes: np.ndarray, n: np.ndarray, cube_weight: float) -> np.ndarray:
    """Per-seat standing: score − best rival's score + cube_weight · (cubes − that rival's cubes).
    cube_weight 0.02 reproduces the engine's `evalPosition`."""
    m, k = scores.shape
    out = np.zeros((m, k))
    for s in range(k):
        rival_scores = scores.copy()
        rival_scores[:, s] = -np.inf
        for j in range(k):
            rival_scores[np.arange(m)[n <= j], j] = -np.inf
        rival = np.argmax(rival_scores, axis=1)
        out[:, s] = scores[:, s] - scores[np.arange(m), rival] + cube_weight * (cubes[:, s] - cubes[np.arange(m), rival])
    return out


class Instances:
    """(row, perspective) instances with their actor cells."""

    def __init__(self, rr: RoundRows, rows: np.ndarray, cube_weight: float = 0.02):
        d = rr.s.data
        n = d[rows, rr.at["n"]].astype(int)
        tricks = rr.block("tricks", SEATS)[rows]
        ti = tier_index(tricks)
        before = objective(rr.block("scoreBefore", SEATS)[rows], rr.block("cubesBefore", SEATS)[rows], n, cube_weight)
        after = objective(rr.block("scoreAfter", SEATS)[rows], rr.block("cubesAfter", SEATS)[rows], n, cube_weight)
        tier = rr.block("tier", SEATS * SEATS * TIERS)[rows]
        inst_row, inst_s, inst_y, inst_g = [], [], [], []
        cell_inst, cell_row, cell_s, cell_p, cell_t = [], [], [], [], []
        for i, r in enumerate(rows):
            for s in range(n[i]):
                idx = len(inst_row)
                inst_row.append(r)
                inst_s.append(s)
                inst_y.append(after[i, s] - before[i, s])
                g = 0.0
                for p in range(n[i]):
                    g += tier[i, (s * SEATS + p) * TIERS + ti[i, p]]
                    cell_inst.append(idx)
                    cell_row.append(r)
                    cell_s.append(s)
                    cell_p.append(p)
                    cell_t.append(ti[i, p])
                inst_g.append(g)
        self.rr = rr
        self.row = np.array(inst_row)
        self.s = np.array(inst_s)
        self.y = np.array(inst_y, dtype=np.float64)
        self.greedy = np.array(inst_g, dtype=np.float64)
        self.cell_inst = np.array(cell_inst)
        self.cell_row = np.array(cell_row)
        self.cell_s = np.array(cell_s)
        self.cell_p = np.array(cell_p)
        self.cell_t = np.array(cell_t)
        self.game = d[self.row, rr.at["game"]].astype(int)
        self.round = d[self.row, rr.at["round"]].astype(int)
        self.variant = d[self.row, rr.at["variant"]].astype(int)
        # cells grouped per instance: first cell index and count
        order = np.argsort(self.cell_inst, kind="stable")
        self.cell_inst, self.cell_row, self.cell_s, self.cell_p, self.cell_t = (
            a[order] for a in (self.cell_inst, self.cell_row, self.cell_s, self.cell_p, self.cell_t)
        )
        self.first = np.searchsorted(self.cell_inst, np.arange(len(self.y)))
        self.count = np.diff(np.append(self.first, len(self.cell_inst)))

    def __len__(self) -> int:
        return len(self.y)

    def batch(self, ids: np.ndarray):
        """Cell features for the instances `ids`, plus the instance index of each cell."""
        firsts = self.first[ids]
        counts = self.count[ids]
        cell_ids = np.concatenate([np.arange(f, f + c) for f, c in zip(firsts, counts)])
        owner = np.repeat(np.arange(len(ids)), counts)
        X = self.rr.cells(self.cell_row[cell_ids], self.cell_s[cell_ids], self.cell_p[cell_ids], self.cell_t[cell_ids])
        return X, owner

    def predict(self, model: Mlp, ids: np.ndarray, batch: int = 4096) -> np.ndarray:
        out = np.zeros(len(ids))
        for b in range(0, len(ids), batch):
            sub = ids[b : b + batch]
            X, owner = self.batch(sub)
            f = model.forward(X.astype(np.float64))[:, 0]
            out[b : b + batch] = self.greedy[sub] + np.bincount(owner, weights=f, minlength=len(sub))
        return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--fixture", required=True, help="parity fixture from dump-vround-fixture.ts")
    ap.add_argument("--players", type=int, default=0, help="keep one table size (0 = all)")
    ap.add_argument("--sizes", default="64,32", help="hidden layer widths")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--l2", type=float, default=1e-5)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--cube-weight", type=float, default=0.02, help="target = Δ(gap + w·cube gap); 0.02 = the engine's standing")
    ap.add_argument("--out", default="", help="TS weights module to write (mcts/vround-weights-<tag>.ts)")
    ap.add_argument("--name", default="VROUND_MODEL")
    ap.add_argument("--note", default="")
    a = ap.parse_args()

    s = concat(a.files)
    rr = RoundRows(s)
    cells_checked = check_fixture(rr.cols, a.fixture)
    print(f"{len(s.data)} rows · encoder parity ok on {cells_checked} fixture cells")
    d = s.data
    variant = d[:, rr.at["variant"]].astype(int)
    n = d[:, rr.at["n"]].astype(int)
    keep = variant >= 0
    if a.players:
        keep &= n == a.players
    rows = np.where(keep)[0]
    inst = Instances(rr, rows, a.cube_weight)
    if a.cube_weight == 0.02:
        # Sanity: the recorded standing must equal the objective at the engine's cube weight.
        rec = (rr.block("standingAfter", SEATS) - rr.block("standingBefore", SEATS))[inst.row, inst.s]
        assert np.abs(rec - inst.y).max() < 1e-3, "objective() disagrees with the engine's evalPosition"
    test = inst.game % 10 == 7
    train_ids = np.where(~test)[0]
    test_ids = np.where(test)[0]
    print(f"{len(inst)} instances ({len(train_ids)} train / {len(test_ids)} held out by game) · {len(inst.cell_inst)} cells")

    sizes = [rr.features, *[int(x) for x in a.sizes.split(",")], 1]
    model = Mlp(sizes, seed=a.seed)
    model.zero_last()

    def report(label: str) -> float:
        pred = inst.predict(model, test_ids)
        y = inst.y[test_ids]
        base = r2(y, inst.greedy[test_ids])
        full = r2(y, pred)
        parts = []
        for name, m in (("played", inst.variant[test_ids] == 0), ("cf", inst.variant[test_ids] >= 1), ("r1-3", inst.round[test_ids] <= 3), ("r4-5", (inst.round[test_ids] >= 4) & (inst.round[test_ids] <= 5)), ("r6-8", inst.round[test_ids] >= 6)):
            if m.sum() > 10:
                parts.append(f"{name} {r2(y[m], inst.greedy[test_ids][m]):.3f}→{r2(y[m], pred[m]):.3f}")
        print(f"  {label}: held-out R² tier {base:.3f} → model {full:.3f} · rmse {np.sqrt(np.mean((y - pred) ** 2)):.3f} · " + " · ".join(parts))
        return full

    report("epoch 0 (= tier table)")
    rng = np.random.default_rng(a.seed)
    t0 = time.time()
    for ep in range(a.epochs):
        rng.shuffle(train_ids)
        total = 0.0
        for b in range(0, len(train_ids), a.batch):
            ids = train_ids[b : b + a.batch]
            X, owner = inst.batch(ids)
            f = model.forward(X.astype(np.float64), keep=True)[:, 0]
            pred = inst.greedy[ids] + np.bincount(owner, weights=f, minlength=len(ids))
            err = pred - inst.y[ids]
            total += float(np.sum(err**2))
            dout = (2 * err[owner] / len(ids))[:, None]
            gW, gb = model.backward(dout)
            model.adam(gW, gb, a.lr, a.l2)
        print(f"epoch {ep + 1}/{a.epochs}: train mse {total / len(train_ids):.4f} · {time.time() - t0:.0f} s")
        if (ep + 1) % 5 == 0 or ep == a.epochs - 1:
            report(f"epoch {ep + 1}")
    if a.out:
        X, _ = inst.batch(test_ids[:16])
        model.export_ts(a.out, a.name, a.note or f"vround leaf net {sizes}, {len(inst)} instances", X[:16].astype(np.float64), f"{a.out}.fixture.json")
        print(f"wrote {a.out} (+ .fixture.json)")


if __name__ == "__main__":
    main()
