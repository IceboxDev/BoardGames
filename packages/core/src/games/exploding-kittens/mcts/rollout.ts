import { applyAction } from "../game-engine";
import { getActiveDecider, getLegalActions } from "../rules";
import type { Action, GameState } from "../types";

const MAX_ROLLOUT_STEPS = 500;

export type RolloutPolicy = (s: GameState, actions: Action[], player: number) => Action;

export function randomPolicy(_s: GameState, actions: Action[], _player: number): Action {
  return actions[Math.floor(Math.random() * actions.length)];
}

export function rollout(s: GameState, aiPlayer: number, policy: RolloutPolicy): number {
  let steps = 0;

  while (s.phase !== "game-over" && steps < MAX_ROLLOUT_STEPS) {
    const actions = getLegalActions(s);
    if (actions.length === 0) break;

    const activePlayer = getActiveDecider(s);
    const chosen = policy(s, actions, activePlayer);
    applyAction(s, chosen);
    steps++;
  }

  if (s.winner === aiPlayer) return 1.0;
  if (s.winner !== null && s.winner >= 0) return 0.0;
  return 0.5;
}
