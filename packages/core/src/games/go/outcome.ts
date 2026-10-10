import { type GameOutcome, rankedByScore, rankedByWinners } from "../../machines/outcome";
import type { GoResult } from "./view";

/** Seat = colour, so placements and scores index by colour. */
export function goOutcome(result: GoResult): GameOutcome {
  if (result.reason === "score" && result.breakdown) {
    return rankedByScore([result.breakdown.black.total, result.breakdown.white.total]);
  }
  return rankedByWinners(2, result.winner === null ? [] : [result.winner]);
}
