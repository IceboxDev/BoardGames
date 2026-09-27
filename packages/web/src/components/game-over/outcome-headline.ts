import { type GameOutcome, seatPlacement, seatResult } from "@boardgames/core/machines/outcome";
import { ordinal } from "../../lib/match-result-badge";

export interface OutcomeHeadline {
  readonly headline: string;
  readonly color: "win" | "lose" | "draw" | "neutral";
}

/**
 * The game-over headline from one seat's point of view, for any game: the
 * winner and loser of a duel, the place at a bigger table, the team's result,
 * or the whole table's in a co-op game.
 */
export function outcomeHeadline(outcome: GameOutcome | null, seat: number): OutcomeHeadline {
  if (!outcome) return { headline: "Game over", color: "neutral" };
  const result = seatResult(outcome, seat);
  switch (outcome.kind) {
    case "coop":
      return outcome.won
        ? { headline: "Victory!", color: "win" }
        : { headline: "Defeat", color: "lose" };
    case "teams":
      if (result === "draw") return { headline: "Draw!", color: "draw" };
      return result === "win"
        ? { headline: "Your team wins!", color: "win" }
        : { headline: "Your team lost", color: "lose" };
    case "ranked": {
      if (result === "draw") return { headline: "Draw!", color: "draw" };
      if (result === "win") {
        const shared = outcome.placements.filter((p) => p === 1).length > 1;
        return { headline: shared ? "You tie for first!" : "You win!", color: "win" };
      }
      const place = seatPlacement(outcome, seat);
      return outcome.placements.length > 2 && place !== null
        ? { headline: `You finished ${ordinal(place)}`, color: "lose" }
        : { headline: "You lose", color: "lose" };
    }
  }
}
