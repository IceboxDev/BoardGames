import type { RankedOutcome } from "../../machines/outcome";
import type { GameState } from "./types";

/**
 * Durak has no winner — only a loser, the durak, left holding cards. Every
 * other seat shares first place; no durak (everyone out together) is a draw.
 */
export function durakOutcome(state: GameState): RankedOutcome {
  const seats = state.players.length;
  return {
    kind: "ranked",
    placements: state.players.map((_, seat) => (state.durak === seat ? seats : 1)),
  };
}
