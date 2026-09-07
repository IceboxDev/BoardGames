import { describe, expect, it } from "vitest";
import { lightClone } from "../ai-rewards";
import { applyActionTrusted, settleTrick } from "../game-engine";
import { getLegalActions } from "../rules";
import { midRound } from "../test-helpers";
import type { GameState } from "../types";
import { clearTrickMemo, solveExact, solveTricks2p, trickMemoStats } from "./endgame-solver";
import { applyFast, cloneFast, fastFromState, legalInto } from "./fast-round";
import { LeafValuer } from "./leaf-value";

/** Engine-driven brute-force max^n: each seat maximises its own leaf component. */
function bruteForce(state: GameState, leaf: LeafValuer): Float64Array {
  const sim = lightClone(state);
  if (sim.phase === "trick-settle") settleTrick(sim);
  if (sim.phase !== "trick") return leaf.value(sim.players.map((p) => p.tricksWon));
  const seat = sim.turn;
  let best: Float64Array | null = null;
  for (const action of getLegalActions(sim)) {
    const next = lightClone(sim);
    applyActionTrusted(next, action);
    const v = bruteForce(next, leaf);
    if (best === null || v[seat] > best[seat]) best = v;
  }
  return best as Float64Array;
}

describe("solveExact", () => {
  it.each([
    [2, 6],
    [2, 8],
    [3, 6],
    [5, 5],
  ])("matches an engine brute force for %ip with %i plies left", (players, plies) => {
    for (let seed = 1; seed <= 4; seed++) {
      const state = midRound(players, seed * 13 + players, plies);
      const leaf = new LeafValuer(state, "exact");
      const expected = bruteForce(state, leaf);
      const f = fastFromState(state, -1);
      const got = solveExact(f, leaf, new Map());
      // The seat to move gets the same reward whatever the tie-break; later
      // seats may break exact ties differently, which moves the trick tie-break
      // term (0.001 per trick) but never a reward. In 2p the trick minimax can
      // also differ from the leaf max^n by the greedy reward's kindBias jitter
      // (≤ 0.03 VP).
      expect(Math.abs(got[state.turn] - expected[state.turn])).toBeLessThan(0.05);
      expect(f.undoLen).toBe(0);
    }
  });

  it("is transposition-table independent and antisymmetric in 2p", () => {
    const state = midRound(2, 77, 8);
    const leaf = new LeafValuer(state, "exact");
    const f = fastFromState(state, -1);
    const tt = new Map<string, Float64Array>();
    const a = solveExact(cloneFast(f), leaf, tt);
    const b = solveExact(cloneFast(f), leaf, tt);
    const c = solveExact(cloneFast(f), leaf, new Map());
    expect([...a]).toEqual([...b]);
    expect([...a]).toEqual([...c]);
    expect(a[0]).toBeCloseTo(-a[1], 9);
    // 2p bypasses the vector table: its values live in the process-wide trick memo.
    expect(tt.size).toBe(0);
    expect(trickMemoStats().size).toBeGreaterThan(0);
  });

  it("2p trick minimax matches an engine brute force on tricks", () => {
    const bruteTricks = (state: GameState): number => {
      const sim = lightClone(state);
      if (sim.phase === "trick-settle") settleTrick(sim);
      if (sim.phase !== "trick") return sim.players[0].tricksWon;
      const seat = sim.turn;
      let best = seat === 0 ? -1 : 99;
      for (const action of getLegalActions(sim)) {
        const next = lightClone(sim);
        applyActionTrusted(next, action);
        const v = bruteTricks(next);
        best = seat === 0 ? Math.max(best, v) : Math.min(best, v);
      }
      return best;
    };
    clearTrickMemo();
    for (let seed = 1; seed <= 25; seed++) {
      const state = midRound(2, seed * 7 + 1, 8);
      const f = fastFromState(state, -1);
      const expected = bruteTricks(state);
      expect(f.tricksWon[0] + solveTricks2p(f)).toBe(expected);
      expect(f.undoLen).toBe(0);
    }
    expect(trickMemoStats().size).toBeGreaterThan(0);
  });

  it("shares 2p endgame values across deals without collisions", () => {
    // Two deals of the same game reach different positions; a shared memo
    // must give each the same answer as a fresh solve.
    for (let seed = 1; seed <= 12; seed++) {
      const state = midRound(2, seed * 31, 10);
      const f = fastFromState(state, -1);
      const leaf = new LeafValuer(state, "tier");
      clearTrickMemo();
      const fresh = solveExact(cloneFast(f), leaf, new Map());
      const warm = solveExact(cloneFast(f), leaf, new Map());
      expect([...warm]).toEqual([...fresh]);
      expect(trickMemoStats().hits).toBeGreaterThan(0);
    }
  });

  it("returns the leaf value once the round is over", () => {
    const state = midRound(2, 3, 2);
    const f = fastFromState(state, -1);
    const buf = new Int8Array(13);
    while (f.cardsLeft > 0) applyFast(f, buf[legalInto(f, f.turn, buf) - 1]);
    const leaf = new LeafValuer(state, "exact");
    expect(solveExact(f, leaf, new Map())).toBe(leaf.value(f.tricksWon));
  });
});
