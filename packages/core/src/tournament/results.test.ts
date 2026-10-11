import { describe, expect, it } from "vitest";
import {
  type BenchmarkResults,
  type BenchmarkRun,
  emptyBenchmarkTally,
  type HeadToHeadResults,
  isBenchmark,
  mergeResults,
  type TournamentMatchup,
  TournamentResultsSchema,
  tallyToRun,
} from "./results";
import { alternatingSides, mirroredSeating } from "./simulator";

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

const results = (ids: string[], matchups: TournamentMatchup[]): HeadToHeadResults => ({
  formatVersion: 1,
  slug: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  strategies: ids.map((id) => ({ id, label: id })),
  tables: [{ playerCount: 2, matchups }],
});

const run = (strategy: string, wins: number): BenchmarkRun => ({
  strategy,
  games: 10,
  wins,
  avgScore: null,
});

const bench = (ids: string[], tables: [number, BenchmarkRun[]][]): BenchmarkResults => ({
  formatVersion: 1,
  kind: "benchmark",
  slug: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  strategies: ids.map((id) => ({ id, label: id })),
  tables: tables.map(([playerCount, runs]) => ({ playerCount, runs })),
});

describe("mergeResults", () => {
  it("replaces the matchups a run played, in either orientation, and keeps the rest", () => {
    const previous = results(["x", "y", "z"], [matchup("x", "y", 1), matchup("y", "z", 2)]);
    const fresh = results(["x", "y", "z"], [matchup("y", "x", 7)]);
    expect((mergeResults(previous, fresh) as HeadToHeadResults).tables[0].matchups).toEqual([
      matchup("y", "z", 2),
      matchup("y", "x", 7),
    ]);
  });

  it("drops the matchups of a strategy the game no longer offers", () => {
    const previous = results(["gone", "x", "y"], [matchup("gone", "x", 0), matchup("x", "y", 4)]);
    const fresh = results(["x", "y"], []);
    expect((mergeResults(previous, fresh) as HeadToHeadResults).tables[0].matchups).toEqual([
      matchup("x", "y", 4),
    ]);
  });

  it("replaces the benchmark runs a run played, keeps the rest in manifest order", () => {
    const previous = bench(
      ["x", "y", "gone"],
      [
        [2, [run("x", 1), run("y", 2), run("gone", 3)]],
        [3, [run("x", 4)]],
      ],
    );
    const fresh = bench(["x", "y"], [[2, [run("x", 9)]]]);
    const merged = mergeResults(previous, fresh);
    expect(isBenchmark(merged)).toBe(true);
    expect((merged as BenchmarkResults).tables).toEqual([
      { playerCount: 2, runs: [run("x", 9), run("y", 2)] },
      { playerCount: 3, runs: [run("x", 4)] },
    ]);
  });

  it("starts over when the file was the other kind", () => {
    const fresh = bench(["x"], [[2, [run("x", 5)]]]);
    expect(mergeResults(results(["x", "y"], [matchup("x", "y", 3)]), fresh)).toEqual(fresh);
  });
});

describe("TournamentResultsSchema", () => {
  it("reads a head-to-head file without a kind, as written before benchmarks", () => {
    const parsed = TournamentResultsSchema.parse(results(["x", "y"], [matchup("x", "y", 3)]));
    expect(isBenchmark(parsed)).toBe(false);
  });

  it("reads a benchmark with a single strategy", () => {
    const parsed = TournamentResultsSchema.parse(bench(["solo"], [[2, [run("solo", 6)]]]));
    expect(isBenchmark(parsed)).toBe(true);
  });

  it("rejects a benchmark run with more wins than games", () => {
    expect(() => TournamentResultsSchema.parse(bench(["x"], [[2, [run("x", 11)]]]))).toThrow();
  });

  it("rounds a benchmark tally's mean score and leaves it null without scores", () => {
    expect(tallyToRun("x", { games: 3, wins: 1, score: 10, scored: 3 })).toEqual({
      strategy: "x",
      games: 3,
      wins: 1,
      avgScore: 3.3,
    });
    expect(tallyToRun("x", { ...emptyBenchmarkTally(), games: 2 }).avgScore).toBeNull();
  });
});

describe("mirrored seating", () => {
  it("defaults to the even and odd seats, swapping sides between the pair", () => {
    const sides = alternatingSides(4);
    expect(mirroredSeating(sides, "A", "B", 0)).toEqual(["A", "B", "A", "B"]);
    expect(mirroredSeating(sides, "A", "B", 1)).toEqual(["B", "A", "B", "A"]);
  });

  it("follows a simulator's own sides — partners, or roles dealt from the seed", () => {
    const partners = [0, 1, 1, 0];
    expect(mirroredSeating(partners, "A", "B", 0)).toEqual(["A", "B", "B", "A"]);
    expect(mirroredSeating(partners, "A", "B", 1)).toEqual(["B", "A", "A", "B"]);
  });
});
