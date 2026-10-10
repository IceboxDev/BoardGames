import {
  type Connect4ReplayLog,
  replayPositions,
} from "@boardgames/core/games/connect-4/replay-log";
import type { GameRecord } from "@boardgames/core/games/connect-4/types";

export interface ReplayedSeries {
  cols: number;
  rows: number;
  popOut: boolean;
  /** Every game of the series, as the engine finished it. */
  games: GameRecord[];
  wins: readonly number[];
}

/**
 * A logged series rebuilt by the engine (`replayPositions`): its board, its
 * rules and every finished game, for the analysis board. Null when the log
 * doesn't replay to its own result.
 */
export function replayGames(log: Connect4ReplayLog): ReplayedSeries | null {
  let positions: ReturnType<typeof replayPositions>;
  try {
    positions = replayPositions(log);
  } catch {
    return null;
  }
  const end = positions.at(-1)?.view;
  if (!end || end.games.length === 0) return null;
  return {
    cols: end.cols,
    rows: end.rows,
    popOut: end.config.popOut,
    games: end.games,
    wins: end.wins,
  };
}
