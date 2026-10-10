import { type RankedOutcome, rankedByWinners } from "../../machines/outcome";
import type { GameState } from "./types";

/** The series result: its winner first, both seats first on a tied series; games won as scores. */
export function connect4Outcome(state: GameState): RankedOutcome {
  const winners = state.seriesWinner === null ? [] : [state.seriesWinner];
  return rankedByWinners(2, winners, state.wins);
}
