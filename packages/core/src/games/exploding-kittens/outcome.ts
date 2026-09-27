import { type RankedOutcome, rankedByWinners } from "../../machines/outcome";
import type { GameState } from "./types";

/** The last cat standing wins; everyone who exploded shares second. */
export function explodingKittensOutcome(state: GameState): RankedOutcome {
  return rankedByWinners(state.players.length, state.winner === null ? [] : [state.winner]);
}
