import { describe, expect, it } from "vitest";
import fixture from "./fixtures/mlp-fixture.json";
import { decodeMlp, MLP_MAX_WIDTH, type MlpQuantized, mlpForward } from "./mlp";

// The fixture is written by scripts/senso-train/mlp_np.py from the DEQUANTISED
// weights, so the TS forward pass must reproduce it to float precision — the
// train/serve boundary for every value net.

describe("mlp", () => {
  const model = decodeMlp(fixture.model as MlpQuantized);

  it("decodes int8 rows with their scales into the declared shapes", () => {
    expect(model.sizes).toEqual([7, 9, 5, 3]);
    expect(model.weights.map((w) => w.length)).toEqual([63, 45, 15]);
    expect(model.biases.map((b) => b.length)).toEqual([9, 5, 3]);
  });

  it("reproduces the trainer's outputs on the fixture inputs", () => {
    const out = new Float32Array(3);
    const scratch = new Float32Array(2 * MLP_MAX_WIDTH);
    for (let i = 0; i < fixture.inputs.length; i++) {
      mlpForward(model, Float32Array.from(fixture.inputs[i]), out, scratch);
      for (let k = 0; k < 3; k++) expect(out[k]).toBeCloseTo(fixture.outputs[i][k], 4);
    }
  });

  it("rejects a module whose layers do not match its sizes", () => {
    const bad = { ...fixture.model, sizes: [7, 9, 3] } as MlpQuantized;
    expect(() => decodeMlp(bad)).toThrow();
  });
});
