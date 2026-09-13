import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { NO_WEIGHTS } from "../ai-rewards";
import { tierTable } from "../ai-search";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { SQUARE_COUNT } from "../map";
import { getLegalActions } from "../rules";
import type { GameState } from "../types";
import { MLP_MAX_WIDTH, type MlpModel, mlpForward } from "./mlp";
import {
  createVroundScratch,
  type RoundView,
  roundViewFromState,
  tierIndex,
  VROUND_FEATURES,
  VROUND_SEATS,
  VROUND_TIERS,
  vroundCellCorrection,
  vroundCellFeatures,
  vroundPrepare,
} from "./vround-features";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

/** A 5p state a few rounds in (deterministic: first legal action every time). */
function midGame(players: number, rounds: number): GameState {
  const state = createInitialState(players, Array(players).fill(null), 21);
  let guard = 0;
  while (phaseOf(state) !== "game-over" && state.round <= rounds && guard++ < 3000) {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    applyAction(state, getLegalActions(state)[0]);
  }
  return state;
}

function tiersOf(state: GameState): Float32Array {
  const n = state.players.length;
  const tier = new Float32Array(VROUND_SEATS * VROUND_SEATS * VROUND_TIERS);
  for (let s = 0; s < n; s++) {
    const table = tierTable(state, s, NO_WEIGHTS);
    for (let p = 0; p < n; p++) {
      for (let t = 0; t < VROUND_TIERS; t++) tier[tierIndex(s, p, t)] = table[p][t];
    }
  }
  return tier;
}

describe("vround cell features", () => {
  it("are bounded, one-hot where declared, and sized as the constant says", () => {
    const state = midGame(5, 3);
    const view = roundViewFromState(state, tiersOf(state));
    const out = new Float32Array(VROUND_FEATURES);
    for (let s = 0; s < 5; s++) {
      for (let p = 0; p < 5; p++) {
        for (let t = 0; t < VROUND_TIERS; t++) {
          vroundCellFeatures(view, s, p, t, out);
          for (let i = 0; i < VROUND_FEATURES; i++) {
            expect(out[i]).toBeGreaterThanOrEqual(-1.5);
            expect(out[i]).toBeLessThanOrEqual(1.5);
          }
          // Every square has exactly one owner class.
          for (let sq = 0; sq < SQUARE_COUNT; sq++) {
            let ones = 0;
            for (let c = 0; c < 7; c++) ones += out[sq * 7 + c];
            expect(ones).toBe(1);
          }
        }
      }
    }
  });

  it("is perspective-relative: rotating the seats rotates the features", () => {
    // Build a view, then the same board with seats relabelled by +1; the
    // features of (s, p, t) on the original equal those of (s+1, p+1, t) on
    // the rotated view — one net serves every chair.
    const state = midGame(5, 4);
    const view = roundViewFromState(state, tiersOf(state));
    const n = view.n;
    const rot = (seat: number) => (seat + 1) % n;
    const rotated: RoundView = {
      ...view,
      emperorSeat: view.emperorSeat < 0 ? -1 : rot(view.emperorSeat),
      firstPlayer: rot(view.firstPlayer),
      squares: view.squares.map((o) => (o < 0 ? o : rot(o))),
      scores: new Float32Array(VROUND_SEATS),
      cubes: new Float32Array(VROUND_SEATS),
      supply: new Float32Array(VROUND_SEATS),
      tier: new Float32Array(view.tier.length),
    };
    for (let seat = 0; seat < n; seat++) {
      rotated.scores[rot(seat)] = view.scores[seat];
      rotated.cubes[rot(seat)] = view.cubes[seat];
      rotated.supply[rot(seat)] = view.supply[seat];
      for (let p = 0; p < n; p++) {
        for (let t = 0; t < VROUND_TIERS; t++) {
          rotated.tier[tierIndex(rot(seat), rot(p), t)] = view.tier[tierIndex(seat, p, t)];
        }
      }
    }
    const a = new Float32Array(VROUND_FEATURES);
    const b = new Float32Array(VROUND_FEATURES);
    for (let s = 0; s < n; s++) {
      for (let p = 0; p < n; p++) {
        for (let t = 0; t < VROUND_TIERS; t++) {
          vroundCellFeatures(view, s, p, t, a);
          vroundCellFeatures(rotated, rot(s), rot(p), t, b);
          expect(Array.from(b)).toEqual(Array.from(a));
        }
      }
    }
  });

  it("the split first layer (board share precomputed per perspective) equals the plain forward pass", () => {
    const rng = createRng(5);
    const sizes = [VROUND_FEATURES, 8, 4, 1];
    const model: MlpModel = {
      sizes,
      weights: sizes
        .slice(1)
        .map((rows, l) => Float32Array.from({ length: rows * sizes[l] }, () => rng() - 0.5)),
      biases: sizes.slice(1).map((rows) => Float32Array.from({ length: rows }, () => rng() - 0.5)),
    };
    const state = midGame(5, 5);
    const view = roundViewFromState(state, tiersOf(state));
    const sc = createVroundScratch(model);
    const x = new Float32Array(VROUND_FEATURES);
    const out = new Float32Array(1);
    const scratch = new Float32Array(2 * MLP_MAX_WIDTH);
    for (let s = 0; s < 5; s++) {
      vroundPrepare(model, view, s, sc);
      for (let p = 0; p < 5; p++) {
        for (let t = 0; t < VROUND_TIERS; t++) {
          vroundCellFeatures(view, s, p, t, x);
          mlpForward(model, x, out, scratch);
          expect(vroundCellCorrection(model, view, s, p, t, sc)).toBeCloseTo(out[0], 5);
        }
      }
    }
  });

  it("carries the greedy cell so the net can learn a residual", () => {
    const state = midGame(3, 2);
    const view = roundViewFromState(state, tiersOf(state));
    const out = new Float32Array(VROUND_FEATURES);
    vroundCellFeatures(view, 1, 2, 3, out);
    const k = SQUARE_COUNT * 7 + VROUND_SEATS * 6 + VROUND_TIERS;
    expect(out[k]).toBeCloseTo(view.tier[tierIndex(1, 2, 3)] / 10, 6);
    expect(out[k + 1]).toBeCloseTo(view.tier[tierIndex(2, 2, 3)] / 10, 6);
    // Unseated relative seats are zeroed at a 3-player table.
    const seatBase = SQUARE_COUNT * 7;
    expect(out[seatBase + 3 * 6 + 4]).toBe(0);
    expect(out[seatBase + 4 * 6 + 4]).toBe(0);
  });
});
