// Heavy tier (`pnpm test:heavy`): Tenka's playing strength over seeded games.
// It proves the search plays well, not that it plays legally (tenka.test.ts),
// and takes ~20 s alone — too slow for the pre-commit hook and the default CI
// suites, so it runs in its own CI job with the tier's generous timeout.
// The deadline checks are here for the same reason: how fast a search answers
// depends on the machine, so it never decides a commit (docs/testing.md).

import { describe, expect, it } from "vitest";
import { canonicalEquals } from "../../../machines/action-validation";
import { pickAiActionTimed } from "../ai-strategies";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import { simulateGame } from "../tournament-runner";
import { DEFAULT_TENKA, pickRewardTenka } from "./index";

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

describe("Tenka (deadlines)", () => {
  it("respects a wall-clock budget", () => {
    const state = createInitialState(2, ["tenka", "tenka"], 8);
    let worst = 0;
    let searched = 0;
    while (state.phase !== "game-over" && state.round < 3) {
      if (state.phase === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const seat = getActivePlayer(state);
      const { action, ms } = pickAiActionTimed(state, seat, "tenka", { timeMs: 40 });
      if (state.phase === "trick") {
        worst = Math.max(worst, ms);
        searched++;
      }
      applyAction(state, action);
    }
    expect(searched).toBeGreaterThan(20);
    expect(worst).toBeLessThan(150);
  });

  it("stops a rewards search at its deadline", () => {
    const state = createInitialState(5, ["tenka", "tenka", "tenka", "tenka", "tenka"], 23);
    let worst = 0;
    let timedDecisions = 0;
    while (state.phase !== "game-over" && state.round <= 4) {
      if (state.phase === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const seat = getActivePlayer(state);
      const legal = getLegalActions(state);
      if (state.phase === "rewards") {
        const t0 = performance.now();
        const timed = pickRewardTenka(state, legal, seat, { ...DEFAULT_TENKA, rewardTimeMs: 15 });
        worst = Math.max(worst, performance.now() - t0);
        expect(legal.some((a) => canonicalEquals(a, timed))).toBe(true);
        timedDecisions++;
      }
      applyAction(state, legal[0]);
    }
    expect(timedDecisions).toBeGreaterThan(5);
    // An honoured 15 ms deadline stops long before an unbounded search would.
    expect(worst).toBeLessThan(120);
  });
});
