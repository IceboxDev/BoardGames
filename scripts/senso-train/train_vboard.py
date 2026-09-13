#!/usr/bin/env python3
"""Train the board value net (plan Phase 2b / Track B2) on collect-value.ts round rows.

    uv run --with numpy scripts/senso-train/train_vboard.py scratch/value/p2-5p-*.rounds.bin \
        --fixture scratch/value/vboard-fixture.json --players 5 --out vboard-weights-5p.ts

Rows: the board BEFORE every round (variant 0) and the final board (AFTER round 8), one row per
perspective seat. Two heads: final gap (own − best rival's final score, MSE, scaled /10) and
win (final placement 1, logistic). Held out by game; reports R² of the gap head against the
"current gap" baseline and the win head's log-loss against a logistic on (gap, cube gap,
rounds left, Emperor), per round bucket.
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
from vboard_features import SEATS, BoardRows, check_fixture  # noqa: E402


def r2(y: np.ndarray, pred: np.ndarray) -> float:
    ss = np.sum((y - y.mean()) ** 2)
    return float(1 - np.sum((y - pred) ** 2) / ss) if ss > 0 else float("nan")


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-z))


def logloss(y: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--fixture", required=True)
    ap.add_argument("--players", type=int, default=0)
    ap.add_argument("--sizes", default="64,32")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--l2", type=float, default=1e-4)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default="")
    ap.add_argument("--name", default="VBOARD_MODEL")
    ap.add_argument("--note", default="")
    a = ap.parse_args()

    s = concat(a.files)
    br = BoardRows(s)
    checked = check_fixture(br.cols, a.fixture)
    d = s.data
    variant = d[:, br.at["variant"]].astype(int)
    n = d[:, br.at["n"]].astype(int)
    game = d[:, br.at["game"]].astype(int)
    rnd = d[:, br.at["round"]].astype(int)
    finals_score = {g: br.block("finalScore", SEATS)[i] for i, g in enumerate(game) if variant[i] == -1}
    finals_place = {g: br.block("finalPlacement", SEATS)[i] for i, g in enumerate(game) if variant[i] == -1}
    keep = (variant == 0) & np.array([g in finals_score for g in game])
    if a.players:
        keep &= n == a.players
    rows = np.where(keep)[0]
    print(f"{len(d)} rows · encoder parity ok on {checked} boards · {len(rows)} round rows with finals")

    # Instances: (row, side, perspective). before-boards of every round, after-board of round 8.
    inst_row, inst_side, inst_s = [], [], []
    for r in rows:
        for side in ("before", "after") if rnd[r] == 8 else ("before",):
            for sidx in range(n[r]):
                inst_row.append(r)
                inst_side.append(side)
                inst_s.append(sidx)
    inst_row = np.array(inst_row)
    inst_side = np.array(inst_side)
    inst_s = np.array(inst_s)
    X = np.zeros((len(inst_row), br.features), dtype=np.float32)
    for side in ("before", "after"):
        m = inst_side == side
        if m.any():
            X[m] = br.encode(inst_row[m], inst_s[m], side)
    # Targets.
    gap = np.zeros(len(inst_row))
    win = np.zeros(len(inst_row))
    cur_gap = np.zeros(len(inst_row))
    for i, (r, sidx) in enumerate(zip(inst_row, inst_s)):
        g = game[r]
        fs = finals_score[g][: n[r]]
        rival = max(fs[j] for j in range(n[r]) if j != sidx)
        gap[i] = fs[sidx] - rival
        win[i] = 1.0 if finals_place[g][sidx] == 1 else 0.0
        sc = br.block("scoreBefore" if inst_side[i] == "before" else "scoreAfter", SEATS)[r][: n[r]]
        cur_gap[i] = sc[sidx] - max(sc[j] for j in range(n[r]) if j != sidx)
    inst_game = game[inst_row]
    inst_round = np.where(inst_side == "after", 9, rnd[inst_row])
    test = inst_game % 10 == 7
    tr, te = np.where(~test)[0], np.where(test)[0]
    print(f"{len(X)} boards ({len(tr)} train / {len(te)} held out by game) · win rate {win.mean():.3f}")

    sizes = [br.features, *[int(x) for x in a.sizes.split(",")], 2]
    model = Mlp(sizes, seed=a.seed)

    def report(label: str) -> None:
        out = model.forward(X[te].astype(np.float64))
        pg = out[:, 0] * 10
        pw = sigmoid(out[:, 1])
        parts = []
        for name, m in (("r1-3", inst_round[te] <= 3), ("r4-5", (inst_round[te] >= 4) & (inst_round[te] <= 5)), ("r6-8", (inst_round[te] >= 6) & (inst_round[te] <= 8)), ("final", inst_round[te] == 9)):
            if m.sum() > 20:
                parts.append(f"{name} gapR² {r2(gap[te][m], cur_gap[te][m]):.2f}→{r2(gap[te][m], pg[m]):.2f} win-ll {logloss(win[te][m], pw[m]):.3f}")
        print(f"  {label}: held-out gap R² baseline(current gap) {r2(gap[te], cur_gap[te]):.3f} → net {r2(gap[te], pg):.3f} · win log-loss {logloss(win[te], pw):.3f} (marginal {logloss(win[te], np.full(len(te), win[tr].mean())):.3f}) · " + " · ".join(parts))

    report("epoch 0")
    rng = np.random.default_rng(a.seed)
    t0 = time.time()
    for ep in range(a.epochs):
        rng.shuffle(tr)
        for b in range(0, len(tr), a.batch):
            ids = tr[b : b + a.batch]
            out = model.forward(X[ids].astype(np.float64), keep=True)
            dout = np.zeros_like(out)
            dout[:, 0] = 2 * (out[:, 0] - gap[ids] / 10) / len(ids)
            dout[:, 1] = (sigmoid(out[:, 1]) - win[ids]) / len(ids)
            gW, gb = model.backward(dout)
            model.adam(gW, gb, a.lr, a.l2)
        if (ep + 1) % 10 == 0 or ep == a.epochs - 1:
            report(f"epoch {ep + 1} ({time.time() - t0:.0f} s)")
    if a.out:
        model.export_ts(a.out, a.name, a.note or f"board value net {sizes}, {len(X)} boards", X[te[:16]].astype(np.float64), f"{a.out}.fixture.json")
        print(f"wrote {a.out} (+ .fixture.json)")


if __name__ == "__main__":
    main()
