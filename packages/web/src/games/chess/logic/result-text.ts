import type { ChessResult } from "@boardgames/core/games/chess/schemas";

const SIDE = { w: "White", b: "Black" } as const;

/** One line saying how the game ended: "Black resigned", "Draw by stalemate". */
export function resultText(result: ChessResult): string {
  const winner = result.winner ? SIDE[result.winner] : null;
  const loser = result.winner ? SIDE[result.winner === "w" ? "b" : "w"] : null;
  switch (result.termination) {
    case "checkmate":
      return `${winner} wins by checkmate`;
    case "resign":
      return `${loser} resigned`;
    case "timeout":
      return `${loser} ran out of time`;
    case "timeout-vs-insufficient":
      return "Time ran out, but the opponent couldn't mate — a draw";
    case "abandon":
      return winner ? `${loser} left the game` : "Abandoned — a draw";
    case "stalemate":
      return "Draw by stalemate";
    case "insufficient":
      return "Draw — neither side can mate";
    case "threefold":
      return "Draw by threefold repetition";
    case "fivefold":
      return "Draw by fivefold repetition";
    case "fifty-move":
      return "Draw by the fifty-move rule";
    case "seventy-five-move":
      return "Draw by the seventy-five-move rule";
    case "agreement":
      return "Draw by agreement";
  }
}

const WON_BY: Partial<Record<ChessResult["termination"], { won: string; lost: string }>> = {
  checkmate: { won: "Won · checkmate", lost: "Checkmated" },
  resign: { won: "Won · resignation", lost: "Resigned" },
  timeout: { won: "Won · on time", lost: "Out of time" },
  abandon: { won: "Won · opponent left", lost: "Left" },
};

const DRAWN_BY: Record<ChessResult["termination"], string> = {
  checkmate: "",
  resign: "",
  timeout: "",
  "timeout-vs-insufficient": "time out, no mate",
  abandon: "abandoned",
  stalemate: "stalemate",
  insufficient: "no mating material",
  threefold: "repetition",
  fivefold: "repetition",
  "fifty-move": "50 moves",
  "seventy-five-move": "75 moves",
  agreement: "agreed",
};

/** What each player strip says about the result: "Won · checkmate" / "Checkmated", or "½ · stalemate". */
export function resultBadges(
  result: ChessResult,
): Record<"w" | "b", { text: string; tone: "emerald" | "rose" | "neutral" }> {
  if (result.winner === null) {
    const badge = { text: `½ · ${DRAWN_BY[result.termination]}`, tone: "neutral" as const };
    return { w: badge, b: badge };
  }
  const words = WON_BY[result.termination] ?? { won: "Won", lost: "Lost" };
  const won = { text: words.won, tone: "emerald" as const };
  const lost = { text: words.lost, tone: "rose" as const };
  return result.winner === "w" ? { w: won, b: lost } : { w: lost, b: won };
}
