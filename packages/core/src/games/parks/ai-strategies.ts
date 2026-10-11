import { applyActionPure } from "./game-engine";
import { getLegalActions } from "./rules";
import { scorePlayer } from "./scoring";
import type { Action, AIStrategyId, GameState, PlayerState } from "./types";

export interface AIStrategy {
  pickAction(state: GameState, legal: Action[], player: number): Action;
}

const strategies: Record<AIStrategyId, AIStrategy> = {
  random: { pickAction: pickRandom },
  greedy: { pickAction: pickGreedy },
};

export function getStrategy(id: AIStrategyId): AIStrategy {
  return strategies[id];
}

function pickRandom(_state: GameState, legal: Action[]): Action {
  return legal[Math.floor(Math.random() * legal.length)];
}

export function getAILegalActions(state: GameState): Action[] {
  return getLegalActions(state, state.activePlayer);
}

// ── Greedy ────────────────────────────────────────────────────────────────

/**
 * Follow-up choices a move opens (a canteen to draw, a row to place it in, a
 * park to buy) are searched this deep, so a move is valued by the best way to
 * finish it rather than by the half-resolved state it leaves.
 */
const FOLLOW_UP_DEPTH = 3;

/** Points are what count; resources and canteens are worth a fraction of one. */
const POINT = 10;
const RESOURCE_VALUE = { M: 3, F: 3, S: 2.5, W: 2.5, A: 4 } as const;
const CANTEEN = 3;
const RESERVED_PARK = 4;

/**
 * One-turn greedy: try every legal action, finish any choice it opens with the
 * same rule, and keep the action whose result values highest for the mover —
 * points first, then resources, canteens and reserved parks. Ties keep the
 * earliest action, so the strategy is deterministic.
 *
 * Lookahead runs on a copy whose generator is re-seeded, so a move that rolls
 * the trail die or draws blind is valued on an imagined roll — never on the
 * real one the game is about to make.
 */
function pickGreedy(state: GameState, legal: Action[], player: number): Action {
  const blind: GameState = { ...state, rngState: Math.imul(state.rngState ^ 0x5bd1e995, 31) | 0 };
  let best = legal[0];
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const action of legal) {
    const value = valueAfter(blind, action, player, FOLLOW_UP_DEPTH);
    if (value > bestValue) {
      bestValue = value;
      best = action;
    }
  }
  return best;
}

function valueAfter(state: GameState, action: Action, player: number, depth: number): number {
  let next: GameState;
  try {
    next = applyActionPure(state, action);
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
  if (depth > 1 && next.phase !== "game-over" && next.activePlayer === player) {
    const followUps = getLegalActions(next, player);
    // A fresh "playing" phase is the mover's next turn, not a follow-up choice.
    if (followUps.length > 0 && next.phase !== "playing") {
      let best = Number.NEGATIVE_INFINITY;
      for (const f of followUps) best = Math.max(best, valueAfter(next, f, player, depth - 1));
      return best;
    }
  }
  return evaluate(next, player);
}

/** The mover's position, minus the opponent's, so denying a park counts too. */
export function evaluate(state: GameState, player: number): number {
  const mine = state.players[player];
  const theirs = state.players[1 - player];
  if (!mine || !theirs) return 0;
  return worth(mine) - 0.5 * worth(theirs);
}

function worth(p: PlayerState): number {
  let value = scorePlayer(p).total * POINT;
  for (const r of ["M", "F", "S", "W", "A"] as const) value += p.resources[r] * RESOURCE_VALUE[r];
  value += p.canteens.length * CANTEEN;
  value += p.reservedParks.length * RESERVED_PARK;
  return value;
}
