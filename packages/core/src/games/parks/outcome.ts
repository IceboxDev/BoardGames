import { type RankedOutcome, rankedByKeys } from "../../machines/outcome";
import { scorePlayer } from "./scoring";
import type { GameState } from "./types";

/**
 * Most points wins; a tie is broken by the most parks visited, and seats still
 * level on both share the place.
 */
export function parksOutcome(state: GameState): RankedOutcome {
  return rankedByKeys(state.players.map((p) => [scorePlayer(p).total, p.parks.length]));
}
