#!/usr/bin/env python3
"""Train the 7 Wonders policy+value MLP from C++ self-play samples (numpy).

Reads a .bin produced by `sw7 selfplay` and writes weights in the flat layout
`sw7` loads (see include/sw/net.hpp). numpy keeps this dependency-free and
validates the whole loop on CPU; swap in the torch version for GPU-scale runs.

  python train.py samples.bin --out weights.bin [--init prev.bin]
                  [--epochs 8] [--batch 256] [--lr 1e-3] [--vw 1.0]
"""
import argparse
import struct
import numpy as np

# Architecture — must match include/sw/net.hpp.
H1, H2 = 128, 128
WN_MAGIC = 0x53574E31   # "SWN1"
SP_MAGIC = 0x53575350   # "SWSP"


def read_samples(path):
    with open(path, "rb") as f:
        magic, n, feat, pol, val = struct.unpack("<Iiiii", f.read(20))
        assert magic == SP_MAGIC, "not a self-play sample file"
        F = np.frombuffer(f.read(4 * n * feat), dtype=np.float32).reshape(n, feat).copy()
        P = np.frombuffer(f.read(4 * n * pol), dtype=np.float32).reshape(n, pol).copy()
        V = np.frombuffer(f.read(4 * n * val), dtype=np.float32).reshape(n, val).copy()
    return F, P, V, feat, pol, val


def he(shape, fan_in, rng):
    return (rng.standard_normal(shape) * np.sqrt(2.0 / fan_in)).astype(np.float32)


def init_params(feat, pol, val, rng):
    return {
        "W1": he((H1, feat), feat, rng), "b1": np.zeros(H1, np.float32),
        "W2": he((H2, H1), H1, rng),     "b2": np.zeros(H2, np.float32),
        "Wp": he((pol, H2), H2, rng),    "bp": np.zeros(pol, np.float32),
        "Wv": he((val, H2), H2, rng),    "bv": np.zeros(val, np.float32),
    }


def load_params(path, feat, pol, val):
    order = [("W1", (H1, feat)), ("b1", (H1,)), ("W2", (H2, H1)), ("b2", (H2,)),
             ("Wp", (pol, H2)), ("bp", (pol,)), ("Wv", (val, H2)), ("bv", (val,))]
    with open(path, "rb") as f:
        magic = struct.unpack("<I", f.read(4))[0]
        hdr = struct.unpack("<5i", f.read(20))
        assert magic == WN_MAGIC and hdr == (feat, H1, H2, pol, val), "weights arch mismatch"
        p = {}
        for name, shape in order:
            cnt = int(np.prod(shape))
            p[name] = np.frombuffer(f.read(4 * cnt), np.float32).reshape(shape).copy()
    return p


def save_params(path, p, feat, pol, val):
    with open(path, "wb") as f:
        f.write(struct.pack("<I", WN_MAGIC))
        f.write(struct.pack("<5i", feat, H1, H2, pol, val))
        for name in ["W1", "b1", "W2", "b2", "Wp", "bp", "Wv", "bv"]:
            f.write(np.ascontiguousarray(p[name], np.float32).tobytes())


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("samples")
    ap.add_argument("--out", required=True)
    ap.add_argument("--init", default=None)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--vw", type=float, default=1.0, help="value loss weight")
    a = ap.parse_args()
    rng = np.random.default_rng(0)

    F, P, V, feat, pol, val = read_samples(a.samples)
    print(f"samples: {F.shape[0]}  feat={feat} pol={pol} val={val}")
    p = load_params(a.init, feat, pol, val) if a.init else init_params(feat, pol, val, rng)

    # Adam state
    m = {k: np.zeros_like(v) for k, v in p.items()}
    v2 = {k: np.zeros_like(v) for k, v in p.items()}
    b1a, b2a, eps, t = 0.9, 0.999, 1e-8, 0

    n = F.shape[0]
    for ep in range(a.epochs):
        idx = rng.permutation(n)
        ploss = vloss = 0.0
        nb = 0
        for s in range(0, n, a.batch):
            bi = idx[s:s + a.batch]
            X, Pt, Vt = F[bi], P[bi], V[bi]
            B = X.shape[0]
            # forward
            z1 = X @ p["W1"].T + p["b1"]; a1 = np.maximum(z1, 0)
            z2 = a1 @ p["W2"].T + p["b2"]; a2 = np.maximum(z2, 0)
            logits = a2 @ p["Wp"].T + p["bp"]
            vraw = a2 @ p["Wv"].T + p["bv"]
            sm = softmax(logits)
            vp = 1.0 / (1.0 + np.exp(-vraw))
            # losses (soft-target CE + value BCE)
            ploss += float(-(Pt * np.log(sm + 1e-9)).sum(1).mean())
            vloss += float(-(Vt * np.log(vp + 1e-9) + (1 - Vt) * np.log(1 - vp + 1e-9)).mean())
            nb += 1
            # backward
            dlogits = (sm - Pt) / B
            dvraw = a.vw * (vp - Vt) / B
            g = {}
            g["Wp"] = dlogits.T @ a2; g["bp"] = dlogits.sum(0)
            g["Wv"] = dvraw.T @ a2;   g["bv"] = dvraw.sum(0)
            da2 = dlogits @ p["Wp"] + dvraw @ p["Wv"]
            dz2 = da2 * (z2 > 0)
            g["W2"] = dz2.T @ a1; g["b2"] = dz2.sum(0)
            da1 = dz2 @ p["W2"]
            dz1 = da1 * (z1 > 0)
            g["W1"] = dz1.T @ X; g["b1"] = dz1.sum(0)
            # Adam step
            t += 1
            for k in p:
                m[k] = b1a * m[k] + (1 - b1a) * g[k]
                v2[k] = b2a * v2[k] + (1 - b2a) * (g[k] * g[k])
                mh = m[k] / (1 - b1a ** t)
                vh = v2[k] / (1 - b2a ** t)
                p[k] -= a.lr * mh / (np.sqrt(vh) + eps)
        print(f"  epoch {ep+1}/{a.epochs}  policy_ce={ploss/nb:.4f}  value_bce={vloss/nb:.4f}")

    save_params(a.out, p, feat, pol, val)
    print(f"wrote weights -> {a.out}")


if __name__ == "__main__":
    main()
