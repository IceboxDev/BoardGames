import { describe, expect, it } from "vitest";
import {
  allocateDepths,
  BEST_MOVE,
  type Calibration,
  candidates,
  finalDepth,
  nodesAt,
  pickBest,
  projectSeconds,
  scoreValue,
  tierOf,
} from "./eval-policy";

const cp = (uci: string, v: number) => ({ uci, cp: v, mate: null });
const mate = (uci: string, m: number) => ({ uci, cp: null, mate: m });
const lc0 = (uci: string, w: number, d: number, l: number, visits = 100) => ({
  uci,
  w,
  d,
  l,
  visits,
});

describe("BEST_MOVE_V2", () => {
  it("counts an evaluation final only at depth 50 for you, 40 for the opponent", () => {
    expect([finalDepth("user", 300), finalDepth("user", 0), finalDepth("opp", 5)]).toEqual([
      50, 50, 40,
    ]);
  });

  it("puts positions in tiers by reach", () => {
    expect([25, 20, 19, 3, 2, 1, 0].map((r) => tierOf(r).name)).toEqual([
      "trunk",
      "trunk",
      "main",
      "main",
      "rare",
      "rare",
      "leaf",
    ]);
  });

  it("orders mates above every cp score, shorter mates first", () => {
    const sorted = [
      cp("a", 900),
      mate("b", 3),
      mate("c", 1),
      mate("d", -2),
      mate("e", -6),
      cp("f", -900),
    ]
      .sort((x, y) => scoreValue(y) - scoreValue(x))
      .map((s) => s.uci);
    expect(sorted).toEqual(["c", "b", "a", "f", "e", "d"]);
  });

  it("keeps Stockfish's best when nothing ties", () => {
    expect(pickBest([cp("e2e4", 40), cp("d2d4", 20)])).toEqual({
      best: "e2e4",
      ties: ["e2e4"],
      byLc0: false,
      contested: false,
    });
  });

  it("lets Stockfish decide unless it scores moves exactly the same", () => {
    const lc0Likes = [lc0("a", 0.1, 0.8, 0.1), lc0("b", 0.2, 0.7, 0.1), lc0("c", 0.5, 0.2, 0.3)];
    // One centipawn apart is not a tie: Stockfish's best stands.
    expect(pickBest([cp("a", 0), cp("b", -1), cp("c", -40)], lc0Likes)).toMatchObject({
      best: "a",
      ties: ["a"],
      byLc0: false,
    });
  });

  it("breaks an exact tie by Lc0's win minus loss, then fewer draws", () => {
    const sf = [cp("a", 0), cp("b", 0), cp("c", -40)];
    const r = pickBest(sf, [
      lc0("a", 0.1, 0.8, 0.1),
      lc0("b", 0.2, 0.7, 0.1),
      lc0("c", 0.5, 0.2, 0.3),
    ]);
    expect(r).toMatchObject({ best: "b", ties: ["a", "b"], byLc0: true });
    const even = pickBest(
      [cp("a", 0), cp("b", 0)],
      [lc0("a", 0.1, 0.8, 0.1, 500), lc0("b", 0.2, 0.6, 0.2, 400)],
    );
    expect(even.best).toBe("b");
  });

  it("never ties a mate and flags Lc0 favouring a much worse move", () => {
    expect(pickBest([mate("a", 4), cp("b", 2000)]).ties).toEqual(["a"]);
    const r = pickBest(
      [cp("a", 50), cp("b", -30)],
      [lc0("b", 0.4, 0.4, 0.2, 900), lc0("a", 0.3, 0.5, 0.2, 100)],
    );
    expect(r).toMatchObject({ best: "a", contested: true });
  });

  it("picks full-depth candidates within the margin", () => {
    expect(candidates([cp("a", 30), cp("b", 10), cp("c", 4), cp("d", -50)])).toEqual(["a", "b"]);
    expect(candidates([mate("a", 5), cp("b", 900)])).toEqual(["a"]);
  });
});

const cal: Calibration = {
  nps: 30e6,
  nodesToDepth: { 30: 1e8, 40: 8e8, 50: 6.4e9 },
  multipv3Factor: 2.5,
  candidateFactor: 0.5,
};

describe("budget", () => {
  it("interpolates and extrapolates nodes to depth geometrically", () => {
    expect(nodesAt(cal, 40)).toBe(8e8);
    expect(nodesAt(cal, 45)).toBeCloseTo(Math.sqrt(8e8 * 6.4e9), -3);
    expect(nodesAt(cal, 55)).toBeCloseTo(6.4e9 * 8 ** 0.5, -3);
  });

  it("fits the budget by lowering leaf, rare, main and opponents — never the trunk", () => {
    const work = { user: { trunk: 300, main: 1500, rare: 3500, leaf: 2500 }, opp: 2200 };
    const full = projectSeconds(cal, work, BEST_MOVE.tiers, 40);
    const budget = 90 * 3600;
    expect(full).toBeGreaterThan(budget);
    const plan = allocateDepths(cal, work, budget);
    expect(plan.seconds).toBeLessThanOrEqual(budget);
    expect(plan.tiers.find((t) => t.name === "trunk")?.depth).toBe(50);
    const d = Object.fromEntries(plan.tiers.map((t) => [t.name, t.depth]));
    expect(d.main).toBeGreaterThanOrEqual(d.rare ?? 0);
    expect(d.rare).toBeGreaterThanOrEqual(d.leaf ?? 0);
  });

  it("raises main and rare toward the trunk with time to spare", () => {
    const plan = allocateDepths(
      cal,
      { user: { trunk: 10, main: 10, rare: 10, leaf: 10 }, opp: 10 },
      90 * 3600,
    );
    expect(plan.tiers.map((t) => t.depth)).toEqual([50, 50, 50, 50]);
  });
});
