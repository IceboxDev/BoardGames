"""Train The Hunger's value net on shards from search/gen-value.ts.

  uv run --with torch --with numpy python scripts/hunger-train/train_value.py \
      scratch/hunger-value/gen0 --out scratch/hunger-value/v0 [--epochs 8]

Heads (sigmoid): utility, win, placement, margin, survived. Exports
weights.json (float32 lists) for search/weights codegen, plus a report.
"""
import argparse, glob, json, os, time
import numpy as np
import torch
import torch.nn as nn

p = argparse.ArgumentParser()
p.add_argument("data", nargs="+")
p.add_argument("--out", required=True)
p.add_argument("--epochs", type=int, default=8)
p.add_argument("--hidden", type=int, nargs="+", default=[256, 128])
p.add_argument("--batch", type=int, default=4096)
p.add_argument("--lr", type=float, default=2e-3)
args = p.parse_args()

metas = [json.load(open(os.path.join(d, "meta.json"))) for d in args.data]
F = metas[0]["features"]
assert all(m["features"] == F and m["featureVersion"] == metas[0]["featureVersion"] for m in metas)
dt = np.dtype([("x", "<f2", (F,)), ("y", "<f4", (6,))])
parts = [np.fromfile(f, dtype=dt) for d in args.data for f in sorted(glob.glob(os.path.join(d, "shard-*.bin")))]
a = np.concatenate(parts)
X = torch.from_numpy(a["x"].astype(np.float32))
Y = torch.from_numpy(a["y"][:, :5].copy())
N = len(X)
rng = np.random.default_rng(0)
perm = rng.permutation(N)
nval = min(100_000, N // 20)
# Hold out whole rows at random (rows of one game correlate; fine for a first read).
val, tr = perm[:nval], perm[nval:]
dev = "cuda"
Xd, Yd = X.to(dev), Y.to(dev)

layers, w = [], F
for h in args.hidden:
    layers += [nn.Linear(w, h), nn.ReLU()]
    w = h
layers += [nn.Linear(w, 5)]
net = nn.Sequential(*layers).to(dev)
opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=1e-4)
steps = args.epochs * (len(tr) // args.batch)
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps)
bce = nn.BCEWithLogitsLoss(reduction="none")
# The utility head is what search reads; the rest are auxiliary.
head_w = torch.tensor([2.0, 1.0, 0.5, 0.5, 0.5], device=dev)
tr_t = torch.from_numpy(tr).to(dev)
val_t = torch.from_numpy(val).to(dev)

def evaluate():
    net.eval()
    with torch.no_grad():
        out = torch.sigmoid(net(Xd[val_t]))
        y = Yd[val_t]
        mse = ((out - y) ** 2).mean(0).tolist()
        # Baseline: predicting the mean.
        base = ((y - y.mean(0)) ** 2).mean(0).tolist()
    net.train()
    return mse, base

t0 = time.time()
for ep in range(args.epochs):
    idx = tr_t[torch.randperm(len(tr_t), device=dev)]
    tot = 0.0
    for b in range(len(tr) // args.batch):
        j = idx[b * args.batch:(b + 1) * args.batch]
        loss = (bce(net(Xd[j]), Yd[j]) * head_w).mean()
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        tot += loss.item()
    mse, base = evaluate()
    r2 = [1 - m / b for m, b in zip(mse, base)]
    print(f"epoch {ep+1} loss {tot/(len(tr)//args.batch):.4f} val R2 util {r2[0]:.3f} win {r2[1]:.3f} place {r2[2]:.3f} margin {r2[3]:.3f} surv {r2[4]:.3f}  {time.time()-t0:.0f}s", flush=True)

os.makedirs(args.out, exist_ok=True)
lin = [m for m in net if isinstance(m, nn.Linear)]
weights = {
    "featureVersion": metas[0]["featureVersion"],
    "features": F,
    "heads": ["utility", "win", "placement", "margin", "survived"],
    "layers": [{"w": l.weight.detach().cpu().numpy().tolist(), "b": l.bias.detach().cpu().numpy().tolist()} for l in lin],
}
json.dump(weights, open(os.path.join(args.out, "weights.json"), "w"))
# Fixture: a few inputs and outputs so the TS forward pass can be checked.
with torch.no_grad():
    fx = Xd[val_t[:4]]
    fo = torch.sigmoid(net(fx))
json.dump({"inputs": fx.cpu().numpy().tolist(), "outputs": fo.cpu().numpy().tolist()}, open(os.path.join(args.out, "fixture.json"), "w"))
json.dump({"rows": N, "val": nval, "valR2": dict(zip(["utility", "win", "placement", "margin", "survived"], r2)), "args": vars(args)}, open(os.path.join(args.out, "report.json"), "w"), indent=2)
print("saved", args.out)
