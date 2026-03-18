import {
  applyDrawFast,
  applyPlayFast,
  getLegalDraws,
  getLegalPlays,
  scorePlayerFast,
} from "./fast-game";
import type { FastState, PickDrawFn, PickPlayFn } from "./types";

export function rollout(
  s: FastState,
  aiPlayer: number,
  hPickPlay: PickPlayFn,
  hPickDraw: PickDrawFn,
): number {
  while (!s.gameOver) {
    if (s.turnPhase === 0) {
      const plays = getLegalPlays(s);
      const chosen = hPickPlay(s, plays);
      applyPlayFast(s, chosen);
    } else {
      const draws = getLegalDraws(s);
      const chosen = hPickDraw(s, draws);
      applyDrawFast(s, chosen);
    }
  }

  return scorePlayerFast(s, aiPlayer) - scorePlayerFast(s, 1 - aiPlayer);
}
