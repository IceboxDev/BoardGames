import { describe, expect, it } from "vitest";
import {
  compareSeatGroups,
  GameOutcomeSchema,
  placementsFromScores,
  rankedByKeys,
  rankedByScore,
  rankedByWinners,
  seatPlacement,
  seatResult,
  seatScore,
} from "./outcome";

describe("GameOutcomeSchema", () => {
  it("parses each kind", () => {
    expect(GameOutcomeSchema.parse({ kind: "ranked", placements: [1, 2] }).kind).toBe("ranked");
    expect(GameOutcomeSchema.parse({ kind: "coop", won: true }).kind).toBe("coop");
    expect(
      GameOutcomeSchema.parse({ kind: "teams", teamOf: [0, 0, 1, 1], winningTeam: 1 }).kind,
    ).toBe("teams");
  });

  it("rejects a 0 placement, an empty ranking and a one-seat team game", () => {
    expect(() => GameOutcomeSchema.parse({ kind: "ranked", placements: [0, 1] })).toThrow();
    expect(() => GameOutcomeSchema.parse({ kind: "ranked", placements: [] })).toThrow();
    expect(() => GameOutcomeSchema.parse({ kind: "teams", teamOf: [0], winningTeam: 0 })).toThrow();
  });
});

describe("placementsFromScores", () => {
  it("uses competition ranking with shared places", () => {
    expect(placementsFromScores([10, 30, 30, 5])).toEqual([3, 1, 1, 4]);
  });
  it("ranks low scores first when asked", () => {
    expect(placementsFromScores([10, 30, 5], "low")).toEqual([2, 3, 1]);
  });
});

describe("seatResult", () => {
  it("reads a two-player win and loss", () => {
    const o = rankedByScore([40, 12]);
    expect(seatResult(o, 0)).toBe("win");
    expect(seatResult(o, 1)).toBe("loss");
  });

  it("calls an all-shared first place a draw", () => {
    const o = rankedByScore([7, 7]);
    expect(seatResult(o, 0)).toBe("draw");
    expect(seatResult(o, 1)).toBe("draw");
  });

  it("lets several seats win when they share first (Durak's non-losers)", () => {
    const o: ReturnType<typeof rankedByWinners> = { kind: "ranked", placements: [1, 4, 1, 1] };
    expect(seatResult(o, 0)).toBe("win");
    expect(seatResult(o, 1)).toBe("loss");
  });

  it("reads co-op and team outcomes", () => {
    expect(seatResult({ kind: "coop", won: false }, 1)).toBe("loss");
    const teams = { kind: "teams", teamOf: [0, 0, 1, 1], winningTeam: 1 } as const;
    expect(seatResult(teams, 0)).toBe("loss");
    expect(seatResult(teams, 3)).toBe("win");
    expect(seatResult({ ...teams, winningTeam: null }, 3)).toBe("draw");
  });
});

describe("seatPlacement / seatScore", () => {
  it("returns places and scores per seat", () => {
    const o = rankedByScore([3, 9, 5]);
    expect(seatPlacement(o, 1)).toBe(1);
    expect(seatPlacement(o, 0)).toBe(3);
    expect(seatScore(o, 2)).toBe(5);
    expect(seatPlacement({ kind: "coop", won: true }, 0)).toBeNull();
    expect(
      seatScore({ kind: "teams", teamOf: [0, 1, 0, 1], winningTeam: 0, teamScores: [2, 1] }, 3),
    ).toBe(1);
  });
});

describe("rankedByWinners", () => {
  it("puts winners first and everyone else second; no winners is a draw", () => {
    expect(rankedByWinners(3, [2]).placements).toEqual([2, 2, 1]);
    expect(rankedByWinners(2, []).placements).toEqual([1, 1]);
  });
});

describe("compareSeatGroups", () => {
  it("is who won at a two-seat table", () => {
    expect(compareSeatGroups(rankedByScore([1, 9]), [0], [1])).toBe("b");
    expect(compareSeatGroups(rankedByScore([4, 4]), [0], [1])).toBe("draw");
  });

  it("uses the mean place when both groups share the best place", () => {
    // Durak at four seats: seat 1 (group B) is the durak.
    const o = { kind: "ranked", placements: [1, 4, 1, 1] } as const;
    expect(compareSeatGroups(o, [0, 2], [1, 3])).toBe("a");
  });
});

describe("rankedByKeys", () => {
  it("breaks score ties on the next key and shares places when every key ties", () => {
    const o = rankedByKeys([
      [10, 2],
      [10, 3],
      [8, 9],
      [10, 3],
    ]);
    expect(o.placements).toEqual([3, 1, 4, 1]);
    expect(o.scores).toEqual([10, 10, 8, 10]);
  });
});
