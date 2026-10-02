"""Find a table size's plan: CMA-ES over the 14 numbers of the plan executor
(src/exec.cpp), scored by its win share as one seat among cheap Draculas.

  uv run --with numpy --with cma python cpp/the-hunger/train/exec_opt.py --players 5 \
      --out scratch/hunger-lilith/exec/p5 [--deals 120] [--iters 30] [--popsize 10]

Every candidate plays the same deals (paired against the cached all-Dracula
games), so candidates differ by play, not luck. The best vector is written as
<out>/best.txt (the `--exec` file format) and re-checked on held-out deals.
"""
import argparse
import json
import os
import re
import subprocess

import cma
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HG = os.path.join(ROOT, "build", "hg")

# name, low, high, the Rose run's value (the starting point)
PARAMS = [
    ("pace", 0.5, 1.0, 0.75),
    ("margin", 0.0, 8.0, 4.0),
    ("lastOut", 2.0, 13.0, 9.0),
    ("lab", 0.0, 4.0, 2.0),
    ("forest", 0.0, 4.0, 0.0),
    ("chest", 0.0, 8.0, 3.0),
    ("tavern", 0.0, 8.0, 0.0),
    ("crypt", 0.0, 3.0, 0.0),
    ("plains", -3.0, 3.0, 0.0),
    ("outHumanVp", 0.0, 1.5, 0.4),
    ("outNegSpeed", 0.0, 4.0, 2.5),
    ("outPower", 0.0, 4.0, 1.5),
    ("backForest", -3.0, 3.0, 0.0),
    ("huntMin", -1.0, 5.0, 1.0),
]
LO = np.array([p[1] for p in PARAMS])
HI = np.array([p[2] for p in PARAMS])
X0 = np.array([p[3] for p in PARAMS])


def to_params(z):
    return LO + (HI - LO) * np.clip(z, 0.0, 1.0)


def to_z(x):
    return (x - LO) / (HI - LO)


def evaluate(x, args, offset, deals, tag):
    path = os.path.join(args.out, f"cand-{tag}.txt")
    with open(path, "w") as f:
        f.write(" ".join(f"{v:.4f}" for v in x) + "\n")
    out = subprocess.run(
        [HG, "duel", "exec", args.base, str(args.players), str(deals), "--offset", str(offset),
         "--exec", path, "--cache", os.path.join(args.out, "cache"), "--threads", str(args.threads)],
        check=True, capture_output=True, text=True).stdout
    win = float(re.search(r"candidate wins ([\d.]+)%", out).group(1))
    dwin = float(re.search(r"paired dwin ([+-][\d.]+)%", out).group(1))
    surv = float(re.search(r"survival ([\d.]+)%", out).group(1))
    return win, dwin, surv


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--players", type=int, required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--base", default="dracula:rollouts=100,maxPlans=24")
    p.add_argument("--deals", type=int, default=100)
    p.add_argument("--iters", type=int, default=20)
    p.add_argument("--popsize", type=int, default=10)
    p.add_argument("--offset", type=int, default=7_000_000)
    p.add_argument("--holdout", type=int, default=7_500_000)
    p.add_argument("--threads", type=int, default=16)
    p.add_argument("--resume", action="store_true", help="start the search from <out>/best.txt")
    args = p.parse_args()
    os.makedirs(args.out, exist_ok=True)
    log = open(os.path.join(args.out, "log.jsonl"), "a")
    start = X0
    best_path = os.path.join(args.out, "best.txt")
    if args.resume and os.path.exists(best_path):
        start = np.array([float(v) for v in open(best_path).read().split()])
        print("resuming from", best_path, flush=True)
    es = cma.CMAEvolutionStrategy(to_z(start), 0.2, {"bounds": [0, 1], "popsize": args.popsize, "seed": 1})
    best = (-1e9, X0)
    w0 = evaluate(X0, args, args.offset, args.deals, "start")
    print(f"start (the Rose run): win {w0[0]}% dwin {w0[1]:+} surv {w0[2]}%", flush=True)
    for it in range(args.iters):
        zs = es.ask()
        scores = []
        for k, z in enumerate(zs):
            x = to_params(np.array(z))
            win, dwin, surv = evaluate(x, args, args.offset, args.deals, f"{it}-{k}")
            scores.append(-win)
            log.write(json.dumps({"iter": it, "k": k, "win": win, "dwin": dwin, "surv": surv,
                                  "x": [round(float(v), 4) for v in x]}) + "\n")
            log.flush()
            if win > best[0]:
                best = (win, x)
                with open(os.path.join(args.out, "best.txt"), "w") as f:
                    f.write(" ".join(f"{v:.4f}" for v in x) + "\n")
        es.tell(zs, scores)
        print(f"iter {it}: best-in-gen {-min(scores):.1f}% overall best {best[0]:.1f}%", flush=True)
    hw = evaluate(best[1], args, args.holdout, 300, "holdout")
    hs = evaluate(X0, args, args.holdout, 300, "holdout-start")
    print(f"holdout 300 deals: best win {hw[0]}% dwin {hw[1]:+} surv {hw[2]}% | "
          f"Rose run win {hs[0]}% dwin {hs[1]:+} surv {hs[2]}%", flush=True)
    print("best:", " ".join(f"{n}={v:.3f}" for (n, *_), v in zip(PARAMS, best[1])))


if __name__ == "__main__":
    main()
