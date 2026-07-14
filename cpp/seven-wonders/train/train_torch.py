#!/usr/bin/env python3
"""GPU (torch) drop-in for train.py — identical sample/weights formats.

Same CLI as train.py; uses PyTorch + CUDA (the RTX 5090) for scale. Install a
Blackwell-capable build first, e.g.:
    pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128

  python train_torch.py samples.bin --out w.bin [--init prev.bin]
                        [--epochs 8] [--batch 1024] [--lr 1e-3] [--vw 1.0]
"""
import argparse
import struct
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

H1, H2 = 128, 128
WN_MAGIC = 0x53574E31
SP_MAGIC = 0x53575350


def read_samples(path):
    with open(path, "rb") as f:
        magic, n, feat, pol, val = struct.unpack("<Iiiii", f.read(20))
        assert magic == SP_MAGIC
        Fa = np.frombuffer(f.read(4 * n * feat), np.float32).reshape(n, feat).copy()
        Pa = np.frombuffer(f.read(4 * n * pol), np.float32).reshape(n, pol).copy()
        Va = np.frombuffer(f.read(4 * n * val), np.float32).reshape(n, val).copy()
    return Fa, Pa, Va, feat, pol, val


class Net(nn.Module):
    def __init__(self, feat, pol, val):
        super().__init__()
        self.l1 = nn.Linear(feat, H1)
        self.l2 = nn.Linear(H1, H2)
        self.p = nn.Linear(H2, pol)
        self.v = nn.Linear(H2, val)

    def forward(self, x):
        h = torch.relu(self.l1(x))
        h = torch.relu(self.l2(h))
        return self.p(h), self.v(h)  # policy logits, value raw


def save_params(path, net, feat, pol, val):
    # Layout must match include/sw/net.hpp: W row-major [out,in], then bias.
    order = [net.l1, net.l2, net.p, net.v]
    with open(path, "wb") as f:
        f.write(struct.pack("<I", WN_MAGIC))
        f.write(struct.pack("<5i", feat, H1, H2, pol, val))
        for lin in order:
            f.write(np.ascontiguousarray(lin.weight.detach().cpu().numpy(), np.float32).tobytes())
            f.write(np.ascontiguousarray(lin.bias.detach().cpu().numpy(), np.float32).tobytes())


def load_into(net, path, feat, pol, val):
    order = [("l1", (H1, feat)), None, ("l2", (H2, H1)), None,
             ("p", (pol, H2)), None, ("v", (val, H2)), None]
    with open(path, "rb") as f:
        assert struct.unpack("<I", f.read(4))[0] == WN_MAGIC
        assert struct.unpack("<5i", f.read(20)) == (feat, H1, H2, pol, val)
        for name, shape in [x for x in order if x]:
            lin = getattr(net, name)
            w = np.frombuffer(f.read(4 * int(np.prod(shape))), np.float32).reshape(shape).copy()
            b = np.frombuffer(f.read(4 * shape[0]), np.float32).copy()
            lin.weight.data = torch.from_numpy(w)
            lin.bias.data = torch.from_numpy(b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("samples")
    ap.add_argument("--out", required=True)
    ap.add_argument("--init", default=None)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--vw", type=float, default=1.0)
    a = ap.parse_args()
    dev = "cuda" if torch.cuda.is_available() else "cpu"

    Fa, Pa, Va, feat, pol, val = read_samples(a.samples)
    print(f"samples: {Fa.shape[0]}  device={dev}")
    net = Net(feat, pol, val).to(dev)
    if a.init:
        load_into(net, a.init, feat, pol, val)
        net.to(dev)
    opt = torch.optim.Adam(net.parameters(), lr=a.lr)

    X = torch.from_numpy(Fa).to(dev)
    Pt = torch.from_numpy(Pa).to(dev)
    Vt = torch.from_numpy(Va).to(dev)
    n = X.shape[0]
    for ep in range(a.epochs):
        perm = torch.randperm(n, device=dev)
        pl = vl = 0.0
        nb = 0
        for s in range(0, n, a.batch):
            bi = perm[s:s + a.batch]
            logits, vraw = net(X[bi])
            ploss = -(Pt[bi] * F.log_softmax(logits, 1)).sum(1).mean()
            vloss = F.binary_cross_entropy_with_logits(vraw, Vt[bi])
            loss = ploss + a.vw * vloss
            opt.zero_grad()
            loss.backward()
            opt.step()
            pl += ploss.item(); vl += vloss.item(); nb += 1
        print(f"  epoch {ep+1}/{a.epochs}  policy_ce={pl/nb:.4f}  value_bce={vl/nb:.4f}")

    save_params(a.out, net, feat, pol, val)
    print(f"wrote weights -> {a.out}")


if __name__ == "__main__":
    main()
