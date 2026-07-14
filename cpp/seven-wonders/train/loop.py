#!/usr/bin/env python3
"""AlphaZero self-play loop for 7 Wonders: alternate C++ self-play and training,
with a replay-buffer window. Run from cpp/seven-wonders/.

  python train/loop.py --iters 30 --games 400 --sp-iters 400 \
                       --eval-iters 400 --window 4 --trainer torch

Iteration 0 bootstraps from rollout (M0) self-play; each later iteration plays
with the current net (PUCT), retrains on the last `--window` sample files, and
evaluates vs random. Swap `--trainer numpy` for the CPU/no-torch path.
"""
import argparse
import os
import struct
import subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SW7 = os.path.join(ROOT, "build", "sw7")
SP_MAGIC = 0x53575350


def merge(files, out):
    Fs, Ps, Vs = [], [], []
    feat = pol = val = None
    for path in files:
        with open(path, "rb") as f:
            magic, n, ft, pl, vl = struct.unpack("<Iiiii", f.read(20))
            assert magic == SP_MAGIC
            feat, pol, val = ft, pl, vl
            Fs.append(np.frombuffer(f.read(4 * n * ft), np.float32).reshape(n, ft))
            Ps.append(np.frombuffer(f.read(4 * n * pl), np.float32).reshape(n, pl))
            Vs.append(np.frombuffer(f.read(4 * n * vl), np.float32).reshape(n, vl))
    F, P, V = np.vstack(Fs), np.vstack(Ps), np.vstack(Vs)
    with open(out, "wb") as f:
        f.write(struct.pack("<Iiiii", SP_MAGIC, F.shape[0], feat, pol, val))
        f.write(F.astype(np.float32).tobytes())
        f.write(P.astype(np.float32).tobytes())
        f.write(V.astype(np.float32).tobytes())
    return F.shape[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--iters", type=int, default=20)
    ap.add_argument("--games", type=int, default=200)
    ap.add_argument("--sp-iters", type=int, default=300)
    ap.add_argument("--eval-iters", type=int, default=300)
    ap.add_argument("--eval-games", type=int, default=100)
    ap.add_argument("--window", type=int, default=4)
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--trainer", choices=["numpy", "torch"], default="numpy")
    ap.add_argument("--population", action="store_true",
                    help="generate data vs heuristic archetypes (robustness, PSRO-lite)")
    ap.add_argument("--workdir", default=os.path.join(ROOT, "build"))
    a = ap.parse_args()
    os.makedirs(a.workdir, exist_ok=True)
    trainer = os.path.join(ROOT, "train", "train.py" if a.trainer == "numpy" else "train_torch.py")

    sample_files = []
    prev_w = None
    for it in range(a.iters):
        data = os.path.join(a.workdir, f"data_{it}.bin")
        sp = "selfplay-pop" if a.population else "selfplay"
        cmd = [SW7, sp, str(a.games), str(a.sp_iters), data]
        if prev_w:
            cmd += [prev_w, str(1000 + it)]
        mode = ("PUCT" if prev_w else "rollout") + ("/pop" if a.population else "/self")
        print(f"\n=== iter {it}: self-play ({mode}) ===", flush=True)
        subprocess.run(cmd, check=True)
        sample_files.append(data)

        window = sample_files[-a.window:]
        merged = os.path.join(a.workdir, "replay.bin")
        total = merge(window, merged)
        w = os.path.join(a.workdir, f"w_{it}.bin")
        print(f"=== iter {it}: train on {total} samples ({len(window)} files) ===", flush=True)
        tc = ["python3", trainer, merged, "--out", w, "--epochs", str(a.epochs)]
        if prev_w:
            tc += ["--init", prev_w]
        subprocess.run(tc, check=True)

        print(f"=== iter {it}: eval ===", flush=True)
        ev = ["evalpop", w] if a.population else ["evalnet", w]
        subprocess.run([SW7, *ev, str(a.eval_games), str(a.eval_iters)], check=True)
        prev_w = w

    print(f"\ndone. latest blueprint: {prev_w}")


if __name__ == "__main__":
    main()
