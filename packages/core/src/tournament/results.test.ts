import { describe, expect, it } from "vitest";
import { mergeResults, type TournamentMatchup, type TournamentResults } from "./results";

const matchup = (a: string, b: string, aWins: number): TournamentMatchup => ({
  a,
  b,
  games: 10,
  aWins,
  bWins: 10 - aWins,
  draws: 0,
  avgScoreA: null,
  avgScoreB: null,
});

const results = (ids: string[], matchups: TournamentMatchup[]): TournamentResults => ({
  formatVersion: 1,
  slug: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  strategies: ids.map((id) => ({ id, label: id })),
  tables: [{ playerCount: 2, matchups }],
});

describe("mergeResults", () => {
  it("replaces the matchups a run played, in either orientation, and keeps the rest", () => {
    const previous = results(["x", "y", "z"], [matchup("x", "y", 1), matchup("y", "z", 2)]);
    const fresh = results(["x", "y", "z"], [matchup("y", "x", 7)]);
    expect(mergeResults(previous, fresh).tables[0].matchups).toEqual([
      matchup("y", "z", 2),
      matchup("y", "x", 7),
    ]);
  });

  it("drops the matchups of a strategy the game no longer offers", () => {
    const previous = results(["gone", "x", "y"], [matchup("gone", "x", 0), matchup("x", "y", 4)]);
    const fresh = results(["x", "y"], []);
    expect(mergeResults(previous, fresh).tables[0].matchups).toEqual([matchup("x", "y", 4)]);
  });
});
