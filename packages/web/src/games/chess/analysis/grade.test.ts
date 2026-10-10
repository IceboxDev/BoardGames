import { describe, expect, it } from "vitest";
import {
  formatScore,
  gradeFor,
  moveAccuracy,
  type PositionEval,
  reviewGame,
  winPercent,
} from "./grade";

const ev = (cp: number, best: string | null = null): PositionEval => ({
  score: { cp },
  best,
  pv: [],
  depth: 12,
});

describe("analysis grading", () => {
  it("maps scores to win chances", () => {
    expect(winPercent({ cp: 0 })).toBeCloseTo(50);
    expect(winPercent({ cp: 300 })).toBeGreaterThan(75);
    expect(winPercent({ mate: 2 })).toBeGreaterThan(97);
    expect(winPercent({ mate: -2 })).toBeLessThan(3);
  });

  it("grades by the win chance thrown away", () => {
    expect(gradeFor(5, false)).toBeNull();
    expect(gradeFor(12, false)).toBe("inaccuracy");
    expect(gradeFor(25, false)).toBe("mistake");
    expect(gradeFor(45, false)).toBe("blunder");
    expect(gradeFor(45, true)).toBe("best");
    expect(moveAccuracy(0)).toBeCloseTo(100, 0);
    expect(moveAccuracy(50)).toBeLessThan(15);
  });

  it("reviews a game from each mover's side", () => {
    const moves = [
      { uci: "e2e4", by: "w" as const },
      { uci: "d8h4", by: "b" as const }, // hangs the queen
      { uci: "g1f3", by: "w" as const },
    ];
    const evals = [ev(20, "e2e4"), ev(30, "e7e5"), ev(700, "g1f3"), undefined];
    const review = reviewGame(moves, evals);
    expect(review.grades).toEqual(["best", "blunder", null]);
    expect(review.counts.b.blunder).toBe(1);
    expect(review.accuracy.w).toBeGreaterThan(95);
    expect(review.accuracy.b).toBeLessThan(20);
  });

  it("formats scores as players write them", () => {
    expect(formatScore({ cp: 134 })).toBe("+1.3");
    expect(formatScore({ cp: -40 })).toBe("−0.4");
    expect(formatScore({ cp: 2 })).toBe("0.0");
    expect(formatScore({ mate: 3 })).toBe("#3");
    expect(formatScore({ mate: -2 })).toBe("#−2");
  });
});
