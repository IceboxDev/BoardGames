import { describe, expect, it } from "vitest";
import { normalizeRace } from "./score-race-rounds";

const ann = { userId: "a", displayName: "Ann" };
const bob = { userId: "b", displayName: "Bob" };

describe("normalizeRace", () => {
  it("starts a fresh roster on hand 1", () => {
    expect(
      normalizeRace([
        { ...ann, score: 0 },
        { ...bob, score: 0 },
      ]),
    ).toEqual([
      { ...ann, score: 0, raceRounds: [0], rank: undefined },
      { ...bob, score: 0, raceRounds: [0], rank: undefined },
    ]);
  });

  it("pads a newcomer to the table's hands and sums every total", () => {
    const out = normalizeRace([
      { ...ann, score: 0, raceRounds: [5, 7] },
      { ...bob, score: 0, raceRounds: [] },
    ]);
    expect(out.map((p) => [p.raceRounds, p.score])).toEqual([
      [[5, 7], 12],
      [[0, 0], 0],
    ]);
  });

  it("pins ranks lowest-first on a tie", () => {
    const out = normalizeRace([
      { ...ann, score: 0, raceRounds: [10] },
      { ...bob, score: 0, raceRounds: [10] },
    ]);
    expect(out.map((p) => p.rank)).toEqual([1, 2]);
  });

  it("leaves a totals-only legacy record alone", () => {
    const legacy = [
      { ...ann, score: 70 },
      { ...bob, score: 31 },
    ];
    expect(normalizeRace(legacy)).toEqual(legacy);
  });
});
