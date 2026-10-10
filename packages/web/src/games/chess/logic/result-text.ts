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
