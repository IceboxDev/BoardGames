import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import { canonicalEquals } from "../../machines/action-validation";
import {
  configureSearch,
  determinize,
  pickPlaySearch,
  pickRewardSearch,
  tierTable,
  voidsOf,
} from "./ai-search";
import { applyAction, createInitialState, settleTrick } from "./game-engine";
import { getLegalActions } from "./rules";
import { seatPattern, simulateGame } from "./tournament-runner";
import type { AIStrategyId, GameState } from "./types";

function afterTrick(): GameState {
  // Seat 0 leads takeda, seat 1 (holding no takeda) sloughs an oda card.
  const state = createInitialState(2, [null, null], 3);
  state.players[0].hand = ["takeda-5", "oda-9", "mori-2"];
  state.players[1].hand = ["oda-3", "uesugi-7", "mori-11"];
  state.trumpSuit = "mori";
  state.turn = 0;
  state.leader = 0;
  applyAction(state, { type: "play", card: "takeda-5" });
  applyAction(state, { type: "play", card: "oda-3" });
  settleTrick(state);
  return state;
}

describe("determinization", () => {
  it("reads voids off the round's tricks", () => {
    const state = afterTrick();
    expect(voidsOf(state)).toEqual(new Set(["1:takeda"]));
  });

  it("deals consistent hidden hands: right sizes, no known cards, voids respected", () => {
    const state = afterTrick();
    const rng = createRng(11);
    for (let i = 0; i < 25; i++) {
      const det = determinize(state, 0, rng);
      expect(det.players[0].hand).toEqual(state.players[0].hand);
      expect(det.players[1].hand).toHaveLength(2);
      for (const card of det.players[1].hand) {
        expect(state.players[0].hand).not.toContain(card);
        expect(state.played).not.toContain(card);
        expect(card.startsWith("takeda-")).toBe(false);
      }
      // The real state is untouched.
      expect(state.players[1].hand).toEqual(["uesugi-7", "mori-11"]);
    }
  });
});

describe("search decisions", () => {
  it("always returns one of the engine's legal actions, in every phase", () => {
    const state = createInitialState(3, ["shogun", "shogun", "shogun"], 21);
    let checked = 0;
    while (state.phase !== "game-over" && checked < 400) {
      if (state.phase === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const seat =
        state.phase === "trick"
          ? state.turn
          : (state.rewardQueue[0]?.player ?? state.bonusQueue[0]);
      const legal = getLegalActions(state);
      // Every optional search path stays exercised (they are measured-flat
      // in self-play but must never produce an illegal move).
      const opts = {
        determinizations: 2,
        rewardCandidates: 3,
        exactRoundValue: checked % 2 === 0,
        opponentSearch: 2,
        rolloutMode: checked % 3 === 0 ? ("aggressive" as const) : ("careful" as const),
        trickLookahead: 2,
      };
      const picked =
        state.phase === "trick"
          ? pickPlaySearch(state, legal, seat, opts)
          : pickRewardSearch(state, legal, seat, opts);
      expect(legal.some((a) => canonicalEquals(a, picked))).toBe(true);
      applyAction(state, picked);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("values a seat's reward tiers on the current board from the viewer's standpoint", () => {
    const state = createInitialState(2, [null, null], 4);
    const table = tierTable(state, 0);
    expect(table).toHaveLength(2);
    expect(table[0]).toHaveLength(5);
    expect(table[0][0]).toBe(0);
    // My own rewards can only help me; the opponent's can only hurt (or do nothing).
    for (let t = 1; t < 5; t++) {
      expect(table[0][t]).toBeGreaterThanOrEqual(0);
      expect(table[1][t]).toBeLessThanOrEqual(0);
    }
    // Focus is worth at least a single Aggression.
    expect(table[0][4]).toBeGreaterThanOrEqual(table[0][3]);
  });

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
  }, 60_000);
});
