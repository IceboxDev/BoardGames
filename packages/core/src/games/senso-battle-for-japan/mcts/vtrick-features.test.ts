import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { voidsOf } from "../ai-search";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import { CLANS, type GameState } from "../types";
import { buildRoot, fastFromState, N_CARDS, OUT, PLAYED } from "./fast-round";
import { LeafValuer } from "./leaf-value";
import {
  tierIndexOf,
  tierProbabilities,
  VTRICK_FEATURES,
  VTRICK_SEATS,
  VTRICK_TIERS,
  vtrickFeatures,
} from "./vtrick-features";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

function midRound(players: number, seed: number, plies: number): GameState {
  const state = createInitialState(players, Array(players).fill(null), seed);
  const rng = createRng(seed);
  let played = 0;
  while (played < plies) {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const legal = getLegalActions(state);
    applyAction(state, legal[Math.floor(rng() * legal.length)]);
    played++;
  }
  if (phaseOf(state) === "trick-settle") settleTrick(state);
  return state;
}

describe("expected-tier features", () => {
  it("one-hot the owner of every card and stay bounded", () => {
    for (const [players, seed, plies] of [
      [5, 8, 23],
      [3, 4, 7],
      [2, 2, 5],
    ] as const) {
      const state = midRound(players, seed, plies);
      const f = fastFromState(state, -1);
      const root = buildRoot(state, state.turn, voidsOf(state));
      const out = new Float32Array(VTRICK_FEATURES);
      vtrickFeatures(f, root.voidMask, state.round, out);
      for (let c = 0; c < N_CARDS; c++) {
        let ones = 0;
        for (let k = 0; k < 7; k++) ones += out[c * 7 + k];
        expect(ones).toBe(1);
        const o = f.owner[c];
        const cls = o === PLAYED ? 5 : o === OUT ? 6 : (o - f.turn + players) % players;
        expect(out[c * 7 + cls]).toBe(1);
      }
      for (let i = 0; i < VTRICK_FEATURES; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is relative to the seat to move: relabelling the seats permutes nothing but the labels", () => {
    const state = midRound(5, 8, 23);
    const f = fastFromState(state, -1);
    const root = buildRoot(state, state.turn, voidsOf(state));
    const a = new Float32Array(VTRICK_FEATURES);
    vtrickFeatures(f, root.voidMask, state.round, a);
    // Rotate every seat by +1 in the fast state and the void mask.
    const n = f.n;
    const g = fastFromState(state, -1);
    for (let c = 0; c < N_CARDS; c++) if (g.owner[c] >= 0) g.owner[c] = (g.owner[c] + 1) % n;
    for (let s = 0; s < n; s++) {
      g.tricksWon[(s + 1) % n] = f.tricksWon[s];
      g.handSize[(s + 1) % n] = f.handSize[s];
    }
    g.leader = (f.leader + 1) % n;
    g.turn = (f.turn + 1) % n;
    const voids = new Uint8Array(n);
    for (let s = 0; s < n; s++) voids[(s + 1) % n] = root.voidMask[s];
    const b = new Float32Array(VTRICK_FEATURES);
    vtrickFeatures(g, voids, state.round, b);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it("maps trick counts to tier indices as the rules do", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 13].map(tierIndexOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("softmaxes logits into absolute-seat tier distributions and feeds the expected leaf", () => {
    const state = midRound(5, 8, 23);
    const f = fastFromState(state, -1);
    const logits = new Float32Array(25);
    // Relative seat 0 (= f.turn) certain of tier index 2; every other seat uniform.
    logits[2] = 20;
    const probs = new Float32Array(25);
    tierProbabilities(logits, f, probs);
    for (let seat = 0; seat < 5; seat++) {
      let sum = 0;
      for (let t = 0; t < VTRICK_TIERS; t++) sum += probs[seat * VTRICK_TIERS + t];
      expect(sum).toBeCloseTo(1, 6);
    }
    expect(probs[f.turn * VTRICK_TIERS + 2]).toBeCloseTo(1, 6);
    const leaf = new LeafValuer(state, "tier");
    const v = leaf.expected(probs, f.tricksWon);
    expect(v.length).toBe(VTRICK_SEATS);
    for (let s = 0; s < 5; s++) expect(Number.isFinite(v[s])).toBe(true);
    // A certain tier vector reproduces the memoised table leaf exactly.
    const certain = new Float32Array(25);
    const tricks = [3, 1, 2, 2, 2];
    tricks.forEach((t, seat) => {
      certain[seat * VTRICK_TIERS + tierIndexOf(t)] = 1;
    });
    const exact = leaf.value(tricks);
    const expected = leaf.expected(certain, tricks);
    for (let s = 0; s < 5; s++) expect(expected[s]).toBeCloseTo(exact[s], 9);
    expect(CLANS.length).toBe(4);
  });
});
