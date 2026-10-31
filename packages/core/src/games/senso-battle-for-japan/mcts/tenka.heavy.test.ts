// Heavy tier (`pnpm test:heavy`): Tenka's playing strength over seeded games.
// It proves the search plays well, not that it plays legally (tenka.test.ts),
// and takes ~20 s alone — too slow for the pre-commit hook and the default CI
// suites, so it runs in its own CI job with the tier's generous timeout.

import { describe, expect, it } from "vitest";
import { simulateGame } from "../tournament-runner";
import { DEFAULT_TENKA } from "./index";

describe("Tenka (strength)", () => {
  it("beats Daimyō in seeded 2-player games", () => {
    // Observed 2026-09-07 with iterations 400 (deterministic): 15/16 — threshold two below.
    const live = { ...DEFAULT_TENKA };
    Object.assign(DEFAULT_TENKA, { timeMs: 0, iterations: 400, rootSolveDets: 8 });
    let wins = 0;
    try {
      for (let i = 0; i < 16; i++) {
        const seats = i % 2 === 0 ? ["tenka", "heuristic-v1"] : ["heuristic-v1", "tenka"];
        const winner = simulateGame(seats as never, i);
        if (winner >= 0 && seats[winner] === "tenka") wins++;
      }
    } finally {
      Object.assign(DEFAULT_TENKA, live);
    }
    expect(wins).toBeGreaterThanOrEqual(13);
  });
});
