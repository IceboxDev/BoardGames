import { createRng } from "../../lib/rng";
import { matchLegalAction } from "../../machines/action-validation";
import { pickBonus, pickReward } from "./ai-rewards";
import {
  DEFAULT_SEARCH,
  pickPlaySearch,
  pickRewardSearch,
  resetSearchStats,
  type SearchOptions,
  takeSearchStats,
} from "./ai-search";
import { type Mode, pickPlay } from "./ai-tricks";
import { TENKA } from "./mcts";
import { getLegalActions } from "./rules";
import type { Action, AIStrategy, AIStrategyId, AiBudget, GameState } from "./types";
import { AI_STRATEGY_LABELS } from "./types";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, AIStrategy> = {};

export function registerStrategy(strategy: AIStrategy): void {
  REGISTRY[strategy.id] = strategy;
}

export const DEFAULT_STRATEGY: AIStrategyId = "tenka";

/** Unknown ids fall back to the default so a stale lobby id cannot wedge a seat. */
export function getStrategy(id: string | undefined): AIStrategy {
  return REGISTRY[id ?? DEFAULT_STRATEGY] ?? REGISTRY[DEFAULT_STRATEGY];
}

/** Strongest first — the lobby and the tournament grid list them in this order. */
export const ALL_STRATEGIES: { id: AIStrategyId; label: string }[] = [
  { id: "tenka", label: AI_STRATEGY_LABELS.tenka },
  { id: "shogun", label: AI_STRATEGY_LABELS.shogun },
  { id: "heuristic-v1", label: AI_STRATEGY_LABELS["heuristic-v1"] },
  { id: "aggressive", label: AI_STRATEGY_LABELS.aggressive },
  { id: "random", label: AI_STRATEGY_LABELS.random },
];

/**
 * Pick the active AI seat's action, guaranteeing a member of the engine's own
 * legal list: a strategy that throws or returns something illegal falls back
 * to `pass` (or the first legal action) and logs, so a broken strategy can
 * never wedge the machine in its AI state.
 */
export function pickAiAction(
  state: GameState,
  seat: number,
  strategyId: string | undefined,
  budget?: AiBudget,
): Action {
  const legal = getLegalActions(state);
  if (legal.length === 0) throw new Error("AI has no legal actions");
  const fallback = legal.find((a) => a.type === "pass") ?? legal[0];
  const strategy = getStrategy(strategyId);
  let chosen: Action;
  try {
    chosen = strategy.pickAction(state, legal, seat, budget);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[senso] AI strategy "${strategy.id}" threw: ${message}`);
    return fallback;
  }
  const match = matchLegalAction(legal, chosen);
  if (!match) {
    console.error(`[senso] AI strategy "${strategy.id}" returned an illegal action`);
    return fallback;
  }
  return match;
}

/** `pickAiAction` plus wall-clock and work counters, for the bench and the server's timing. */
export function pickAiActionTimed(
  state: GameState,
  seat: number,
  strategyId: string | undefined,
  budget?: AiBudget,
): { action: Action; ms: number; iterations: number } {
  resetSearchStats();
  const t0 = performance.now();
  const action = pickAiAction(state, seat, strategyId, budget);
  return { action, ms: performance.now() - t0, iterations: takeSearchStats().iterations };
}

// ---------------------------------------------------------------------------
// Deterministic randomness: keyed on the seed and the decision point, so a
// seeded game with `random` seats replays identically.
// ---------------------------------------------------------------------------

function decisionRng(state: GameState): () => number {
  const point =
    state.round * 10_000 +
    state.trickNumber * 100 +
    state.table.length * 10 +
    state.rewardQueue.length * 7 +
    state.affected.length * 3 +
    state.bonusQueue.length +
    state.played.length * 1_000;
  return createRng((state.seed ^ Math.imul(point, 0x2545f491)) | 0);
}

function dispatchGreedy(state: GameState, legal: Action[], seat: number, mode: Mode): Action {
  switch (state.phase) {
    case "trick":
      return pickPlay(state, legal, seat, mode);
    case "rewards":
      return pickReward(state, legal, seat, mode);
    case "bonus":
      return pickBonus(state, legal, seat);
    default:
      return legal[0];
  }
}

// ---------------------------------------------------------------------------
// The strategies
// ---------------------------------------------------------------------------

export const RANDOM: AIStrategy = {
  id: "random",
  pickAction(state, legal) {
    return legal[Math.floor(decisionRng(state)() * legal.length)];
  },
};

export const HEURISTIC_V1: AIStrategy = {
  id: "heuristic-v1",
  pickAction(state, legal, seat) {
    return dispatchGreedy(state, legal, seat, "careful");
  },
};

export const AGGRESSIVE: AIStrategy = {
  id: "aggressive",
  pickAction(state, legal, seat) {
    return dispatchGreedy(state, legal, seat, "aggressive");
  },
};

/** A search strategy with fixed options — for A/B runs in `run-tournament.ts`. */
export function searchStrategy(id: AIStrategy["id"], opts: () => SearchOptions): AIStrategy {
  return {
    id,
    pickAction(state, legal, seat, budget) {
      // A wall-clock budget caps the sample loop; the configured sample count
      // remains the ceiling, so iteration-capped runs stay deterministic.
      const o = budget && budget.timeMs > 0 ? { ...opts(), timeMs: budget.timeMs } : opts();
      switch (state.phase) {
        case "trick":
          return pickPlaySearch(state, legal, seat, o);
        case "rewards":
          return pickRewardSearch(state, legal, seat, o);
        case "bonus":
          return pickBonus(state, legal, seat);
        default:
          return legal[0];
      }
    },
  };
}

export const SHOGUN: AIStrategy = searchStrategy("shogun", () => DEFAULT_SEARCH);

registerStrategy(TENKA);
registerStrategy(SHOGUN);
registerStrategy(HEURISTIC_V1);
registerStrategy(AGGRESSIVE);
registerStrategy(RANDOM);
