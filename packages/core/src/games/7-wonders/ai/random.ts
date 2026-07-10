import type { Rng } from "../../../lib/rng";
import { defaultRng } from "../../../lib/rng";
import { getLegalActions } from "../rules";
import type { GameState, SevenWondersAction } from "../types";

/**
 * v1 AI stub: a uniformly random legal action. Wired through the same actor
 * shape as the other games' AIs so a heuristic can replace this function
 * without touching the machine.
 */
export function randomLegalAction(
  state: GameState,
  playerIndex: number,
  rng: Rng = defaultRng,
): SevenWondersAction | null {
  const actions = getLegalActions(state, playerIndex);
  if (actions.length === 0) return null;
  return actions[Math.floor(rng() * actions.length)];
}
