import type { BughouseResult } from "@boardgames/core/games/chess-bughouse/schemas";

const BOARD = ["Board A", "Board B"] as const;
const COLOR = (seat: number) => (seat % 2 === 0 ? "White" : "Black");

export function bughouseResultText(result: BughouseResult, names: readonly string[]): string {
  const who = `${names[result.loserSeat] ?? "A player"} (${BOARD[result.board]} ${COLOR(result.loserSeat)})`;
  switch (result.termination) {
    case "checkmate":
      return `${who} was checkmated`;
    case "resign":
      return `${who} resigned`;
    case "timeout":
      return `${who} ran out of time`;
    case "abandon":
      return `${who} left the game`;
  }
}
