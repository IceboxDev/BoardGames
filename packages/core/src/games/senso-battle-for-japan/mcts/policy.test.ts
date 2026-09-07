import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import type { GameState } from "../types";
import { fastFromState, legalInto } from "./fast-round";
import { FEATURES, learnedPickPlay, MAX_HIDDEN, policyFeatures } from "./policy";
import { POLICY_MODEL } from "./policy-weights";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

describe("learned playout policy", () => {
  it("has a consistently shaped model", () => {
    const H = POLICY_MODEL.hidden;
    expect(H).toBeLessThanOrEqual(MAX_HIDDEN);
    expect(POLICY_MODEL.w1.length).toBe(H * FEATURES);
    expect(POLICY_MODEL.b1.length).toBe(H);
    expect(POLICY_MODEL.w2.length).toBe(H > 0 ? H : FEATURES);
  });

  it("produces bounded features and legal picks from the public view at 2/3/5 players", () => {
    for (const players of [2, 3, 5]) {
      const state = createInitialState(players, Array(players).fill(null), 3 + players);
      const rng = createRng(players);
      const buf = new Int8Array(13);
      const feats = new Float32Array(13 * FEATURES);
      const scratch = new Float32Array(13 * FEATURES);
      const scores = new Float32Array(13);
      const hidden = new Float32Array(MAX_HIDDEN);
      const voidMask = new Uint8Array(players);
      let decisions = 0;
      while (phaseOf(state) === "trick" || phaseOf(state) === "trick-settle") {
        if (phaseOf(state) === "trick-settle") {
          settleTrick(state);
          continue;
        }
        const seat = state.turn;
        const f = fastFromState(state, seat);
        const count = legalInto(f, seat, buf);
        policyFeatures(f, seat, buf, count, voidMask, feats);
        for (let i = 0; i < count * FEATURES; i++) {
          expect(feats[i]).toBeGreaterThanOrEqual(0);
          expect(feats[i]).toBeLessThanOrEqual(1);
        }
        const pick = learnedPickPlay(
          f,
          seat,
          buf,
          count,
          voidMask,
          POLICY_MODEL,
          scratch,
          scores,
          hidden,
        );
        expect(Array.from(buf.subarray(0, count))).toContain(pick);
        decisions++;
        const legal = getLegalActions(state);
        applyAction(state, legal[Math.floor(rng() * legal.length)]);
      }
      expect(decisions).toBeGreaterThan(10);
    }
  });
});
