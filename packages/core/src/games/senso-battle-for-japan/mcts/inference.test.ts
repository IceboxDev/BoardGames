import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { voidsOf } from "../ai-search";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import type { GameState } from "../types";
import {
  buildRoot,
  cloneFast,
  fastFromState,
  N_CARDS,
  redeterminize,
  resetFrom,
} from "./fast-round";
import { roundHistory, worldLogWeight } from "./inference";
import { FEATURES, MAX_HIDDEN } from "./policy";
import { POLICY_MODEL } from "./policy-weights";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

describe("likelihood-weighted deals", () => {
  it("replays the round's history onto a sampled deal and scores it", () => {
    const state = createInitialState(3, [null, null, null], 11);
    const rng = createRng(11);
    let plies = 0;
    while (plies < 10) {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const legal = getLegalActions(state);
      applyAction(state, legal[Math.floor(rng() * legal.length)]);
      plies++;
    }
    if (phaseOf(state) === "trick-settle") settleTrick(state);
    const me = state.turn;
    const hist = roundHistory(state);
    expect(hist.count).toBe(10);
    const root = buildRoot(state, me, voidsOf(state));
    const f = cloneFast(root.base);
    resetFrom(f, root.base);
    redeterminize(f, root, rng, new Int8Array(N_CARDS));
    const h = cloneFast(root.base);
    const logw = worldLogWeight(
      f,
      me,
      hist,
      root.voidMask,
      POLICY_MODEL,
      1,
      0.1,
      h,
      new Int8Array(13),
      new Float32Array(13 * FEATURES),
      new Float32Array(13),
      new Float32Array(MAX_HIDDEN),
    );
    expect(Number.isFinite(logw)).toBe(true);
    expect(logw).toBeLessThanOrEqual(0);
    // After the replay the scratch world matches the sampled world exactly.
    expect([...h.owner]).toEqual([...f.owner]);
    expect([...h.handSize]).toEqual([...f.handSize]);
    expect([...h.tricksWon]).toEqual([...f.tricksWon]);
    expect(h.leader).toBe(f.leader);
    expect(h.turn).toBe(f.turn);
    expect(h.tableLen).toBe(f.tableLen);
  });

  it("is zero before any card has been played", () => {
    const state = createInitialState(2, [null, null], 5);
    const hist = roundHistory(state);
    const f = fastFromState(state, 0);
    expect(
      worldLogWeight(
        f,
        0,
        hist,
        new Uint8Array(2),
        POLICY_MODEL,
        1,
        0.1,
        cloneFast(f),
        new Int8Array(13),
        new Float32Array(13 * FEATURES),
        new Float32Array(13),
        new Float32Array(MAX_HIDDEN),
      ),
    ).toBe(0);
  });
});
