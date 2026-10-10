import { z } from "zod";
import { Connect4ConfigSchema } from "./manifest";
import { applyAction, createInitialState } from "./rules";
import { AI_STRATEGY_IDS } from "./strategy-info";
import type { Connect4PlayerView, GameState, MoveRecord, Seat } from "./types";
import { buildPlayerView } from "./view";

const SeatSchema = z.union([z.literal(0), z.literal(1)]);
const CellSchema = z.object({ column: z.number().int().min(0), row: z.number().int().min(0) });

export const Connect4ReplayLogSchema = z.object({
  formatVersion: z.literal(1),
  seed: z.number().int(),
  config: Connect4ConfigSchema,
  strategies: z.array(z.enum(AI_STRATEGY_IDS).nullable()).length(2),
  games: z.array(
    z.object({
      firstPlayer: SeatSchema,
      moves: z.array(
        z.object({
          type: z.enum(["drop", "pop"]),
          column: z.number().int().min(0),
          row: z.number().int().min(0),
          player: SeatSchema,
        }),
      ),
      winner: SeatSchema.nullable(),
      reason: z.enum(["connect", "full", "repetition", "resign", "stalemate"]),
      resigned: SeatSchema.optional(),
      winningCells: z.array(CellSchema),
    }),
  ),
  wins: z.tuple([z.number().int(), z.number().int()]),
  seriesWinner: SeatSchema.nullable(),
});
export type Connect4ReplayLog = z.infer<typeof Connect4ReplayLogSchema>;

export function buildReplayLog(state: GameState): Connect4ReplayLog {
  return {
    formatVersion: 1,
    seed: state.seed,
    config: state.config,
    strategies: [...state.strategies],
    games: state.games,
    wins: state.wins,
    seriesWinner: state.seriesWinner,
  };
}

/** One position of a replayed series. */
export interface ReplayPosition {
  view: Connect4PlayerView;
  /** Which game of the series. */
  game: number;
  /** Moves played in that game so far. */
  ply: number;
  /** The move that led here (none at a game's start). */
  move: MoveRecord | null;
  /** The seat that resigned to end the game here. */
  resigned: Seat | null;
}

/**
 * Every position of a finished series, rebuilt by the engine itself from its
 * log: each game's opening and the position after each move, a resigned
 * game ending on the resignation. Seats are replayed as people (so the log's
 * resignations and "next game" are legal for any seat); the views carry the
 * log's own strategies. Throws if the log doesn't replay to its own result.
 */
export function replayPositions(log: Connect4ReplayLog): ReplayPosition[] {
  const state = createInitialState([null, null], log.config, log.seed);
  const positions: ReplayPosition[] = [];
  const record = (game: number, ply: number, move: MoveRecord | null, resigned: Seat | null) => {
    const view = structuredClone(buildPlayerView(state));
    positions.push({
      view: { ...view, strategies: [...log.strategies] },
      game,
      ply,
      move,
      resigned,
    });
  };
  log.games.forEach((game, g) => {
    if (g > 0) applyAction(state, { type: "continue" }, game.firstPlayer);
    if (state.firstPlayer !== game.firstPlayer) {
      throw new Error(
        `Replay: game ${g + 1} opens with seat ${state.firstPlayer}, log says ${game.firstPlayer}`,
      );
    }
    const resigned = game.reason === "resign" ? (game.resigned ?? null) : null;
    if (game.moves.length === 0 && resigned !== null) {
      applyAction(state, { type: "resign" }, resigned);
      record(g, 0, null, resigned);
      return;
    }
    record(g, 0, null, null);
    game.moves.forEach((move, i) => {
      const action =
        move.type === "drop"
          ? { type: "drop" as const, column: move.column }
          : { type: "pop" as const, column: move.column };
      applyAction(state, action, move.player);
      const last = i === game.moves.length - 1;
      if (last && resigned !== null) applyAction(state, { type: "resign" }, resigned);
      record(g, i + 1, move, last ? resigned : null);
    });
  });
  if (state.phase !== "game-over" || state.seriesWinner !== log.seriesWinner) {
    throw new Error("Replay: the log does not replay to its own result");
  }
  return positions;
}
