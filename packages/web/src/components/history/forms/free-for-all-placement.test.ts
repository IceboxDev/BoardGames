import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";
import { describe, expect, it } from "vitest";
import {
  breakTie,
  hasScoreTie,
  placementOrder,
  ranksEqual,
  reconcileRanks,
} from "./free-for-all-placement.ts";

type Player = MatchOutcomeFreeForAll["players"][number];

const p = (id: string, score: number, rank?: number): Player => ({
  userId: id,
  displayName: id.toUpperCase(),
  score,
  ...(rank !== undefined ? { rank } : {}),
});

const ranks = (players: Player[]) => Object.fromEntries(players.map((x) => [x.userId, x.rank]));

describe("hasScoreTie", () => {
  it("detects shared scores", () => {
    expect(hasScoreTie([p("a", 10), p("b", 10)])).toBe(true);
    expect(hasScoreTie([p("a", 10), p("b", 9), p("c", 8)])).toBe(false);
  });
});

describe("reconcileRanks", () => {
  it("clears ranks when every score is distinct", () => {
    const out = reconcileRanks([p("a", 30, 1), p("b", 20, 2), p("c", 10, 3)], false);
    expect(ranks(out)).toEqual({ a: undefined, b: undefined, c: undefined });
  });

  it("pins a strict 1..n placement when a tie exists (highest wins)", () => {
    const out = reconcileRanks([p("a", 65), p("b", 65), p("c", 40)], false);
    // a and b tie at 65; stable input order makes a 1st, b 2nd, c 3rd.
    expect(ranks(out)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("respects the win direction (lowest wins)", () => {
    const out = reconcileRanks([p("a", 12), p("b", 5), p("c", 5)], true);
    // lowest wins: b & c tie at 5 (best), a worst.
    expect(ranks(out)).toEqual({ b: 1, c: 2, a: 3 });
  });

  it("preserves an earlier manual tie-break within a still-tied group", () => {
    // b was manually placed above a (rank 1 vs 2); a score edit keeps that order.
    const out = reconcileRanks([p("a", 65, 2), p("b", 65, 1), p("c", 40, 3)], false);
    expect(ranks(out)).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("re-pins when a score edit makes a higher score outrank a stale manual order", () => {
    // a now clearly leads on score despite an old rank 2 — score dominates.
    const out = reconcileRanks([p("a", 90, 2), p("b", 65, 1), p("c", 65, 3)], false);
    expect(ranks(out)).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe("breakTie", () => {
  it("swaps placement with the tied neighbour above", () => {
    const start = reconcileRanks([p("a", 65), p("b", 65), p("c", 40)], false);
    const out = breakTie(start, "b", "up", false);
    expect(ranks(out)).toEqual({ b: 1, a: 2, c: 3 });
  });

  it("is a no-op against a real score gap", () => {
    const start = reconcileRanks([p("a", 65), p("b", 65), p("c", 40)], false);
    // c (40) cannot move up past b (65) — different score.
    expect(breakTie(start, "c", "up", false)).toEqual(start);
  });

  it("is a no-op at the edge of the order", () => {
    const start = reconcileRanks([p("a", 65), p("b", 65), p("c", 40)], false);
    expect(breakTie(start, "a", "up", false)).toEqual(start);
  });

  it("orders a three-way tie step by step", () => {
    const start = reconcileRanks([p("a", 10), p("b", 10), p("c", 10)], false);
    expect(ranks(start)).toEqual({ a: 1, b: 2, c: 3 });
    const out = breakTie(breakTie(start, "c", "up", false), "c", "up", false);
    expect(ranks(out)).toEqual({ c: 1, a: 2, b: 3 });
  });
});

describe("placementOrder", () => {
  it("orders by rank when present, else by score", () => {
    const ranked = placementOrder([p("a", 65, 2), p("b", 65, 1), p("c", 40, 3)], false);
    expect(ranked.map((x) => x.userId)).toEqual(["b", "a", "c"]);
    const scored = placementOrder([p("a", 40), p("b", 65), p("c", 50)], false);
    expect(scored.map((x) => x.userId)).toEqual(["b", "c", "a"]);
  });
});

describe("ranksEqual", () => {
  it("compares rank by user, order-independent", () => {
    expect(ranksEqual([p("a", 1, 1), p("b", 1, 2)], [p("b", 9, 2), p("a", 9, 1)])).toBe(true);
    expect(ranksEqual([p("a", 1, 1)], [p("a", 1, 2)])).toBe(false);
    expect(ranksEqual([p("a", 1)], [p("a", 1), p("b", 1)])).toBe(false);
  });
});
