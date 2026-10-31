// Heavy tier (`pnpm test:heavy`): the Shōgun search's playing strength over
// seeded games. It proves the search plays well, not that it plays legally
// (ai-search.test.ts), and plays 16 full games — too slow for the pre-commit
// hook, so it runs in its own CI job.

import { describe, expect, it } from "vitest";
import { configureSearch } from "./ai-search";
import { seatPattern, simulateGame } from "./tournament-runner";
import type { AIStrategyId } from "./types";

describe("search decisions (strength)", () => {
  it("beats the one-card heuristic clearly over a fixed set of seeded games", () => {
    configureSearch({ determinizations: 6, rewardCandidates: 8 });
    let wins = 0;
    const games = 16;
    for (let i = 0; i < games; i++) {
      const seats = seatPattern<AIStrategyId>("shogun", "heuristic-v1", 2, i);
      const winner = simulateGame(seats, i);
      if (winner >= 0 && seats[winner] === "shogun") wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(10);
  });
});
