import { describe, expect, it } from "vitest";
import { MEASURED_ODDS, observedRate, oddsOf, picksToTake, raceTable } from "./stop-rule";

const even = raceTable({ us: 1.8, them: 1.8 });
/** Words stated at these probabilities, read through the measured odds. */
const listed = (...ps: number[]) => ps.map((p) => oddsOf(p));
const pastNumber = (...ps: number[]) => ps.map((p) => oddsOf(p, true));
const state = (need: number, opponentNeed: number, faceDown: number) => ({
  need,
  opponentNeed,
  faceDown,
  assassins: 1,
});

describe("the race model", () => {
  it("needing fewer, or them needing more, is better", () => {
    expect(even.theirMove(2, 5)).toBeGreaterThan(even.theirMove(5, 5));
    expect(even.theirMove(3, 6)).toBeGreaterThan(even.theirMove(3, 2));
    expect(even.ourMove(3, 3)).toBeGreaterThan(even.theirMove(3, 3));
    expect(even.theirMove(0, 3)).toBe(1);
    expect(even.theirMove(3, 0)).toBe(0);
  });

  it("a stronger opponent lowers our chances", () => {
    expect(raceTable({ us: 1.8, them: 3 }).theirMove(4, 4)).toBeLessThan(even.theirMove(4, 4));
  });

  it("reads a team's rate from the record, shrunk to the prior", () => {
    const history = [
      {
        by: "them" as const,
        clue: { word: "a", count: 3 },
        guesses: [1, 2, 3].map(() => ({ word: "x", result: "opponent" as const })),
      },
      {
        by: "them" as const,
        clue: { word: "b", count: 3 },
        guesses: [1, 2, 3].map(() => ({ word: "y", result: "opponent" as const })),
      },
    ];
    expect(observedRate(history, "them")).toBeCloseTo((6 + 3.6) / 4);
    expect(observedRate(history, "us")).toBeCloseTo(1.8);
  });
});

describe("where the turn stops", () => {
  it("always takes the first pick, and never more than are needed", () => {
    expect(picksToTake(listed(0.05, 0.1), state(3, 3, 15), even)).toBe(1);
    expect(picksToTake(listed(0.9, 0.9, 0.9), state(1, 3, 15), even)).toBe(1);
  });

  it("with them one agent from winning, a doubtful word that can win it now is worth a touch", () => {
    expect(picksToTake(listed(0.9, 0.4), state(2, 1, 12), even)).toBe(2);
    // …but not a long shot past the number, likelier theirs, with two more to find after it.
    expect(picksToTake(pastNumber(0.9, 0.2, 0.2), state(3, 1, 12), even)).toBe(1);
  });

  it("well ahead, it stops on the same doubtful word", () => {
    expect(picksToTake(listed(0.9, 0.25), state(2, 7, 16), even)).toBe(1);
  });

  it("reads a stated probability through what such words turned out to be", () => {
    expect(oddsOf(0.6).own).toBeGreaterThan(0.9);
    expect(oddsOf(0.3, true).opponent).toBeGreaterThan(oddsOf(0.4, true).opponent);
    expect(oddsOf(0.3, true).own).toBeLessThan(oddsOf(0.3).own);
    expect(oddsOf(0)).toEqual(MEASURED_ODDS.within[0]?.odds);
  });
});
