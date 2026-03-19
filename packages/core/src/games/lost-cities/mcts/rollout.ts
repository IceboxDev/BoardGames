import {
  applyDrawFast,
  applyPlayFast,
  getLegalDrawsInto,
  getLegalPlaysInto,
  scorePlayerFast,
} from "./fast-game";
import type { DrawActionFast, FastState, PlayActionFast } from "./types";

export type PickPlayBufFn = (s: FastState, buf: PlayActionFast[], count: number) => PlayActionFast;
export type PickDrawBufFn = (s: FastState, buf: DrawActionFast[], count: number) => DrawActionFast;

export function rollout(
  s: FastState,
  aiPlayer: number,
  hPickPlay: PickPlayBufFn,
  hPickDraw: PickDrawBufFn,
): number {
  while (!s.gameOver) {
    if (s.turnPhase === 0) {
      const { buffer, count } = getLegalPlaysInto(s);
      const chosen = hPickPlay(s, buffer, count);
      applyPlayFast(s, chosen);
    } else {
      const { buffer, count } = getLegalDrawsInto(s);
      const chosen = hPickDraw(s, buffer, count);
      applyDrawFast(s, chosen);
    }
  }

  return scorePlayerFast(s, aiPlayer) - scorePlayerFast(s, 1 - aiPlayer);
}
