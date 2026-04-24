import { getLegalActions } from "./rules";
import type { Action, AIStrategyId, GameState } from "./types";

export interface AIStrategy {
  pickAction(state: GameState, legal: Action[], player: number): Action;
}

const strategies: Record<AIStrategyId, AIStrategy> = {
  random: { pickAction: pickRandom },
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
