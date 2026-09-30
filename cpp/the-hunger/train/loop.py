"""Lilith expert iteration: self-play → train → gate, generation after generation.

  uv run --with torch --with numpy python cpp/the-hunger/train/loop.py \
      --run scratch/hunger-lilith/runs/<name> --boot scratch/hunger-lilith/data/boot0 \
      --init <weights.bin> --gens 10 --games 6000

Each generation g:
  1. self-play (`hg gen`) with a league: Lilith (current net, exploring), Lilith (best
     net so far), Dracula (cheap), Carmilla, Nosferatu. Lilith seats record their
     search values as the policy target; every seat records the result.
  2. train from the current weights on the last `--window` generations + the boot data.
  3. gate: the new net vs the best net, 1vN at 3p and 5p (paired `hg duel`); promote when
     the paired Δwin is positive at both.
Writes <run>/manifest.json, <run>/CHANGELOG.md, <run>/g<k>/{weights.bin,report.json,gate.txt}.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HG = os.path.join(ROOT, "build", "hg")
TRAIN = os.path.join(ROOT, "train", "lilith.py")


def sh(cmd, log=None):
    """Run `cmd`, streaming its output into `log` (and the loop's stdout) as it goes."""
    print("$", " ".join(cmd), flush=True)
    out = []
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1) as p:
        f = open(log, "a") if log else None
        for line in p.stdout:
            out.append(line)
            print(line, end="", flush=True)
            if f:
                f.write(line)
                f.flush()
        if f:
            f.close()
    if p.returncode:
        raise subprocess.CalledProcessError(p.returncode, cmd)
    return "".join(out)


def git_sha():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                              cwd=ROOT).stdout.strip()
    except Exception:
        return "?"


VMODE = 1


def gate(new, best, deals, offset, log):
    """Paired Δwin of the new net vs the best net at 3p and 5p (both nets loaded)."""
    res = {}
    for n in (3, 5):
        spec = f"vmode={VMODE}"
        out = sh([HG, "duel", f"lilith:net=0,{spec}", f"lilith:net=1,{spec}", str(n), str(deals), "--offset", str(offset),
                  "--net", new, "--net1", best, "--cache", os.path.join(os.path.dirname(log), "cache")], log)
        m = re.search(r"paired dwin ([+-][\d.]+)% \+- ([\d.]+)%", out)
        res[n] = (float(m.group(1)), float(m.group(2))) if m else (0.0, 99.0)
    return res


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--run", required=True)
    p.add_argument("--boot", nargs="*", default=[])
    p.add_argument("--init", required=True)
    p.add_argument("--gens", type=int, default=10)
    p.add_argument("--games", type=int, default=6000)
    p.add_argument("--window", type=int, default=4)
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--gate-deals", type=int, default=300)
    p.add_argument("--start", type=int, default=1)
    p.add_argument("--vmode", type=int, default=1)
    p.add_argument("--dracula-every", type=int, default=2)
    p.add_argument("--dracula-deals", type=int, default=200)
    p.add_argument("--worlds", type=int, default=6)
    args = p.parse_args()
    global VMODE
    VMODE = args.vmode
    os.makedirs(args.run, exist_ok=True)
    manifest_path = os.path.join(args.run, "manifest.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {
        "created": datetime.datetime.now().isoformat(timespec="seconds"), "git": git_sha(),
        "boot": args.boot, "init": args.init, "generations": [],
    }
    best = os.path.join(args.run, "best.bin")
    if not os.path.exists(best):
        shutil.copy(args.init, best)
    current = best
    for g in range(args.start, args.start + args.gens):
        gdir = os.path.join(args.run, f"g{g}")
        data = os.path.join(gdir, "data")
        os.makedirs(gdir, exist_ok=True)
        log = os.path.join(gdir, "log.txt")
        v = f"vmode={args.vmode},worlds={args.worlds}"
        mix = ";".join([
            f"lilith:net=0,temp=3,{v}", f"lilith:net=0,temp=3,{v}", f"lilith:net=1,{v}",
            "dracula:rollouts=300", "carmilla", "heuristic",
        ])
        sh([HG, "gen", data, "--games", str(args.games), "--offset", str(1_000_000 + g * 100_000),
            "--eps", "0.02", "--sample", "0.25", "--shard", "20000", "--mix", mix,
            "--net", current, "--net1", best], log)
        window = [os.path.join(args.run, f"g{k}", "data") for k in range(max(args.start, g - args.window + 1), g + 1)]
        window = [w for w in window if os.path.isdir(w)]
        sh(["uv", "run", "--with", "torch", "--with", "numpy", "python", TRAIN, "train", *window, *args.boot,
            "--out", gdir, "--init", current, "--epochs", str(args.epochs)], log)
        new = os.path.join(gdir, "weights.bin")
        res = gate(new, best, args.gate_deals, 3_000_000 + g * 10_000, os.path.join(gdir, "gate.txt"))
        promoted = all(d > 0 for d, _ in res.values())
        if promoted:
            shutil.copy(new, best)
        current = new
        entry = {"gen": g, "games": args.games, "gate": {str(k): v for k, v in res.items()}, "promoted": promoted,
                 "finished": datetime.datetime.now().isoformat(timespec="seconds")}
        if args.dracula_every and g % args.dracula_every == 0:
            # The real target: the best net so far, 1 vs 2 Draculas (live-equivalent cached baseline).
            out = sh([HG, "duel", f"lilith:net=0,vmode={VMODE}", "dracula", "3", str(args.dracula_deals),
                      "--offset", "5000000", "--net", best, "--cache", os.path.join(args.run, "cache-dracula")],
                     os.path.join(gdir, "vs-dracula.txt"))
            m = re.search(r"candidate wins ([\d.]+)%.*?paired dwin ([+-][\d.]+)% \+- ([\d.]+)%", out, re.S)
            if m:
                entry["vs_dracula_3p"] = {"win": float(m.group(1)), "dwin": float(m.group(2)), "se": float(m.group(3))}
        manifest["generations"].append(entry)
        json.dump(manifest, open(manifest_path, "w"), indent=2)
        with open(os.path.join(args.run, "CHANGELOG.md"), "a") as f:
            vd = entry.get("vs_dracula_3p")
            f.write(f"- g{g}: gate 3p {res[3][0]:+.1f}±{res[3][1]:.1f}, 5p {res[5][0]:+.1f}±{res[5][1]:.1f}"
                    f" → {'promoted' if promoted else 'kept best'}"
                    + (f"; best vs Dracula 3p: win {vd['win']}%, Δ {vd['dwin']:+.1f}±{vd['se']}" if vd else "") + "\n")
        print(f"g{g}: {res} promoted={promoted}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
