"""Train the playout policy (src/rollpol.cpp): a linear softmax over each decision's
legal moves, imitating the expert's choice (`hg polgen` data).

  uv run --with torch --with numpy python cpp/the-hunger/train/rollpol.py <dirs...> --out pol.bin

Starts from "play Nosferatu's move" (weight on the is-Nosferatu feature), so the
report's baseline is Nosferatu's own agreement with the expert. Validation holds
out whole files (whole games of one thread).
"""
import argparse
import glob
import os
import struct

import numpy as np
import torch

POL_MAGIC = 0x504F4C31
PLG_MAGIC = 0x31474C50
F = 72
F_NOS = 20


def read(path):
    with open(path, "rb") as f:
        buf = f.read()
    magic, n, rows, nf = struct.unpack_from("<4I", buf, 0)
    assert magic == PLG_MAGIC and nf == F, path
    o = 16
    L = np.frombuffer(buf, np.int32, n, o); o += 4 * n
    c = np.frombuffer(buf, np.int32, n, o); o += 4 * n
    X = np.frombuffer(buf, np.float32, rows * F, o).reshape(rows, F)
    return L, c, X


def load(files):
    Ls, cs, Xs = zip(*(read(f) for f in files))
    return np.concatenate(Ls), np.concatenate(cs), np.concatenate(Xs)


def tensors(L, c, X):
    seg = torch.from_numpy(np.repeat(np.arange(len(L)), L)).long()
    start = np.concatenate([[0], np.cumsum(L)[:-1]])
    target = torch.from_numpy(start + c).long()
    return torch.from_numpy(X.copy()), seg, target, len(L)


def nll(w, X, seg, target, n):
    logits = X @ w
    mx = torch.full((n,), -1e30).scatter_reduce(0, seg, logits, "amax")
    z = logits - mx[seg]
    lse = torch.zeros(n).index_add_(0, seg, z.exp()).log()
    logp = z - lse[seg]
    loss = -logp[target].mean()
    best = torch.full((n,), -1e30).scatter_reduce(0, seg, logits, "amax")
    acc = (logits[target] >= best).float().mean()
    return loss, acc


def main():
    p = argparse.ArgumentParser()
    p.add_argument("data", nargs="+")
    p.add_argument("--out", required=True)
    p.add_argument("--init")
    p.add_argument("--steps", type=int, default=600)
    p.add_argument("--l2", type=float, default=1e-3)
    args = p.parse_args()
    files = sorted(f for d in args.data for f in glob.glob(os.path.join(d, "*.pol")))
    val_files, train_files = files[: max(1, len(files) // 8)], files[max(1, len(files) // 8):]
    tr = tensors(*load(train_files))
    va = tensors(*load(val_files))
    print(f"train {tr[3]} decisions, val {va[3]} ({len(files)} files)")
    w = torch.zeros(F)
    if args.init:
        with open(args.init, "rb") as f:
            buf = f.read()
        w = torch.from_numpy(np.frombuffer(buf, np.float32, F, 8).copy())
    else:
        w[F_NOS] = 5.0
    with torch.no_grad():
        base = nll(w, *va)
    print(f"start: val loss {float(base[0]):.4f} acc {float(base[1]):.4f}")
    w.requires_grad_(True)
    opt = torch.optim.LBFGS([w], lr=0.5, max_iter=args.steps, history_size=20, line_search_fn="strong_wolfe")

    def closure():
        opt.zero_grad()
        loss, _ = nll(w, *tr)
        loss = loss + args.l2 * (w ** 2).sum()
        loss.backward()
        return loss

    opt.step(closure)
    with torch.no_grad():
        tl, ta = nll(w, *tr)
        vl, vaa = nll(w, *va)
    print(f"trained: train loss {float(tl):.4f} acc {float(ta):.4f} | val loss {float(vl):.4f} acc {float(vaa):.4f}")
    with open(args.out, "wb") as f:
        f.write(struct.pack("<II", POL_MAGIC, F))
        f.write(w.detach().numpy().astype(np.float32).tobytes())
    names = open(os.path.join(os.path.dirname(__file__), "..", "src", "rollpol.cpp")).read()
    print("weights:", " ".join(f"{i}:{float(x):+.2f}" for i, x in enumerate(w.detach().numpy()) if abs(x) > 0.05))


if __name__ == "__main__":
    main()
