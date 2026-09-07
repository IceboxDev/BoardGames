import { describe, expect, it } from "vitest";
import { NO_WEIGHTS } from "../ai-rewards";
import { tierTable } from "../ai-search";
import { createInitialState } from "../game-engine";
import { tierFor } from "../rules";
import { LeafValuer, TRICK_TIEBREAK } from "./leaf-value";

const TIER_INDEX: Record<number, number> = { 0: 0, 1: 1, 3: 2, 5: 3, 7: 4 };

describe("LeafValuer", () => {
  it("memoises per trick vector and matches a fresh valuer", () => {
    const state = createInitialState(3, [null, null, null], 5);
    const a = new LeafValuer(state, "exact");
    const b = new LeafValuer(state, "exact");
    const v1 = a.value([7, 3, 3]);
    const v2 = a.value(Uint8Array.from([7, 3, 3]));
    expect(v2).toBe(v1);
    expect([...b.value([7, 3, 3])]).toEqual([...v1]);
    expect([...a.value([3, 3, 7])]).not.toEqual([...v1]);
  });

  it("is antisymmetric with two players", () => {
    const state = createInitialState(2, [null, null], 9);
    const leaf = new LeafValuer(state, "exact");
    for (const mine of [0, 1, 3, 5, 7, 13]) {
      const v = leaf.value([mine, 13 - mine]);
      expect(v[0]).toBeCloseTo(-v[1], 9);
    }
  });

  it("in tier mode sums the additive per-seat tier tables", () => {
    const state = createInitialState(3, [null, null, null], 5);
    const leaf = new LeafValuer(state, "tier");
    const tricks = [5, 7, 1];
    const v = leaf.value(tricks);
    for (let s = 0; s < 3; s++) {
      const table = tierTable(state, s, NO_WEIGHTS);
      let sum = 0;
      for (let p = 0; p < 3; p++) sum += table[p][TIER_INDEX[tierFor(tricks[p]) ?? 0]];
      expect(v[s]).toBeCloseTo(sum + TRICK_TIEBREAK * (tricks[s] - 13 / 3), 9);
    }
  });

  it("values a seat's own extra tier at least as well when nobody else changes", () => {
    const state = createInitialState(2, [null, null], 21);
    const leaf = new LeafValuer(state, "exact");
    expect(leaf.value([7, 6])[0]).toBeGreaterThan(leaf.value([6, 7])[0]);
  });
});
