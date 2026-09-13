// A small dense network for the learned evaluation: ReLU hidden layers, a
// linear output, hand-rolled matmuls (no ML dependency, same as policy.ts).
// Weights are trained in Python (scripts/senso-train/) and shipped as a
// generated TS module holding int8 weights with one scale per output row,
// base64-encoded, decoded once at load — a 30k-parameter net is ~40 KB of
// source instead of ~300 KB of float literals. `mlp.test.ts` pins the forward
// pass to a fixture the trainer exports from the same dequantised weights.

export interface MlpModel {
  /** Layer widths: [inputs, hidden…, outputs]. */
  sizes: readonly number[];
  /** weights[l] is sizes[l+1] × sizes[l], row-major (one row per output unit). */
  weights: readonly Float32Array[];
  biases: readonly Float32Array[];
}

/** Generated-module form: per layer, int8 weights (base64) + per-row scales + biases. */
export interface MlpQuantized {
  sizes: readonly number[];
  layers: readonly { w: string; scale: readonly number[]; b: readonly number[] }[];
}

/** Largest hidden width any shipped net uses — sizes the forward scratch. */
export const MLP_MAX_WIDTH = 256;

export function decodeMlp(q: MlpQuantized): MlpModel {
  if (q.layers.length !== q.sizes.length - 1) throw new Error("mlp: layer count mismatch");
  const weights: Float32Array[] = [];
  const biases: Float32Array[] = [];
  for (let l = 0; l < q.layers.length; l++) {
    const rows = q.sizes[l + 1];
    const cols = q.sizes[l];
    const layer = q.layers[l];
    const bytes = base64ToBytes(layer.w);
    if (bytes.length !== rows * cols)
      throw new Error(`mlp: layer ${l} has ${bytes.length} weights`);
    if (layer.scale.length !== rows || layer.b.length !== rows) {
      throw new Error(`mlp: layer ${l} scale/bias length`);
    }
    const w = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      const s = layer.scale[r];
      for (let c = 0; c < cols; c++) {
        // int8 two's complement
        const v = bytes[r * cols + c];
        w[r * cols + c] = (v > 127 ? v - 256 : v) * s;
      }
    }
    weights.push(w);
    biases.push(Float32Array.from(layer.b));
  }
  return { sizes: q.sizes, weights, biases };
}

/**
 * Forward pass. `input` holds `sizes[0]` floats, `out` receives `sizes[last]`;
 * `scratch` needs `2 * MLP_MAX_WIDTH` floats. ReLU between layers, linear last.
 */
export function mlpForward(
  model: MlpModel,
  input: Float32Array,
  out: Float32Array,
  scratch: Float32Array,
): void {
  const L = model.weights.length;
  let cur = input;
  let curLen = model.sizes[0];
  let a = scratch.subarray(0, MLP_MAX_WIDTH);
  let b = scratch.subarray(MLP_MAX_WIDTH, 2 * MLP_MAX_WIDTH);
  for (let l = 0; l < L; l++) {
    const rows = model.sizes[l + 1];
    const w = model.weights[l];
    const bias = model.biases[l];
    const last = l === L - 1;
    const dst = last ? out : a;
    for (let r = 0; r < rows; r++) {
      let z = bias[r];
      const base = r * curLen;
      for (let c = 0; c < curLen; c++) z += w[base + c] * cur[c];
      dst[r] = last || z > 0 ? z : 0;
    }
    cur = dst;
    curLen = rows;
    const t = a;
    a = b;
    b = t;
  }
}

function base64ToBytes(s: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
