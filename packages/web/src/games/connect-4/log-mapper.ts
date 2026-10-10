import type { GameRecord, MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";
import type { LogAction, LogBlock } from "../../components/action-log";
import { seatInk } from "./components/board/palette";
import { endWords, seatName } from "./logic/text";

function who(seat: Seat, names: readonly string[]) {
  return { text: seatName(seat, names), bold: true, color: seatInk(seat) };
}

function moveLine(move: MoveRecord, index: number, names: readonly string[]): LogAction {
  return {
    key: index,
    icon: move.type === "drop" ? "↓" : "↑",
    variant: "action",
    spans: [
      who(move.player, names),
      move.type === "drop"
        ? ` drops in column ${move.column + 1}`
        : ` pops column ${move.column + 1}`,
    ],
  };
}

const END_LINE: Record<GameRecord["reason"], Pick<LogAction, "icon" | "variant">> = {
  connect: { icon: "★", variant: "success" },
  resign: { icon: "⚑", variant: "warning" },
  full: { icon: "=", variant: "neutral" },
  repetition: { icon: "=", variant: "neutral" },
  stalemate: { icon: "=", variant: "neutral" },
};

function endLine(game: GameRecord, names: readonly string[]): LogAction {
  const words = endWords(game, names);
  return {
    key: "end",
    ...END_LINE[game.reason],
    spans: words.actor === null ? [words.log] : [who(words.actor, names), words.log],
  };
}

/**
 * The History rail: one block per game of the series, every move in order,
 * then how the game ended. The game in progress comes last.
 */
export function mapConnect4Log(
  games: readonly GameRecord[],
  current: { moves: readonly MoveRecord[]; inProgress: boolean },
  names: readonly string[],
): LogBlock[] {
  const blocks: LogBlock[] = games.map((game, i) => ({
    key: i,
    label: `Game ${i + 1}`,
    actions: [...game.moves.map((m, j) => moveLine(m, j, names)), endLine(game, names)],
  }));
  if (current.inProgress) {
    blocks.push({
      key: games.length,
      label: `Game ${games.length + 1}`,
      actions: current.moves.map((m, j) => moveLine(m, j, names)),
    });
  }
  return blocks;
}
