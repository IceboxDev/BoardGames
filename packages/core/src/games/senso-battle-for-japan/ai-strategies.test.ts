import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalEquals } from "../../machines/action-validation";
import { configureSearch, DEFAULT_SEARCH } from "./ai-search";
import {
  ALL_STRATEGIES,
  DEFAULT_STRATEGY,
  getStrategy,
  pickAiAction,
  registerStrategy,
} from "./ai-strategies";
import { applyAction, createInitialState, settleTrick } from "./game-engine";
import { configureTenka, DEFAULT_TENKA } from "./mcts";
import { getActivePlayer, getLegalActions } from "./rules";
import { baseState, setFactions } from "./test-helpers";
import type { AIStrategy, GameState } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("strategies", () => {
  it("every registered strategy returns one of the engine's legal actions at every decision", () => {
    // Shōgun searches at every decision below; a tiny budget keeps this a
    // legality check rather than a benchmark.
    const live = { ...DEFAULT_SEARCH };
    configureSearch({ determinizations: 1, rewardCandidates: 2, opponentSearch: 0 });
    const liveTenka = { ...DEFAULT_TENKA };
    configureTenka({ timeMs: 0, iterations: 20, rootSolveDets: 2 });
    const state = createInitialState(4, ["random", "random", "random", "random"], 31);
    let decisions = 0;
    while (state.phase !== "game-over") {
      if (state.phase === "trick-settle") {
        settleTrick(state);
        continue;
      }
      const seat = getActivePlayer(state);
      const legal = getLegalActions(state);
      for (const { id } of ALL_STRATEGIES) {
        const picked = getStrategy(id).pickAction(state, legal, seat);
        expect(
          legal.some((a) => canonicalEquals(a, picked)),
          `${id} in ${state.phase}`,
        ).toBe(true);
      }
      decisions++;
      applyAction(state, getStrategy("random").pickAction(state, legal, seat));
    }
    expect(decisions).toBeGreaterThan(300);
    configureSearch(live);
    configureTenka(liveTenka);
  }, 60_000);

  it("falls back to a legal action when a strategy throws or returns garbage", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const thrower: AIStrategy = {
      id: "random",
      pickAction() {
        throw new Error("boom");
      },
    };
    const garbage: AIStrategy = {
      id: "aggressive",
      pickAction: () => ({ type: "play", card: "oda-14" }),
    };
    const original = { random: getStrategy("random"), aggressive: getStrategy("aggressive") };
    try {
      registerStrategy(thrower);
      registerStrategy(garbage);
      const state = createInitialState(2, ["random", "aggressive"], 5);
      const legal = getLegalActions(state);
      expect(legal.some((a) => canonicalEquals(a, pickAiAction(state, 0, "random")))).toBe(true);
      expect(legal.some((a) => canonicalEquals(a, pickAiAction(state, 0, "aggressive")))).toBe(
        true,
      );
      expect(error).toHaveBeenCalledTimes(2);
    } finally {
      registerStrategy(original.random);
      registerStrategy(original.aggressive);
    }
  });

  it("unknown ids resolve to the default strategy", () => {
    expect(getStrategy("nope").id).toBe(DEFAULT_STRATEGY);
    expect(getStrategy(undefined).id).toBe(DEFAULT_STRATEGY);
  });
});

describe("heuristic-v1 trick play", () => {
  function following(hand: string[], table: { seat: number; card: string }[]): GameState {
    const state = setFactions(baseState(2, 1), ["takeda", "uesugi"]);
    state.trumpSuit = "mori";
    state.players[1].hand = hand as GameState["players"][number]["hand"];
    state.players[1].tricksWon = 0;
    state.table = table as GameState["table"];
    state.leadSuit = "oda";
    state.turn = 1;
    state.leader = 0;
    return state;
  }

  it("wins with the cheapest winning card when it is last to play", () => {
    const state = following(["oda-7", "oda-13", "takeda-2"], [{ seat: 0, card: "oda-5" }]);
    const picked = pickAiAction(state, 1, "heuristic-v1");
    expect(picked).toEqual({ type: "play", card: "oda-7" });
  });

  it("dumps its lowest card when it cannot win", () => {
    const state = following(["oda-3", "oda-4", "takeda-2"], [{ seat: 0, card: "oda-12" }]);
    const picked = pickAiAction(state, 1, "heuristic-v1");
    expect(picked).toEqual({ type: "play", card: "oda-3" });
  });
});

describe("reward choices", () => {
  it("takes a scoring reward and never passes when a cube can be added for free", () => {
    const state = setFactions(baseState(2, 2), ["takeda", "uesugi"]);
    state.phase = "rewards";
    state.rewardQueue = [{ player: 0, tier: 3, picksLeft: 1, used: [] }];
    const picked = pickAiAction(state, 0, "heuristic-v1");
    expect(picked.type).not.toBe("pass");
  });
});
