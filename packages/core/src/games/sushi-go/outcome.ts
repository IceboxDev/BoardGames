import { type RankedOutcome, rankedByKeys } from "../../machines/outcome";
import type { GameState } from "./types";

/**
 * Highest total wins; a tie is broken by the most puddings, and seats still
 * level on both share the place.
 */
export function sushiGoOutcome(state: GameState): RankedOutcome {
  return rankedByKeys(state.players.map((p, seat) => [state.totalScores[seat] ?? 0, p.puddings]));
}
