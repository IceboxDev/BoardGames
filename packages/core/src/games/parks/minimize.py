"""
L1 minimization to recover latent values M, F, S, W, A, C, B for Parks cards.

Model: PT_i = sum(cost_letters_i) - negcost_i
where negcost_i is either a sum of letters or (mfacssww)/6 for some cards.

We minimize sum_i |PT_i - predicted_i| (L1 norm) via linear programming
to surface true outliers without overfitting to them.
"""

import csv
import sys
import numpy as np
from scipy.optimize import linprog

LETTERS = ["m", "f", "s", "w", "a", "c", "b"]
LETTER_TO_IDX = {l: i for i, l in enumerate(LETTERS)}
CSV_PATH = "/home/mantas/Documents/Personal/BoardGames/packages/core/src/games/parks/Untitled spreadsheet - Sheet1.csv"


def parse_letter_string(s):
    v = np.zeros(len(LETTERS))
    for ch in s:
        if ch in LETTER_TO_IDX:
            v[LETTER_TO_IDX[ch]] += 1
    return v


def parse_negcost(s):
    s = s.strip()
    if not s:
        return np.zeros(len(LETTERS))
    if s.startswith("("):
        inner, divisor = s[1:].split(")/")
        return parse_letter_string(inner) / float(divisor)
    return parse_letter_string(s)


def load_rows():
    rows = []
    with open(CSV_PATH) as f:
        for raw in f:
            raw = raw.rstrip("\n")
            if not raw.strip():
                continue
            rest = raw.split("\t", 1)[1] if "\t" in raw else raw
            parts = next(csv.reader([rest]))
            if len(parts) < 3:
                continue
            name = parts[0]
            pt = float(parts[1])
            cost_str = parts[2] if len(parts) > 2 else ""
            neg_str = parts[3] if len(parts) > 3 else ""
            a = parse_letter_string(cost_str) - parse_negcost(neg_str)
            rows.append((name, pt, a, cost_str, neg_str))
    return rows


def solve_l1(rows, nonneg=False, integer_grid=None):
    """Solve min sum |PT_i - a_i^T x| via LP.

    Variables: [M, F, S, W, A, C, B, u_1, ..., u_N], u_i >= 0.
    Constraints: a_i^T x - u_i <= PT_i and -a_i^T x - u_i <= -PT_i.
    """
    n_letters = len(LETTERS)
    N = len(rows)
    n_vars = n_letters + N

    c = np.zeros(n_vars)
    c[n_letters:] = 1.0

    A_ub = np.zeros((2 * N, n_vars))
    b_ub = np.zeros(2 * N)
    for i, (_, pt, a, _, _) in enumerate(rows):
        A_ub[2 * i, :n_letters] = a
        A_ub[2 * i, n_letters + i] = -1.0
        b_ub[2 * i] = pt
        A_ub[2 * i + 1, :n_letters] = -a
        A_ub[2 * i + 1, n_letters + i] = -1.0
        b_ub[2 * i + 1] = -pt

    letter_bound = (0, None) if nonneg else (None, None)
    bounds = [letter_bound] * n_letters + [(0, None)] * N

    result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
    return result


def report(label, result, rows, top_k=20):
    print("=" * 80)
    print(label)
    print("=" * 80)
    if not result.success:
        print(f"FAILED: {result.message}")
        return None
    vars_ = result.x[: len(LETTERS)]
    print("\nOptimal letter values:")
    for letter, val in zip(LETTERS, vars_):
        print(f"  {letter.upper()} = {val:+.6f}")
    print(f"\nTotal |error| (L1) = {result.fun:.6f}")
    print(f"Mean  |error|      = {result.fun / len(rows):.6f}")

    preds = []
    for name, pt, a, cost_str, neg_str in rows:
        pred = float(a @ vars_)
        preds.append((name, pt, pred, pt - pred, cost_str, neg_str))

    abs_err = [abs(r[3]) for r in preds]
    print(f"Median|error|     = {np.median(abs_err):.6f}")
    print(f"Max   |error|     = {max(abs_err):.6f}")
    n_zero = sum(1 for e in abs_err if e < 1e-6)
    n_small = sum(1 for e in abs_err if e < 0.5)
    print(f"Cards with |error| < 1e-6: {n_zero}/{len(rows)}")
    print(f"Cards with |error| < 0.5 : {n_small}/{len(rows)}")

    print(f"\nTop {top_k} residuals (potential outliers):")
    print(f"  {'card':30s} {'PT':>4s} {'pred':>8s} {'resid':>8s}  cost / neg")
    preds_sorted = sorted(preds, key=lambda r: abs(r[3]), reverse=True)
    for name, pt, pred, resid, cost_str, neg_str in preds_sorted[:top_k]:
        print(
            f"  {name:30s} {pt:4.0f} {pred:8.3f} {resid:+8.3f}  {cost_str} / {neg_str}"
        )

    print("\nCards that fit EXACTLY (residual ~ 0):")
    print(f"  {'card':30s} {'PT':>4s} {'pred':>8s}  cost / neg")
    for name, pt, pred, resid, cost_str, neg_str in preds:
        if abs(resid) < 1e-6:
            print(f"  {name:30s} {pt:4.0f} {pred:8.3f}  {cost_str} / {neg_str}")
    return vars_


def solve_l1_with_intercept(rows):
    """Same LP but adds an intercept term: PT = c0 + a^T x."""
    n_letters = len(LETTERS) + 1  # +1 for intercept
    N = len(rows)
    n_vars = n_letters + N

    c = np.zeros(n_vars)
    c[n_letters:] = 1.0

    A_ub = np.zeros((2 * N, n_vars))
    b_ub = np.zeros(2 * N)
    for i, (_, pt, a, _, _) in enumerate(rows):
        A_ub[2 * i, : len(LETTERS)] = a
        A_ub[2 * i, len(LETTERS)] = 1.0  # intercept
        A_ub[2 * i, n_letters + i] = -1.0
        b_ub[2 * i] = pt
        A_ub[2 * i + 1, : len(LETTERS)] = -a
        A_ub[2 * i + 1, len(LETTERS)] = -1.0  # intercept
        A_ub[2 * i + 1, n_letters + i] = -1.0
        b_ub[2 * i + 1] = -pt

    bounds = [(None, None)] * n_letters + [(0, None)] * N
    return linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")


def evaluate_assignment(rows, assignment_dict):
    """Try a hand-picked assignment and report errors."""
    vars_ = np.array([assignment_dict[l] for l in LETTERS], dtype=float)
    total = 0.0
    worst = []
    for name, pt, a, cost_str, neg_str in rows:
        pred = float(a @ vars_)
        err = abs(pt - pred)
        total += err
        worst.append((name, pt, pred, pt - pred, cost_str, neg_str))
    worst.sort(key=lambda r: abs(r[3]), reverse=True)
    return total, worst


def main():
    rows = load_rows()
    print(f"Loaded {len(rows)} cards from CSV.\n")

    # 1) Unconstrained L1 fit
    res1 = solve_l1(rows, nonneg=False)
    vars1 = report("UNCONSTRAINED L1 MINIMIZATION", res1, rows)

    # 2) Non-negative L1 fit
    res2 = solve_l1(rows, nonneg=True)
    vars2 = report("\nNON-NEGATIVE L1 MINIMIZATION", res2, rows)

    # 3) Add an intercept (in case there's a constant overhead per card)
    print("\n" + "=" * 80)
    print("L1 MINIMIZATION WITH INTERCEPT: PT = c0 + sum_letters")
    print("=" * 80)
    res3 = solve_l1_with_intercept(rows)
    if res3.success:
        vars3 = res3.x[: len(LETTERS)]
        c0 = res3.x[len(LETTERS)]
        print("Optimal letter values:")
        for letter, val in zip(LETTERS, vars3):
            print(f"  {letter.upper()} = {val:+.6f}")
        print(f"  intercept c0 = {c0:+.6f}")
        print(f"Total |error| (L1) = {res3.fun:.6f}")
        print(f"Mean  |error|      = {res3.fun / len(rows):.6f}")
    else:
        print("FAILED:", res3.message)


if __name__ == "__main__":
    main()
