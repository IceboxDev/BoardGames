import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalEquals } from "../../machines/action-validation";
import {
  applyLight,
  evalPosition,
  finishRewardsGreedy,
  lightClone,
  pickReward,
} from "./ai-rewards";
import { configureSearch, DEFAULT_SEARCH, tierTable } from "./ai-search";
import {
  ALL_STRATEGIES,
  DEFAULT_STRATEGY,
  getStrategy,
  pickAiAction,
  registerStrategy,
} from "./ai-strategies";
import { applyAction, createInitialState, settleTrick } from "./game-engine";
import { configureTenka, DEFAULT_TENKA, pickRewardTenka } from "./mcts";
import { getActivePlayer, getLegalActions } from "./rules";
import { baseState, setBoard, setFactions } from "./test-helpers";
import type { Action, AIStrategy, GameState } from "./types";

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

describe("the Emperor's rewards under the live ruleset", () => {
  // Region 0 holds a lone Takeda cube; everything else is empty. The Emperor
  // scores per empty-or-uncontrolled region, so the ONE reward that gains it
  // anything is striking that cube off the map — which only exists because
  // its Aggression removes without replacing. Every engine must see it.
  function emperorFocus(): GameState {
    const state = setFactions(baseState(5, 4), [null, "takeda", "uesugi", "oda", "mori"]);
    setBoard(state, ["t..", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    state.round = 3;
    state.phase = "rewards";
    for (const p of state.players) p.hand = [];
    state.rewardQueue = [{ player: 0, tier: 7, picksLeft: 2, used: [] }];
    return state;
  }

  it("every strategy picks a legal action for the Emperor, and the greedy policy empties the region", () => {
    const live = { ...DEFAULT_SEARCH };
    configureSearch({ determinizations: 1, rewardCandidates: 4, opponentSearch: 0 });
    try {
      const state = emperorFocus();
      const legal = getLegalActions(state);
      const strike = legal.find((a) => a.type === "aggression");
      expect(strike).toEqual({ type: "aggression", region: 0, square: 0 });
      for (const { id } of ALL_STRATEGIES) {
        const picked = pickAiAction(state, 0, id);
        expect(legal.some((a) => canonicalEquals(a, picked))).toBe(true);
        if (picked.type === "aggression") expect("as" in picked).toBe(false);
      }
      for (const id of ["heuristic-v1", "aggressive", "shogun", "tenka"] as const) {
        expect(pickAiAction(state, 0, id)).toEqual(strike);
      }
      expect(pickReward(state, legal, 0, "careful")).toEqual(strike);
      const sim = applyLight(state, strike as Action);
      expect(sim.board[0]).toEqual([null, null, null]);
      expect(evalPosition(sim, 0) - evalPosition(state, 0)).toBeGreaterThan(0);
    } finally {
      configureSearch(live);
    }
  });

  it("the models of the table (tier table, greedy finish, Tenka's max^n) play the Emperor's strike as a removal", () => {
    const state = emperorFocus();
    // Takeda's view: the Emperor's tier-5 reward costs Takeda its only cube.
    const takeda = tierTable(state, 1);
    expect(takeda[0][3]).toBeLessThan(0);
    // The Emperor's own view: the same reward gains it a region.
    const emperor = tierTable(state, 0);
    expect(emperor[0][3]).toBeGreaterThan(0);

    const greedy = lightClone(state);
    finishRewardsGreedy(greedy);
    expect(greedy.board[0]).toEqual([null, null, null]);
    expect(greedy.supply.takeda).toBe(state.supply.takeda + 1);

    const legal = getLegalActions(state);
    const cfg = { ...DEFAULT_TENKA, rewardTimeMs: 0, rewardWidth: 3 };
    const picked = pickRewardTenka(state, legal, 0, cfg);
    expect(picked).toEqual({ type: "aggression", region: 0, square: 0 });
  });
});
