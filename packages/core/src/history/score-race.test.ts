import { describe, expect, it } from "vitest";
import {
  describeRaceRoundsError,
  describeScoreRaceError,
  isRaceTotalsOnly,
  raceStatus,
  scoreRaceForSlug,
} from "./score-race";

const take5 = scoreRaceForSlug("take-5");
const bandit = scoreRaceForSlug("bandit");
if (!take5 || !bandit) throw new Error("score races missing");

function players(...hands: number[][]) {
  return hands.map((raceRounds) => ({
    raceRounds,
    score: raceRounds.reduce((a, b) => a + b, 0),
  }));
}

describe("raceStatus", () => {
  it("Take 5 ends only once a total is OVER 66", () => {
    expect(raceStatus(take5, players([30, 36], [10, 5]))).toEqual({ status: "running", rounds: 2 });
    expect(raceStatus(take5, players([30, 37], [10, 5]))).toEqual({
      status: "finished",
      rounds: 2,
      crossed: [0],
    });
  });

  it("Bandit ends as soon as a total reaches 100, negative hands included", () => {
    expect(raceStatus(bandit, players([60, 39], [-10, 20]))).toMatchObject({ status: "running" });
    expect(raceStatus(bandit, players([60, 40], [-10, 20]))).toMatchObject({
      status: "finished",
      crossed: [0],
    });
  });

  it("names every player who crossed on the last hand", () => {
    expect(raceStatus(take5, players([70], [80], [3]))).toMatchObject({ crossed: [0, 1] });
  });

  it("flags hands recorded after the game ended", () => {
    expect(raceStatus(take5, players([70, 2], [1, 1]))).toMatchObject({ status: "invalid" });
  });

  it("is empty with no hands", () => {
    expect(raceStatus(take5, [{ score: 0 }, { score: 0 }])).toEqual({ status: "empty" });
  });
});

describe("describeRaceRoundsError", () => {
  it("accepts records without hands and consistent ones", () => {
    expect(describeRaceRoundsError({ players: [{ score: 3 }, { score: 4 }] })).toBeNull();
    expect(describeRaceRoundsError({ players: players([1, 2], [3, 4]) })).toBeNull();
  });

  it("rejects mismatched hand counts, partial records and wrong totals", () => {
    expect(describeRaceRoundsError({ players: players([1, 2], [3]) })).toMatch(/same hands/);
    expect(
      describeRaceRoundsError({ players: [{ score: 3, raceRounds: [3] }, { score: 1 }] }),
    ).toMatch(/same hands/);
    expect(
      describeRaceRoundsError({
        players: [
          { score: 9, raceRounds: [3] },
          { score: 1, raceRounds: [1] },
        ],
      }),
    ).toMatch(/total/);
  });
});

describe("describeScoreRaceError", () => {
  it("needs the game to reach its end", () => {
    expect(describeScoreRaceError(take5, { players: players([10], [20]) })).toMatch(/passes 66/);
    expect(describeScoreRaceError(take5, { players: players([10, 57], [20, 1]) })).toBeNull();
  });
});

describe("isRaceTotalsOnly", () => {
  it("spots a record from before hand-by-hand entry", () => {
    expect(isRaceTotalsOnly([{ score: 70 }, { score: 30 }])).toBe(true);
    expect(isRaceTotalsOnly([{ score: 0 }, { score: 0 }])).toBe(false);
    expect(isRaceTotalsOnly(players([70], [30]))).toBe(false);
  });
});
