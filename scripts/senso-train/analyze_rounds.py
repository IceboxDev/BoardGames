#!/usr/bin/env python3
"""Phase 0.2 / 0.3 diagnostics on collect-value.ts round samples.

    uv run --with numpy scripts/senso-train/analyze_rounds.py scratch/value/*.rounds.bin

0.2  Leaf fidelity: R² of the tier table's prediction (Σ_p table[s][p][tier_p]) against the
     realized post-rewards standing change, on the rounds as played (variant 0) and on the
     counterfactual rewards phases (variants ≥ 1); the held-out R² (by game) of a ridge fit on
     the residual with the tier cells + tricks + round as features; per round bucket.
0.3  Objective: sign agreement between Δ(standing) and Δ(logistic P(win)) fitted on
     (gap, cube gap, rounds left, Emperor) from the games' final outcomes.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from samples import concat  # noqa: E402

TIER_INDEX = {0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3}
SEATS, TIERS = 5, 5


def tier_index(tricks: np.ndarray) -> np.ndarray:
    out = np.zeros_like(tricks, dtype=int)
    out[tricks >= 1] = 1
    out[tricks >= 3] = 2
    out[tricks >= 5] = 3
    out[tricks >= 7] = 4
    return out


def r2(y: np.ndarray, pred: np.ndarray) -> float:
    ss = np.sum((y - y.mean()) ** 2)
    return 1 - np.sum((y - pred) ** 2) / ss if ss > 0 else float("nan")


def ridge(X: np.ndarray, y: np.ndarray, lam: float = 1e-2) -> np.ndarray:
    Xb = np.hstack([X, np.ones((len(X), 1))])
    A = Xb.T @ Xb + lam * len(X) * np.eye(Xb.shape[1])
    A[-1, -1] -= lam * len(X)
    return np.linalg.solve(A, Xb.T @ y)


def predict(w: np.ndarray, X: np.ndarray) -> np.ndarray:
    return np.hstack([X, np.ones((len(X), 1))]) @ w


def main(paths: list[str]) -> None:
    s = concat(paths)
    game = s.col("game").astype(int)
    rnd = s.col("round").astype(int)
    variant = s.col("variant").astype(int)
    n = s.col("n").astype(int)
    tricks = s.col("tricks")
    tier = s.col("tier").reshape(len(s.data), SEATS, SEATS, TIERS)
    before = s.col("standingBefore")
    after = s.col("standingAfter")
    emperor = s.col("emperorSeat").astype(int)
    trailer = variant == -1
    final_win = {g: s.col("win")[i] for i, g in enumerate(game) if trailer[i]}
    final_place = {g: s.col("finalPlacement")[i] for i, g in enumerate(game) if trailer[i]}
    rows = ~trailer
    print(f"{len(s.data)} rows · {trailer.sum()} games · {rows.sum()} round rows · table sizes {sorted(set(n))}")

    # ---- 0.2 leaf fidelity -------------------------------------------------
    ti = tier_index(tricks)
    # prediction[s] = Σ_p table[s][p][ti[p]]
    pred = np.zeros((len(s.data), SEATS))
    for p in range(SEATS):
        pred += np.take_along_axis(tier[:, :, p, :], ti[:, None, p, None].repeat(SEATS, 1), axis=2)[:, :, 0]
    actual = after - before
    seat_mask = np.arange(SEATS)[None, :] < n[:, None]

    def report(label: str, mask: np.ndarray) -> None:
        m = mask & rows
        y = actual[m][seat_mask[m]]
        yhat = pred[m][seat_mask[m]]
        print(f"  {label:<28} rows {m.sum():6d} · tier-table R² {r2(y, yhat):6.3f} · corr {np.corrcoef(y, yhat)[0, 1]:6.3f} · rmse {np.sqrt(np.mean((y - yhat) ** 2)):5.2f} · sd(actual) {y.std():5.2f}")

    print("\n0.2 tier table vs realized post-rewards Δstanding")
    for players in sorted(set(n)):
        pm = n == players
        report(f"{players}p all variants", pm)
        report(f"{players}p as played", pm & (variant == 0))
        report(f"{players}p counterfactual", pm & (variant >= 1))
        for lo, hi in ((1, 3), (4, 5), (6, 8)):
            report(f"{players}p rounds {lo}-{hi}", pm & (rnd >= lo) & (rnd <= hi))

    # Residual learnability: ridge on (tier cells of the actual tiers, tricks, round) per seat row.
    print("\n0.2 residual ridge (held out by game % 10 == 7)")
    for players in sorted(set(n)):
        pm = (n == players) & rows
        feats = []
        ys = []
        gs = []
        for i in np.where(pm)[0]:
            for sidx in range(players):
                cells = tier[i, sidx, :players, :].reshape(-1)
                own = np.zeros(TIERS)
                own[ti[i, sidx]] = 1
                x = np.concatenate([cells, tricks[i, :players] / 13, own, [rnd[i] / 8, pred[i, sidx], 1.0 if sidx == emperor[i] else 0.0]])
                feats.append(x)
                ys.append(actual[i, sidx] - pred[i, sidx])
                gs.append(game[i])
        X = np.array(feats)
        y = np.array(ys)
        g = np.array(gs)
        test = g % 10 == 7
        w = ridge(X[~test], y[~test])
        resid_r2 = r2(y[test], predict(w, X[test]))
        base = actual[pm][seat_mask[pm]]
        print(f"  {players}p: residual rows {len(y)} · held-out residual R² {resid_r2:6.3f} (vs a 0 baseline) · combined R² ≈ {1 - (1 - r2(base, pred[pm][seat_mask[pm]])) * (1 - max(resid_r2, 0)):6.3f}")

    # ---- 0.3 objective -----------------------------------------------------
    print("\n0.3 sign agreement Δstanding vs Δlogit P(win)")
    for players in sorted(set(n)):
        pm = (n == players) & rows & (variant == 0)
        idx = [i for i in np.where(pm)[0] if game[i] in final_win]
        if not idx:
            continue
        X, y = [], []
        cubes_b = s.col("cubesBefore")
        cubes_a = s.col("cubesAfter")
        score_b = s.col("scoreBefore")
        score_a = s.col("scoreAfter")
        for i in idx:
            for sidx in range(players):
                for scores, cubes in ((score_b[i], cubes_b[i]), (score_a[i], cubes_a[i])):
                    rival = max(scores[j] for j in range(players) if j != sidx)
                    crival = max(cubes[j] for j in range(players) if j != sidx)
                    X.append([scores[sidx] - rival, cubes[sidx] - crival, (8 - rnd[i]) / 8, 1.0 if sidx == emperor[i] else 0.0])
                    y.append(final_win[game[i]][sidx])
        X = np.array(X)
        y = np.array(y)
        # logistic regression by Newton steps
        Xb = np.hstack([X, np.ones((len(X), 1))])
        w = np.zeros(Xb.shape[1])
        for _ in range(25):
            p = 1 / (1 + np.exp(-Xb @ w))
            grad = Xb.T @ (p - y) + 1e-3 * w
            H = (Xb * (p * (1 - p))[:, None]).T @ Xb + 1e-3 * np.eye(len(w))
            w -= np.linalg.solve(H, grad)
        logit = Xb @ w
        d_logit = logit[1::2] - logit[0::2]
        d_stand = (after - before)[pm][:, :players].reshape(-1)
        d_stand = np.array([d_stand[k] for k in range(len(d_stand))])
        both = (np.abs(d_stand) > 1e-9) & (np.abs(d_logit) > 1e-9)
        agree = np.mean(np.sign(d_stand[both]) == np.sign(d_logit[both]))
        print(f"  {players}p: logistic w(gap, cubeGap, roundsLeft, emperor, bias) = {np.round(w, 3)} · sign agreement on {both.sum()} moves: {agree * 100:.1f} %")


if __name__ == "__main__":
    main(sys.argv[1:])
