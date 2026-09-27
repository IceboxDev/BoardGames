import { type RankedOutcome, rankedByScore } from "../../machines/outcome";
import { scoreGame } from "./scoring";
import type { GameState } from "./types";

/** Higher expedition total wins; equal totals draw. */
export function lostCitiesOutcome(state: GameState): RankedOutcome {
  return rankedByScore(scoreGame(state).map((s) => s.total));
}
