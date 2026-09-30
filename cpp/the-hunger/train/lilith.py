"""Lilith's network: data loading, model, training, export.

  uv run --with torch --with numpy python cpp/the-hunger/train/lilith.py train \
      <shard dirs...> --out runs/<run>/ [--init prev.bin] [--epochs 4] [--val-frac 0.02]

Reads the shards `hg gen` / `hg selfplay` write (include/hg/samples.hpp), trains
the model in `Lilith` (identical computation to src/net.cpp) and writes
`weights.bin` (the C++ header + float32 tensors) and `report.json`.
"""
import argparse
import glob
import json
import os
import struct
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

FEATURE_VERSION = 1
MAX_PLAYERS = 6
G_DIM, O_DIM, SEAT_DIM = 704, 101, 762
FEATURE_DIM = G_DIM + O_DIM + MAX_PLAYERS * SEAT_DIM
ACTION_DIM = 595
H1, H2, H3, Q_DIM = 512, 256, 256, 64
V_PER_SEAT = 4
V_DIM = MAX_PLAYERS * V_PER_SEAT
NET_MAGIC = 0x4C494C31
SAMPLES_MAGIC = 0x31534748


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


def read_shard(path):
    with open(path, "rb") as f:
        buf = f.read()
    magic, ver, n, nf, na, naf = struct.unpack_from("<6I", buf, 0)
    assert magic == SAMPLES_MAGIC, path
    assert ver == FEATURE_VERSION, f"{path}: feature version {ver}"
    o = 24

    def take(dtype, count):
        nonlocal o
        a = np.frombuffer(buf, dtype=dtype, count=count, offset=o)
        o += a.nbytes
        return a

    d = {}
    d["players"] = take(np.uint8, n)
    d["featOff"] = take(np.uint32, n + 1)
    d["featIdx"] = take(np.uint16, nf)
    d["featVal"] = take(np.float16, nf)
    d["actOff"] = take(np.uint32, n + 1)
    d["actFeatOff"] = take(np.uint32, na + 1)
    d["actIdx"] = take(np.uint16, naf)
    d["actVal"] = take(np.float16, naf)
    d["policy"] = take(np.float16, na)
    d["value"] = take(np.float32, n * V_DIM).reshape(n, V_DIM)
    d["mask"] = take(np.uint8, n * MAX_PLAYERS).reshape(n, MAX_PLAYERS)
    assert o == len(buf), f"{path}: {len(buf) - o} trailing bytes"
    return d


def concat(shards):
    """Merge shards, rebasing the CSR offsets."""
    out = {}
    out["players"] = np.concatenate([s["players"] for s in shards])
    out["value"] = np.concatenate([s["value"] for s in shards])
    out["mask"] = np.concatenate([s["mask"] for s in shards])
    for off, keys in (("featOff", ("featIdx", "featVal")), ("actFeatOff", ("actIdx", "actVal"))):
        base, offs = 0, []
        for i, s in enumerate(shards):
            o = s[off].astype(np.int64)
            offs.append((o if i == 0 else o[1:]) + base)
            base += int(o[-1])
        out[off] = np.concatenate(offs)
        for k in keys:
            out[k] = np.concatenate([s[k] for s in shards])
    base, offs = 0, []
    for i, s in enumerate(shards):
        o = s["actOff"].astype(np.int64)
        offs.append((o if i == 0 else o[1:]) + base)
        base += int(o[-1])
    out["actOff"] = np.concatenate(offs)
    out["policy"] = np.concatenate([s["policy"] for s in shards])
    return out


def shard_files(dirs):
    files = sorted(f for d in dirs for f in glob.glob(os.path.join(d, "*.bin")))
    assert files, f"no shards in {dirs}"
    return files


def load(files):
    return concat([read_shard(f) for f in files])


def segments(off, rows):
    """Flat element indices of CSR rows `rows`, plus per-row lengths."""
    off = off.astype(np.int64, copy=False)
    rows = np.asarray(rows, dtype=np.int64)
    starts = off[rows]
    lens = off[rows + 1] - starts
    total = int(lens.sum())
    if total == 0:
        return np.zeros(0, np.int64), lens
    rep = np.repeat(starts - np.concatenate([np.zeros(1, np.int64), np.cumsum(lens)[:-1]]), lens)
    return rep + np.arange(total), lens


class Batch:
    def __init__(self, d, rows, dev):
        fi, flen = segments(d["featOff"], rows)
        self.x_idx = torch.from_numpy(d["featIdx"][fi].astype(np.int64)).to(dev)
        self.x_val = torch.from_numpy(d["featVal"][fi].astype(np.float32)).to(dev)
        self.x_off = torch.from_numpy(np.concatenate([[0], np.cumsum(flen)[:-1]]).astype(np.int64)).to(dev)
        ai, alen = segments(d["actOff"], rows)  # action ids
        self.n_act = torch.from_numpy(alen.astype(np.int64)).to(dev)
        self.act_sample = torch.repeat_interleave(torch.arange(len(rows), device=dev), self.n_act)
        afi, aflen = segments(d["actFeatOff"], ai)
        self.a_idx = torch.from_numpy(d["actIdx"][afi].astype(np.int64)).to(dev)
        self.a_val = torch.from_numpy(d["actVal"][afi].astype(np.float32)).to(dev)
        self.a_off = torch.from_numpy(np.concatenate([[0], np.cumsum(aflen)[:-1]]).astype(np.int64)).to(dev)
        self.policy = torch.from_numpy(d["policy"][ai].astype(np.float32)).to(dev)
        self.value = torch.from_numpy(d["value"][rows]).to(dev)
        self.mask = torch.from_numpy(d["mask"][rows].astype(np.float32)).to(dev)
        self.n = len(rows)


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class Lilith(nn.Module):
    def __init__(self):
        super().__init__()
        self.W1 = nn.EmbeddingBag(FEATURE_DIM, H1, mode="sum")
        self.b1 = nn.Parameter(torch.zeros(H1))
        self.l2 = nn.Linear(H1, H2)
        self.l3 = nn.Linear(H2, H3)
        self.v = nn.Linear(H3, V_DIM)
        self.q = nn.Linear(H3, Q_DIM)
        self.E = nn.EmbeddingBag(ACTION_DIM, Q_DIM, mode="sum")
        self.B = nn.EmbeddingBag(ACTION_DIM, 1, mode="sum")
        self.drop = nn.Dropout(0.1)  # training only; the exported net has none
        nn.init.normal_(self.W1.weight, std=0.02)
        nn.init.normal_(self.E.weight, std=0.05)
        nn.init.zeros_(self.B.weight)

    def trunk(self, b):
        h1 = self.drop(F.relu(self.W1(b.x_idx, b.x_off, per_sample_weights=b.x_val) + self.b1))
        h2 = F.relu(self.l2(h1))
        return self.drop(F.relu(self.l3(h2)) + h2)

    def forward(self, b):
        h = self.trunk(b)
        value = self.v(h)
        q = self.q(h)
        # logit(a) = Σ v·(q·E[f] + B[f]) = q·Σ v·E[f] + Σ v·B[f]
        e = self.E(b.a_idx, b.a_off, per_sample_weights=b.a_val)
        bias = self.B(b.a_idx, b.a_off, per_sample_weights=b.a_val).squeeze(1)
        logits = (q[b.act_sample] * e).sum(1) + bias
        return value, logits


def segment_log_softmax(logits, seg, n):
    mx = torch.full((n,), -1e30, device=logits.device).scatter_reduce(0, seg, logits, "amax")
    z = logits - mx[seg]
    lse = torch.zeros(n, device=logits.device).index_add_(0, seg, z.exp()).log()
    return z - lse[seg]


def losses(model, b):
    value, logits = model(b)
    v = value.view(b.n, MAX_PLAYERS, V_PER_SEAT)
    t = b.value.view(b.n, MAX_PLAYERS, V_PER_SEAT)
    m = b.mask
    win_logit = v[..., 0].masked_fill(m == 0, -1e9)
    win = -(t[..., 0] * F.log_softmax(win_logit, 1)).sum(1).mean()
    surv = (F.binary_cross_entropy_with_logits(v[..., 1], t[..., 1], reduction="none") * m).sum() / m.sum()
    score = ((v[..., 2] - t[..., 2]) ** 2 * m).sum() / m.sum()
    place = ((v[..., 3] - t[..., 3]) ** 2 * m).sum() / m.sum()
    logp = segment_log_softmax(logits, b.act_sample, b.n)
    pol = -(b.policy * logp).sum() / b.n
    # diagnostics
    with torch.no_grad():
        win_acc = (win_logit.argmax(1) == t[..., 0].argmax(1)).float().mean()
        # policy top-1: the target's argmax equals the model's argmax within each segment
        best = torch.full((b.n,), -1e30, device=logits.device).scatter_reduce(0, b.act_sample, logits, "amax")
        is_best = logits >= best[b.act_sample]
        tgt_best = torch.full((b.n,), -1e30, device=logits.device).scatter_reduce(0, b.act_sample, b.policy, "amax")
        hit = torch.zeros(b.n, device=logits.device).index_add_(
            0, b.act_sample, (is_best & (b.policy >= tgt_best[b.act_sample])).float())
        pol_acc = (hit > 0).float().mean()
        me_win = F.softmax(win_logit, 1)[:, 0]
    return {"win": win, "surv": surv, "score": score, "place": place, "policy": pol,
            "win_acc": win_acc, "pol_acc": pol_acc, "me_win_mean": me_win.mean()}


LOSS_W = {"win": 1.0, "surv": 0.5, "score": 2.0, "place": 1.0, "policy": 1.0}


# ---------------------------------------------------------------------------
# Export (src/net.cpp layout)
# ---------------------------------------------------------------------------


def export(model, path):
    s = model.state_dict()
    tensors = [
        s["W1.weight"], s["b1"], s["l2.weight"], s["l2.bias"], s["l3.weight"], s["l3.bias"],
        s["v.weight"], s["v.bias"], s["q.weight"], s["q.bias"], s["E.weight"], s["B.weight"].flatten(),
    ]
    with open(path, "wb") as f:
        f.write(struct.pack("<I8i", NET_MAGIC, FEATURE_VERSION, FEATURE_DIM, H1, H2, H3, V_DIM, Q_DIM, ACTION_DIM))
        for t in tensors:
            f.write(t.detach().cpu().float().contiguous().numpy().tobytes())


def load_weights(model, path):
    with open(path, "rb") as f:
        buf = f.read()
    hdr = struct.unpack_from("<I8i", buf, 0)
    assert hdr == (NET_MAGIC, FEATURE_VERSION, FEATURE_DIM, H1, H2, H3, V_DIM, Q_DIM, ACTION_DIM), hdr
    arr = np.frombuffer(buf, np.float32, offset=36)
    s = model.state_dict()
    names = ["W1.weight", "b1", "l2.weight", "l2.bias", "l3.weight", "l3.bias", "v.weight", "v.bias",
             "q.weight", "q.bias", "E.weight", "B.weight"]
    o = 0
    for k in names:
        n = s[k].numel()
        s[k].copy_(torch.from_numpy(arr[o:o + n].copy()).view_as(s[k]))
        o += n
    assert o == arr.size


# ---------------------------------------------------------------------------
# Train
# ---------------------------------------------------------------------------


def train(args):
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    t0 = time.time()
    # Validation holds out whole shards (whole games), so it never sees a game it trained on.
    files = shard_files(args.data)
    rng = np.random.default_rng(args.seed)
    order = rng.permutation(len(files))
    nval_files = max(1, int(round(len(files) * args.val_frac)))
    val_files = [files[i] for i in sorted(order[:nval_files])]
    train_files = [files[i] for i in sorted(order[nval_files:])]
    d = load(train_files + val_files)
    n = len(d["players"])
    nval = sum(len(read_shard(f)["players"]) for f in val_files)
    print(f"loaded {n} samples ({nval} held out, {len(val_files)} shards) in {time.time() - t0:.0f}s ({dev})",
          flush=True)
    val_rows, train_rows = np.arange(n - nval, n), np.arange(n - nval)
    model = Lilith().to(dev)
    if args.init:
        load_weights(model, args.init)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    steps = args.epochs * (len(train_rows) // args.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=max(1, steps), pct_start=0.05)
    os.makedirs(args.out, exist_ok=True)
    history = []

    def evaluate():
        model.eval()
        agg = {}
        with torch.no_grad():
            for i in range(0, len(val_rows), args.batch):
                b = Batch(d, val_rows[i:i + args.batch], dev)
                for k, v in losses(model, b).items():
                    agg[k] = agg.get(k, 0.0) + float(v) * b.n
        model.train()
        return {k: v / len(val_rows) for k, v in agg.items()}

    best_score = None
    base = evaluate()
    print("init val", {k: round(v, 4) for k, v in base.items()}, flush=True)
    step = 0
    for ep in range(args.epochs):
        rng.shuffle(train_rows)
        for i in range(0, len(train_rows) - args.batch + 1, args.batch):
            b = Batch(d, np.sort(train_rows[i:i + args.batch]), dev)
            L = losses(model, b)
            loss = sum(LOSS_W[k] * L[k] for k in LOSS_W)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            step += 1
            if step % 200 == 0:
                print(f"ep {ep} step {step}/{steps} loss {float(loss):.4f} "
                      f"win {float(L['win']):.3f} pol {float(L['policy']):.3f} "
                      f"acc {float(L['win_acc']):.3f}/{float(L['pol_acc']):.3f}", flush=True)
        v = evaluate()
        history.append({"epoch": ep, **v})
        print(f"epoch {ep} val", {k: round(x, 4) for k, x in v.items()}, flush=True)
        # Keep the epoch with the best held-out loss (the value heads overfit first).
        score = sum(LOSS_W[k] * v[k] for k in LOSS_W)
        if best_score is None or score < best_score:
            best_score = score
            export(model, os.path.join(args.out, "weights.bin"))
            print(f"  saved (held-out loss {score:.4f})", flush=True)
    report = {"samples": n, "val": nval, "init": base, "history": history, "args": vars(args),
              "seconds": time.time() - t0}
    with open(os.path.join(args.out, "report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print(f"wrote {args.out}/weights.bin ({time.time() - t0:.0f}s)")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("data", nargs="+")
    t.add_argument("--out", required=True)
    t.add_argument("--init")
    t.add_argument("--epochs", type=int, default=4)
    t.add_argument("--batch", type=int, default=2048)
    t.add_argument("--lr", type=float, default=1e-3)
    t.add_argument("--wd", type=float, default=1e-4)
    t.add_argument("--val-frac", type=float, default=0.05)
    t.add_argument("--seed", type=int, default=0)
    c = sub.add_parser("check")
    c.add_argument("weights")
    c.add_argument("shard")
    c.add_argument("--k", type=int, default=3)
    e = sub.add_parser("export-random")
    e.add_argument("out")
    args = p.parse_args()
    if args.cmd == "train":
        train(args)
    elif args.cmd == "check":
        model = Lilith()
        load_weights(model, args.weights)
        model.eval()
        d = read_shard(args.shard)
        with torch.no_grad():
            b = Batch(d, np.arange(args.k), "cpu")
            value, logits = model(b)
        o = 0
        for i in range(args.k):
            na = int(b.n_act[i])
            print(f"sample {i} value", " ".join(f"{x:.5f}" for x in value[i, :8].tolist()),
                  "logits", " ".join(f"{x:.5f}" for x in logits[o:o + min(na, 4)].tolist()))
            o += na
    else:
        torch.manual_seed(0)
        export(Lilith(), args.out)


if __name__ == "__main__":
    main()
