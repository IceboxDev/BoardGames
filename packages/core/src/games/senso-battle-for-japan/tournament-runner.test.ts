import { describe, expect, it } from "vitest";
import { createInitialState } from "./game-engine";
import { seatPattern, seedForGame, simulateGameDetailed } from "./tournament-runner";
import type { AIStrategyId } from "./types";

describe("mirrored games", () => {
  it("a shared seed deals the same cards and clans to the same chairs with the engines swapped", () => {
    // The bench's --mirror pairs game 2k with 2k+1: the seat pattern already
    // alternates by parity, so only the seed has to be shared for the deal's
    // luck to cancel inside the pair.
    const k = 7;
    const even = seatPattern<AIStrategyId>("shogun", "heuristic-v1", 3, 2 * k);
    const odd = seatPattern<AIStrategyId>("shogun", "heuristic-v1", 3, 2 * k + 1);
    expect(even).toEqual(["shogun", "heuristic-v1", "shogun"]);
    expect(odd).toEqual(["heuristic-v1", "shogun", "heuristic-v1"]);
    const seed = seedForGame(k);
    const a = createInitialState(3, even, seed);
    const b = createInitialState(3, odd, seed);
    expect(b.players.map((p) => p.hand)).toEqual(a.players.map((p) => p.hand));
    expect(b.players.map((p) => p.clan)).toEqual(a.players.map((p) => p.clan));
    expect(b.trumpSuit).toBe(a.trumpSuit);
    expect(b.players.map((p) => p.aiStrategy)).not.toEqual(a.players.map((p) => p.aiStrategy));
  });

  it("the seed override replaces the index-derived seed", () => {
    const seats = ["heuristic-v1", "heuristic-v1"] as const;
    const byIndex = simulateGameDetailed(seats, 3);
    const overridden = simulateGameDetailed(seats, 99, { seed: seedForGame(3) });
    expect(overridden.scores).toEqual(byIndex.scores);
    expect(overridden.winner).toBe(byIndex.winner);
  });
});
