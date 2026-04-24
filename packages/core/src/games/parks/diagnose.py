"""Diagnose whether the no-intercept model has a systematic bias."""

import numpy as np
from minimize import load_rows, solve_l1, LETTERS

rows = load_rows()
res = solve_l1(rows, nonneg=False)
vars_ = res.x[: len(LETTERS)]

# Bucket residuals
signed_resids = []
for name, pt, a, cost_str, neg_str in rows:
    pred = float(a @ vars_)
    resid = pt - pred
    has_neg = bool(neg_str.strip())
    signed_resids.append((name, pt, pred, resid, has_neg, cost_str, neg_str))

with_neg = [r for r in signed_resids if r[4]]
no_neg = [r for r in signed_resids if not r[4]]

def stats(group, label):
    if not group:
        return
    rs = [r[3] for r in group]
    print(
        f"{label:25s} n={len(group):3d}  "
        f"mean_resid={np.mean(rs):+.3f}  "
        f"median_resid={np.median(rs):+.3f}  "
        f"sum_resid={sum(rs):+.3f}  "
        f"mean|resid|={np.mean([abs(r) for r in rs]):.3f}"
    )

print("Residual stats by card type:")
stats(signed_resids, "ALL cards")
stats(with_neg, "Cards WITH neg-cost")
stats(no_neg, "Cards without neg-cost")

# Bucket by PT
print("\nResidual stats by PT:")
for pt_val in sorted(set(r[1] for r in signed_resids)):
    group = [r for r in signed_resids if r[1] == pt_val]
    stats(group, f"PT={pt_val:.0f}")

# Test a sign test: are positive residuals significantly more common in "with neg" group?
n_pos_neg = sum(1 for r in with_neg if r[3] > 0)
n_pos_no = sum(1 for r in no_neg if r[3] > 0)
print(
    f"\nWith neg-cost: {n_pos_neg}/{len(with_neg)} positive residuals "
    f"({100 * n_pos_neg / len(with_neg):.0f}%)"
)
print(
    f"Without neg-cost: {n_pos_no}/{len(no_neg)} positive residuals "
    f"({100 * n_pos_no / len(no_neg):.0f}%)"
)
