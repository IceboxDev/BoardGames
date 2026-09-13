import { describe, expect, it } from "vitest";
import { canonicalEquals } from "../../../machines/action-validation";
import { pickAiActionTimed } from "../ai-strategies";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import { simulateGame } from "../tournament-runner";
import type { Action, GameState } from "../types";
import {
  DEFAULT_TENKA,
  pickBonusTenka,
  pickPlayTenka,
  pickRewardTenka,
  TENKA,
  type TenkaConfig,
} from "./index";

const FAST: TenkaConfig = { ...DEFAULT_TENKA, timeMs: 0, iterations: 30, rootSolveDets: 2 };

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

describe("Tenka", () => {
  it("returns a legal action at every decision of a 3-player game", () => {
    const state = createInitialState(3, ["tenka", "tenka", "tenka"], 17);
    let decisions = 0;
    while (phaseOf(state) !== "game-over") {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const seat = getActivePlayer(state);
      const legal = getLegalActions(state);
      const picked =
        phaseOf(state) === "trick"
          ? pickPlayTenka(state, legal, seat, FAST).action
          : TENKA.pickAction(state, legal, seat);
      expect(
        legal.some((a) => canonicalEquals(a, picked)),
        `in ${phaseOf(state)}`,
      ).toBe(true);
      applyAction(state, picked);
      decisions++;
    }
    expect(decisions).toBeGreaterThan(200);
  }, 30_000);

  it("is deterministic when iteration-capped", () => {
    const state = createInitialState(2, ["tenka", "tenka"], 4);
    const legal = getLegalActions(state);
    const a = pickPlayTenka(state, legal, state.turn, { ...FAST, iterations: 200 });
    const b = pickPlayTenka(state, legal, state.turn, { ...FAST, iterations: 200 });
    expect(b.action).toEqual(a.action);
    expect(b.stats.iterations).toBeGreaterThanOrEqual(200);
    expect(b.stats.iterations).toBe(a.stats.iterations);
    expect(b.stats.root).toEqual(a.stats.root);
    expect(b.stats.mode).toBe("tree");
  });

  it("samples deals from the posterior chain when configured, legally and deterministically", () => {
    const cfg: TenkaConfig = { ...FAST, iterations: 120, sampler: "mcmc", samplerMinPlayers: 2 };
    for (const players of [2, 3, 5]) {
      const state = createInitialState(players, Array(players).fill("tenka"), 31);
      let sampled = 0;
      let weighted = 0;
      while (phaseOf(state) !== "game-over" && state.round <= 2) {
        if (phaseOf(state) === "trick-settle") {
          settleTrick(state);
          continue;
        }
        const seat = getActivePlayer(state);
        const legal = getLegalActions(state);
        let picked: Action;
        if (phaseOf(state) === "trick") {
          const a = pickPlayTenka(state, legal, seat, cfg);
          const b = pickPlayTenka(state, legal, seat, cfg);
          expect(b.action).toEqual(a.action);
          expect(b.stats.root).toEqual(a.stats.root);
          if (a.stats.mode === "tree") {
            // Paired root: every deal is descended once per candidate.
            expect(a.stats.deals).toBeGreaterThan(0);
            expect(a.stats.iterations % a.stats.deals).toBe(0);
            if (a.stats.sampler === "mcmc") {
              sampled++;
              // Unweighted samples: every deal counts once.
              expect(a.stats.ess).toBeCloseTo(a.stats.deals, 6);
              expect(a.stats.accept).toBeGreaterThan(0);
              expect(a.stats.accept).toBeLessThanOrEqual(1);
            } else {
              // Before any opponent play the posterior is uniform: the greedy dealer is used.
              expect(a.stats.sampler).toBe("weighted");
              expect(a.stats.ess).toBeLessThanOrEqual(a.stats.deals + 1e-9);
              weighted++;
            }
          }
          picked = a.action;
        } else {
          picked = TENKA.pickAction(state, legal, seat);
        }
        expect(legal.some((a) => canonicalEquals(a, picked))).toBe(true);
        applyAction(state, picked);
      }
      expect(sampled).toBeGreaterThan(5);
      expect(weighted).toBeGreaterThan(0);
    }
  }, 60_000);

  it("reports the effective sample size of weighted deals", () => {
    const state = createInitialState(3, ["tenka", "tenka", "tenka"], 31);
    // Advance into the round so the likelihood has something to weigh.
    let plies = 0;
    while (plies < 7) {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      applyAction(state, getLegalActions(state)[0]);
      plies++;
    }
    if (phaseOf(state) === "trick-settle") settleTrick(state);
    const legal = getLegalActions(state);
    const r = pickPlayTenka(state, legal, state.turn, { ...FAST, iterations: 150 });
    if (r.stats.mode === "tree") {
      expect(r.stats.sampler).toBe("weighted");
      expect(r.stats.iterations % r.stats.deals).toBe(0);
      expect(r.stats.ess).toBeGreaterThan(1);
      expect(r.stats.ess).toBeLessThan(r.stats.deals);
      expect(r.stats.maxShare).toBeGreaterThan(1 / r.stats.deals);
      expect(r.stats.maxShare).toBeLessThanOrEqual(1);
    }
  });

  it("collapses to a forced move when every legal card is equivalent", () => {
    const state = createInitialState(2, ["tenka", "tenka"], 4);
    const legal = getLegalActions(state);
    const plays = legal.filter((a) => a.type === "play");
    // A single legal card is forced regardless of the search settings.
    const r = pickPlayTenka(state, [plays[0]], state.turn, FAST);
    expect(r.stats.mode).toBe("forced");
    expect(r.action).toEqual(plays[0]);
  });

  it("switches to the exact root solver late in a round", () => {
    const state = createInitialState(2, ["tenka", "tenka"], 4);
    // Play random cards until 8 plies remain.
    let guard = 0;
    while (state.players.reduce((n, p) => n + p.hand.length, 0) > 8 && guard++ < 100) {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      applyAction(state, getLegalActions(state)[0]);
    }
    if (phaseOf(state) === "trick-settle") settleTrick(state);
    const legal = getLegalActions(state);
    const r = pickPlayTenka(state, legal, state.turn, {
      ...FAST,
      rootSolveDets: 4,
      rootSolvePlies: 8,
    });
    expect(["exact", "forced"]).toContain(r.stats.mode);
    expect(legal.some((a) => canonicalEquals(a, r.action))).toBe(true);
  });

  it("respects a wall-clock budget", () => {
    const state = createInitialState(2, ["tenka", "tenka"], 8);
    let worst = 0;
    let searched = 0;
    while (phaseOf(state) !== "game-over" && state.round < 3) {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const seat = getActivePlayer(state);
      const { action, ms } = pickAiActionTimed(state, seat, "tenka", { timeMs: 40 });
      if (phaseOf(state) === "trick") {
        worst = Math.max(worst, ms);
        searched++;
      }
      applyAction(state, action);
    }
    expect(searched).toBeGreaterThan(20);
    expect(worst).toBeLessThan(150);
  }, 30_000);

  it("searches the rewards phase deterministically and legally at every width", () => {
    const state = createInitialState(5, ["tenka", "tenka", "tenka", "tenka", "tenka"], 23);
    let rewardDecisions = 0;
    while (phaseOf(state) !== "game-over" && state.round <= 4) {
      if (phaseOf(state) === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const seat = getActivePlayer(state);
      const legal = getLegalActions(state);
      let picked: Action;
      if (phaseOf(state) === "trick") {
        picked = getLegalActions(state)[0];
      } else {
        const cfg = { ...FAST, rewardTimeMs: 0, rewardWidth: 3 };
        picked =
          phaseOf(state) === "bonus"
            ? pickBonusTenka(state, legal, seat, cfg)
            : pickRewardTenka(state, legal, seat, cfg);
        const again =
          phaseOf(state) === "bonus"
            ? pickBonusTenka(state, legal, seat, cfg)
            : pickRewardTenka(state, legal, seat, cfg);
        expect(again).toEqual(picked);
        expect(
          legal.some((a) => canonicalEquals(a, picked)),
          `in ${phaseOf(state)}`,
        ).toBe(true);
        // The timed path honours its deadline and stays legal too.
        const t0 = performance.now();
        const timed = pickRewardTenka(state, legal, seat, { ...FAST, rewardTimeMs: 15 });
        expect(performance.now() - t0).toBeLessThan(120);
        expect(legal.some((a) => canonicalEquals(a, timed))).toBe(true);
        rewardDecisions++;
      }
      applyAction(state, picked);
    }
    expect(rewardDecisions).toBeGreaterThan(10);
  }, 60_000);

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
  }, 120_000);
});
