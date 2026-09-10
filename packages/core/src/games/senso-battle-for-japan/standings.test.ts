import { describe, expect, it } from "vitest";
import { EMPEROR_FACTION, factionsForTable, resolveStandings } from "./standings";

// The ladder the engine and the match recorder share. The interesting rung is
// the last one: a persisting tie crowns a seated Emperor even when the Emperor
// is not among the tied — and a table without one is simply drawn.

const clan = (score: number, cubes: number) => ({ score, cubes, emperor: false });
const emperor = (score: number) => ({ score, cubes: 0, emperor: true });

describe("resolveStandings", () => {
  it("most points wins outright", () => {
    expect(resolveStandings([clan(12, 3), clan(9, 8)])).toEqual({
      winners: [0],
      tiebreak: "score",
      placements: [1, 2],
    });
  });

  it("a tie on points goes to cubes on the map", () => {
    expect(resolveStandings([clan(12, 3), clan(12, 5), clan(7, 9)])).toMatchObject({
      winners: [1],
      tiebreak: "cubes",
      placements: [2, 1, 3],
    });
  });

  it("a tie that survives the cube count crowns the Emperor, even from outside it", () => {
    const standings = resolveStandings([clan(12, 4), clan(12, 4), emperor(8), clan(5, 2)]);
    expect(standings).toMatchObject({ winners: [2], tiebreak: "emperor" });
    // The throne is rank 1 despite the lower score; the tied clans share 2nd.
    expect(standings.placements).toEqual([2, 2, 1, 4]);
  });

  it("crowns a tied Emperor the same way", () => {
    expect(resolveStandings([clan(10, 0), emperor(10)])).toMatchObject({
      winners: [1],
      tiebreak: "emperor",
      placements: [2, 1],
    });
  });

  it("is a draw when the tie persists and no Emperor sits at the table", () => {
    expect(resolveStandings([clan(12, 4), clan(12, 4), clan(3, 1)])).toEqual({
      winners: [0, 1],
      tiebreak: "draw",
      placements: [1, 1, 3],
    });
  });

  it("handles an empty table", () => {
    expect(resolveStandings([])).toEqual({ winners: [], tiebreak: "draw", placements: [] });
  });
});

describe("factionsForTable", () => {
  it("offers the four clans, and the Emperor only at a five-seat table", () => {
    expect(factionsForTable(4)).toEqual(["Takeda", "Uesugi", "Oda", "Mōri"]);
    expect(factionsForTable(5)).toEqual(["Takeda", "Uesugi", "Oda", "Mōri", EMPEROR_FACTION]);
  });
});
