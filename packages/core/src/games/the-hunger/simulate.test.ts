import { describe, expect, it } from "vitest";
import { simulate } from "./simulate";
import type { AIStrategyId } from "./types";

describe("self-play", () => {
  it("every seeded game terminates at sunrise, 2–6 players, both modes", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const n = 2 + (seed % 5);
      const { state } = simulate(Array(n).fill("heuristic-v1"), seed, {
        mode: seed % 2 ? "elder" : "rookie",
      });
      expect(state.phase).toBe("game-over");
      expect(state.turn).toBeGreaterThanOrEqual(15);
      expect(state.result?.scores).toHaveLength(n);
    }
  });

  it("the heuristic gets home and beats random", () => {
    let survived = 0;
    let seats = 0;
    let wins = 0;
    const games = 20;
    for (let seed = 100; seed < 100 + games; seed++) {
      const lineup: AIStrategyId[] = ["heuristic-v1", "random", "random"];
      const { state } = simulate(lineup, seed);
      const b = state.result?.breakdown ?? [];
      survived += b[0].fate === "ashes" ? 0 : 1;
      seats += 1;
      if (state.result?.placements[0] === 1) wins += 1;
    }
    expect(survived / seats).toBeGreaterThanOrEqual(0.8);
    expect(wins / games).toBeGreaterThanOrEqual(0.7);
  });
});
