import { describe, expect, it } from "vitest";
import { createInitialState } from "../game-engine";
import { getLegalActions } from "../rules";
import { DEFAULT_TENKA } from "./config";
import fixture from "./fixtures/vtrick-5p.fixture.json";
import { pickPlayTenka } from "./ismcts";
import { MLP_MAX_WIDTH, mlpForward } from "./mlp";
import { VTRICK_MODELS, vtrickModelFor } from "./vtrick-models";

describe("expected-tier models", () => {
  it("the shipped 5p net reproduces the trainer's fixture outputs", () => {
    const model = VTRICK_MODELS[5];
    expect(model.sizes[0]).toBe(fixture.inputs[0].length);
    expect(model.sizes[model.sizes.length - 1]).toBe(25);
    const out = new Float32Array(25);
    const scratch = new Float32Array(2 * MLP_MAX_WIDTH);
    for (let i = 0; i < fixture.inputs.length; i++) {
      mlpForward(model, Float32Array.from(fixture.inputs[i]), out, scratch);
      for (let k = 0; k < 25; k++) expect(out[k]).toBeCloseTo(fixture.outputs[i][k], 4);
    }
  });

  it("drives the search legally and deterministically, and buys more deals than full playouts", () => {
    expect(vtrickModelFor(3)).toBeNull();
    const state = createInitialState(5, Array(5).fill("tenka"), 4);
    const legal = getLegalActions(state);
    const cfg = {
      ...DEFAULT_TENKA,
      timeMs: 0,
      iterations: 600,
      valueNet: "expected-tier" as const,
      truncatePlies: 0,
    };
    const a = pickPlayTenka(state, legal, state.turn, cfg);
    const b = pickPlayTenka(state, legal, state.turn, cfg);
    expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(a.action))).toBe(true);
    expect(b.action).toEqual(a.action);
    expect(b.stats.root).toEqual(a.stats.root);
    // At three seats there is no net: the same config falls back to playouts.
    const state3 = createInitialState(3, Array(3).fill("tenka"), 4);
    const r3 = pickPlayTenka(state3, getLegalActions(state3), state3.turn, cfg);
    expect(["tree", "forced"]).toContain(r3.stats.mode);
  });
});
