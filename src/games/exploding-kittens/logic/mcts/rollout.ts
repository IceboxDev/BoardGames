import { applyActionFast, getActivePlayerFast, getLegalActionsFast } from "./fast-game";
import type { FastAction, FastState } from "./types";
import { PH_GAME_OVER } from "./types";

const MAX_ROLLOUT_STEPS = 500;

export type RolloutPolicy = (s: FastState, actions: FastAction[], player: number) => FastAction;

export function randomPolicy(_s: FastState, actions: FastAction[], _player: number): FastAction {
  return actions[Math.floor(Math.random() * actions.length)];
}

export function rollout(s: FastState, aiPlayer: number, policy: RolloutPolicy): number {
  let steps = 0;

  while (!s.gameOver && s.phase !== PH_GAME_OVER && steps < MAX_ROLLOUT_STEPS) {
    const actions = getLegalActionsFast(s);
    if (actions.length === 0) break;

    const activePlayer = getActivePlayerFast(s);
    const chosen = policy(s, actions, activePlayer);
    applyActionFast(s, chosen);
    steps++;
  }

  if (s.winner === aiPlayer) return 1.0;
  if (s.winner >= 0) return 0.0;
  return 0.5;
}
