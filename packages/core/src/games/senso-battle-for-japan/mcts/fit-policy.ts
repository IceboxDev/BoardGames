// Fits the learned playout policy (softmax over legal cards; a linear score or
// a one-hidden-layer ReLU net over per-card features) on collect-policy.ts
// output and writes policy-weights.ts.
//   tsx .../fit-policy.ts <files...> [--hidden 16] [--epochs 40] [--l2 1e-4] [--out policy-weights.ts]
import { readFileSync, writeFileSync } from "node:fs";
import { FEATURES } from "./policy";

interface Row {
  k: number;
  y: number;
  x: number[];
}

const files: string[] = [];
let epochs = 40;
let l2 = 1e-4;
let hidden = 0;
let out = "src/games/senso-battle-for-japan/mcts/policy-weights.ts";
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--epochs") epochs = Number(argv[++i]);
  else if (argv[i] === "--l2") l2 = Number(argv[++i]);
  else if (argv[i] === "--hidden") hidden = Number(argv[++i]);
  else if (argv[i] === "--out") out = argv[++i];
  else files.push(argv[i]);
}

const rows: Row[] = [];
for (const file of files) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    rows.push(JSON.parse(line) as Row);
  }
}
const heldOut = rows.filter((_, i) => i % 10 === 0);
const train = rows.filter((_, i) => i % 10 !== 0);
console.log(
  `${rows.length} rows (${train.length} train / ${heldOut.length} held out), ${FEATURES} features, hidden ${hidden}`,
);

// Parameters: w1 [H×F], b1 [H], w2 [H or F], b2.
const F = FEATURES;
const H = hidden;
const nW1 = H * F;
const nW2 = H > 0 ? H : F;
const P = nW1 + H + nW2 + 1;
const theta = new Float64Array(P);
const grad = new Float64Array(P);
const m = new Float64Array(P);
const v = new Float64Array(P);
const seedRng = (() => {
  let s = 12345;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
})();
for (let i = 0; i < nW1; i++) theta[i] = (seedRng() - 0.5) * Math.sqrt(6 / (F + H));
for (let i = 0; i < nW2; i++)
  theta[nW1 + H + i] = H > 0 ? (seedRng() - 0.5) * Math.sqrt(6 / (H + 1)) : 0;
const W1 = 0;
const B1 = nW1;
const W2 = nW1 + H;
const B2 = nW1 + H + nW2;

const hid = new Float64Array(13 * Math.max(H, 1));
const scores = new Float64Array(13);
const probs = new Float64Array(13);

function forward(row: Row, t: Float64Array): void {
  for (let i = 0; i < row.k; i++) {
    const base = i * F;
    let sc = t[B2];
    if (H === 0) {
      for (let k = 0; k < F; k++) sc += t[W2 + k] * row.x[base + k];
    } else {
      for (let j = 0; j < H; j++) {
        let z = t[B1 + j];
        const rowW = W1 + j * F;
        for (let k = 0; k < F; k++) z += t[rowW + k] * row.x[base + k];
        const a = z > 0 ? z : 0;
        hid[i * H + j] = a;
        sc += t[W2 + j] * a;
      }
    }
    scores[i] = sc;
  }
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < row.k; i++) if (scores[i] > max) max = scores[i];
  let sum = 0;
  for (let i = 0; i < row.k; i++) {
    probs[i] = Math.exp(scores[i] - max);
    sum += probs[i];
  }
  for (let i = 0; i < row.k; i++) probs[i] /= sum;
}

function backward(row: Row, t: Float64Array): void {
  for (let i = 0; i < row.k; i++) {
    const ds = probs[i] - (i === row.y ? 1 : 0);
    if (ds === 0) continue;
    const base = i * F;
    grad[B2] += ds;
    if (H === 0) {
      for (let k = 0; k < F; k++) grad[W2 + k] += ds * row.x[base + k];
      continue;
    }
    for (let j = 0; j < H; j++) {
      const a = hid[i * H + j];
      grad[W2 + j] += ds * a;
      if (a <= 0) continue;
      const dz = ds * t[W2 + j];
      grad[B1 + j] += dz;
      const rowW = W1 + j * F;
      for (let k = 0; k < F; k++) grad[rowW + k] += dz * row.x[base + k];
    }
  }
}

function accuracy(
  set: Row[],
  t: Float64Array,
): { top1: number; nll: number; lead: number; leadN: number } {
  let hits = 0;
  let nll = 0;
  let lead = 0;
  let leadN = 0;
  for (const row of set) {
    forward(row, t);
    let best = 0;
    for (let i = 1; i < row.k; i++) if (probs[i] > probs[best]) best = i;
    const hit = best === row.y ? 1 : 0;
    hits += hit;
    nll -= Math.log(Math.max(probs[row.y], 1e-12));
    if (row.x[15] === 1 && row.k >= 4) {
      lead += hit;
      leadN++;
    }
  }
  return { top1: hits / set.length, nll: nll / set.length, lead: lead / Math.max(leadN, 1), leadN };
}

const BATCH = 64;
const lr = H > 0 ? 0.003 : 0.02;
let step = 0;
for (let epoch = 0; epoch < epochs; epoch++) {
  for (let i = train.length - 1; i > 0; i--) {
    const j = (Math.imul(i + epoch * 7919, 0x9e3779b1) >>> 0) % (i + 1);
    [train[i], train[j]] = [train[j], train[i]];
  }
  for (let b = 0; b < train.length; b += BATCH) {
    grad.fill(0);
    const end = Math.min(b + BATCH, train.length);
    for (let r = b; r < end; r++) {
      forward(train[r], theta);
      backward(train[r], theta);
    }
    const scale = 1 / (end - b);
    step++;
    for (let i = 0; i < P; i++) {
      const g = grad[i] * scale + l2 * theta[i];
      m[i] = 0.9 * m[i] + 0.1 * g;
      v[i] = 0.999 * v[i] + 0.001 * g * g;
      const mh = m[i] / (1 - 0.9 ** step);
      const vh = v[i] / (1 - 0.999 ** step);
      theta[i] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
    }
  }
  if (epoch % 5 === 4 || epoch === epochs - 1) {
    const tr = accuracy(train, theta);
    const ho = accuracy(heldOut, theta);
    console.log(
      `epoch ${epoch + 1}: train top1 ${(tr.top1 * 100).toFixed(1)}% nll ${tr.nll.toFixed(3)} · held-out top1 ${(ho.top1 * 100).toFixed(1)}% nll ${ho.nll.toFixed(3)} · held-out leads(k≥4) ${(ho.lead * 100).toFixed(1)}% (n=${ho.leadN})`,
    );
  }
}
const ho = accuracy(heldOut, theta);
const fmt = (arr: ArrayLike<number>) => Array.from(arr, (x) => x.toFixed(5)).join(", ");
const body = `// Generated by fit-policy.ts on ${new Date().toISOString().slice(0, 10)} from ${rows.length} decisions
// (hidden ${H}; held-out top-1 ${(ho.top1 * 100).toFixed(1)}%, leads with 4+ options ${(ho.lead * 100).toFixed(1)}%). Do not edit by hand.
import type { PolicyModel } from "./policy";

export const POLICY_MODEL: PolicyModel = {
  hidden: ${H},
  w1: Float32Array.from([${fmt(theta.subarray(W1, W1 + nW1))}]),
  b1: Float32Array.from([${fmt(theta.subarray(B1, B1 + H))}]),
  w2: Float32Array.from([${fmt(theta.subarray(W2, W2 + nW2))}]),
  b2: ${theta[B2].toFixed(5)},
};
`;
writeFileSync(out, body);
console.log(`wrote ${out}`);
