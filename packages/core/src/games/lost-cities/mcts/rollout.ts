import {
  applyDrawFast,
  applyPlayFast,
  countUnplayedPlayableToOwnExpeditions,
  getLegalDrawsInto,
  getLegalPlaysInto,
  scorePlayerFast,
} from "./fast-game";
import type { DrawActionFast, FastState, PlayActionFast } from "./types";

export type PickPlayBufFn = (s: FastState, buf: PlayActionFast[], count: number) => PlayActionFast;
export type PickDrawBufFn = (s: FastState, buf: DrawActionFast[], count: number) => DrawActionFast;

export interface RolloutOptions {
  terminalUnplayedPenaltyPerCard?: number;
}

export function rollout(
  s: FastState,
  aiPlayer: number,
  hPickPlay: PickPlayBufFn,
  hPickDraw: PickDrawBufFn,
  options?: RolloutOptions,
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

  let raw = scorePlayerFast(s, aiPlayer) - scorePlayerFast(s, 1 - aiPlayer);
  const pen = options?.terminalUnplayedPenaltyPerCard;
  if (pen !== undefined && pen > 0) {
    raw -= pen * countUnplayedPlayableToOwnExpeditions(s, aiPlayer);
    raw += pen * countUnplayedPlayableToOwnExpeditions(s, 1 - aiPlayer);
  }
  return raw;
}
