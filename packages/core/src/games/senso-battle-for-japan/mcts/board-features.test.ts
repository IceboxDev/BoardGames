import { describe, expect, it } from "vitest";
import { createInitialState } from "../game-engine";
import { BOARD_FEATURES, boardFeatures } from "./board-features";
import { EVAL_WEIGHTS } from "./eval-weights";
import { predictFinalGap } from "./leaf-value";

describe("board features", () => {
  it("has one weight per feature and finite, bounded values for every seat", () => {
    expect(EVAL_WEIGHTS.length).toBe(BOARD_FEATURES);
    for (const players of [2, 3, 5]) {
      const state = createInitialState(players, Array(players).fill(null), 1);
      const x = new Float64Array(BOARD_FEATURES);
      for (let seat = 0; seat < players; seat++) {
        boardFeatures(state, seat, x);
        for (const v of x) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThanOrEqual(2);
        }
        expect(x[BOARD_FEATURES - 1]).toBe(1);
        expect(Number.isFinite(predictFinalGap(state, seat))).toBe(true);
      }
    }
  });
});
