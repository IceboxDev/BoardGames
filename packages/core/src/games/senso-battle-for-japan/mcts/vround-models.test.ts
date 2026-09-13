import { describe, expect, it } from "vitest";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import type { GameState } from "../types";
import fixture from "./fixtures/vround-5p.fixture.json";
import { LeafValuer } from "./leaf-value";
import { MLP_MAX_WIDTH, mlpForward } from "./mlp";
import { VROUND_MODELS, vroundModelFor } from "./vround-models";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

describe("vround models", () => {
  it("the shipped 5p net reproduces the trainer's fixture outputs", () => {
    // The fixture was written from the dequantised weights of the same
    // export, so a decode or quantisation slip would show here.
    const model = VROUND_MODELS[5];
    expect(model.sizes[0]).toBe(fixture.inputs[0].length);
    const out = new Float32Array(1);
    const scratch = new Float32Array(2 * MLP_MAX_WIDTH);
    for (let i = 0; i < fixture.inputs.length; i++) {
      mlpForward(model, Float32Array.from(fixture.inputs[i]), out, scratch);
      expect(out[0]).toBeCloseTo(fixture.outputs[i][0], 4);
    }
  });

  it("tables without a net fall back to the plain tier table", () => {
    expect(vroundModelFor(4)).toBeNull();
    const state = createInitialState(3, [null, null, null], 3);
    let guard = 0;
    while (phaseOf(state) !== "game-over" && state.round < 2 && guard++ < 500) {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      applyAction(state, getLegalActions(state)[0]);
    }
    const tier = new LeafValuer(state, "tier");
    const vround = new LeafValuer(state, "vround");
    for (const tricks of [
      [3, 1, 2],
      [0, 0, 6],
      [2, 2, 2],
    ]) {
      expect(Array.from(vround.value(tricks))).toEqual(Array.from(tier.value(tricks)));
    }
  });

  it("at five seats the corrected leaf differs from the tier table and is finite", () => {
    const state = createInitialState(5, Array(5).fill(null), 8);
    let guard = 0;
    while (phaseOf(state) !== "game-over" && state.round < 4 && guard++ < 2000) {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      applyAction(state, getLegalActions(state)[0]);
    }
    const tier = new LeafValuer(state, "tier");
    const vround = new LeafValuer(state, "vround");
    let differs = 0;
    for (const tricks of [
      [3, 1, 2, 2, 1],
      [0, 5, 1, 1, 2],
      [7, 0, 1, 1, 0],
    ]) {
      const a = tier.value(tricks);
      const b = vround.value(tricks);
      for (let s = 0; s < 5; s++) {
        expect(Number.isFinite(b[s])).toBe(true);
        if (Math.abs(a[s] - b[s]) > 1e-6) differs++;
      }
    }
    expect(differs).toBeGreaterThan(0);
  });
});
