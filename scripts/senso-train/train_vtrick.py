#!/usr/bin/env python3
"""Train the expected-tier net (plan Phase 3) on collect-value.ts ply rows.

    uv run --with numpy scripts/senso-train/train_vtrick.py scratch/value/p2-5p-*.plies.bin \
        --fixture scratch/value/vtrick-fixture.json --players 5 --out vtrick-weights-5p.ts

Input: the dealt world at a trick decision (every hand known), relative to the seat to move.
Output: per relative seat, logits over the tier {none, 1, 3, 5, 7} that seat ends the round
with; trained by softmax cross-entropy against the realized tiers (seats acted under their
own information in self-play, so the target carries no double-dummy knowledge). Held out by
game. Reports per-seat accuracy and NLL against the "current tier" and "marginal" baselines.
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
from vtrick_features import SEATS, TIERS, PlyRows, check_fixture, tier_index  # noqa: E402


def softmax_rows(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def evaluate(model: Mlp, X: np.ndarray, y: np.ndarray, mask: np.ndarray, batch: int = 8192) -> tuple[float, float]:
    nll, hits, count = 0.0, 0, 0
    for b in range(0, len(X), batch):
        logits = model.forward(X[b : b + batch].astype(np.float64)).reshape(-1, SEATS, TIERS)
        p = softmax_rows(logits)
        yy = y[b : b + batch]
        mm = mask[b : b + batch]
        picked = np.take_along_axis(p, yy[:, :, None], axis=2)[:, :, 0]
        nll += -np.log(np.maximum(picked[mm], 1e-9)).sum()
        hits += (p.argmax(axis=2) == yy)[mm].sum()
        count += mm.sum()
    if count == 0:
        return float("nan"), float("nan")
    return nll / count, hits / count


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--fixture", required=True)
    ap.add_argument("--players", type=int, default=0)
    ap.add_argument("--sizes", default="64")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--l2", type=float, default=1e-5)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default="")
    ap.add_argument("--name", default="VTRICK_MODEL")
    ap.add_argument("--note", default="")
    a = ap.parse_args()

    s = concat(a.files)
    pr = PlyRows(s)
    checked = check_fixture(pr.cols, a.fixture)
    d = s.data
    n = d[:, pr.at["n"]].astype(int)
    rows = np.where(n == a.players)[0] if a.players else np.arange(len(d))
    game = d[rows, pr.at["game"]].astype(int)
    print(f"{len(d)} plies · encoder parity ok on {checked} fixture plies · {len(rows)} kept")
    t0 = time.time()
    X = pr.encode(rows)
    y, mask = pr.targets(rows)
    print(f"encoded {X.shape} in {time.time() - t0:.0f} s")
    test = game % 10 == 7
    Xtr, ytr, mtr = X[~test], y[~test], mask[~test]
    Xte, yte, mte = X[test], y[test], mask[test]

    # Baselines: predict the current tier (tricks won so far) and the marginal tier frequencies.
    tricks_now = pr.block("tricksWon", SEATS)[rows][test]
    me = d[rows, pr.at["seat"]].astype(int)[test]
    nn = n[rows][test]
    cur = np.zeros_like(yte)
    for r in range(SEATS):
        seat = (me + r) % nn
        cur[:, r] = tier_index(tricks_now[np.arange(len(yte)), seat])
    if mte.sum() > 0:
        print(f"baseline 'current tier' accuracy {(cur == yte)[mte].mean() * 100:.1f} %")
        freq = np.bincount(ytr[mtr], minlength=TIERS) / mtr.sum()
        print(f"baseline marginal nll {-np.log(freq[yte[mte]]).mean():.3f} · accuracy {(yte[mte] == freq.argmax()).mean() * 100:.1f} %")

    sizes = [pr.features, *[int(x) for x in a.sizes.split(",")], SEATS * TIERS]
    model = Mlp(sizes, seed=a.seed)
    rng = np.random.default_rng(a.seed)
    ids = np.arange(len(Xtr))
    t0 = time.time()
    for ep in range(a.epochs):
        rng.shuffle(ids)
        total = 0.0
        for b in range(0, len(ids), a.batch):
            bid = ids[b : b + a.batch]
            logits = model.forward(Xtr[bid].astype(np.float64), keep=True).reshape(-1, SEATS, TIERS)
            p = softmax_rows(logits)
            onehot = np.zeros_like(p)
            np.put_along_axis(onehot, ytr[bid][:, :, None], 1, axis=2)
            grad = (p - onehot) * mtr[bid][:, :, None] / len(bid)
            total += float(-np.log(np.maximum(np.take_along_axis(p, ytr[bid][:, :, None], axis=2), 1e-9))[mtr[bid][:, :, None]].sum())
            gW, gb = model.backward(grad.reshape(len(bid), -1))
            model.adam(gW, gb, a.lr, a.l2)
        nll, acc = evaluate(model, Xte, yte, mte)
        print(f"epoch {ep + 1}/{a.epochs}: train nll {total / mtr[ids].sum():.3f} · held-out nll {nll:.3f} · accuracy {acc * 100:.1f} % · {time.time() - t0:.0f} s")
    if a.out:
        model.export_ts(a.out, a.name, a.note or f"expected-tier net {sizes}, {len(rows)} plies", Xte[:16].astype(np.float64), f"{a.out}.fixture.json")
        print(f"wrote {a.out} (+ .fixture.json)")


if __name__ == "__main__":
    main()
