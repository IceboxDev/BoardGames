/**
 * Bughouse as pure data: two chess games whose captures feed each other's
 * pockets. A piece taken on one board goes to the capturer's PARTNER (the
 * other board, opposite colour); a promoted piece goes as a pawn. The first
 * mate, flag, resignation or abandonment on either board ends the whole game.
 *
 * Seats: 0 = A-White, 1 = A-Black, 2 = B-White, 3 = B-Black.
 * Teams: 0 = seats 0 & 3, 1 = seats 1 & 2.
 */

import { stopClock } from "../chess/clock";
import { opposite } from "../chess/engine/board";
import { toFen } from "../chess/engine/fen";
import type { Color, PocketType } from "../chess/engine/types";
import {
  type ChessGame,
  createGame,
  flagGame,
  isFlagged,
  legalUcis,
  playMove,
} from "../chess/game";
import type { TimeControl } from "../chess/schemas";
import type { BughouseReplayMove, BughouseResult, Signal, SignalCode } from "./schemas";

export type BoardIndex = 0 | 1;
export type Team = 0 | 1;

export const boardOf = (seat: number): BoardIndex => (seat < 2 ? 0 : 1);
export const colorOf = (seat: number): Color => (seat % 2 === 0 ? "w" : "b");
export const seatAt = (board: BoardIndex, color: Color): number =>
  board * 2 + (color === "w" ? 0 : 1);
export const teamOf = (seat: number): Team => (seat === 0 || seat === 3 ? 0 : 1);
export const partnerOf = (seat: number): number => 3 - seat;
export const TEAM_OF: readonly Team[] = [0, 1, 1, 0];

/** Signals kept per game; older ones scroll away. */
const MAX_SIGNALS = 20;

export interface BughouseGame {
  readonly boards: readonly [ChessGame, ChessGame];
  readonly startedAt: number;
  readonly moves: readonly BughouseReplayMove[];
  readonly signals: readonly Signal[];
  readonly result: BughouseResult | null;
}

export function createBughouse(timeControl: TimeControl | null, now: number): BughouseGame {
  const board = () => createGame({ timeControl, now, bughouse: true });
  return { boards: [board(), board()], startedAt: now, moves: [], signals: [], result: null };
}

/** Moves the seat may play now (its board, its turn), as UCI. */
export function seatMoves(game: BughouseGame, seat: number): string[] {
  if (game.result) return [];
  const board = game.boards[boardOf(seat)];
  if (board.position.turn !== colorOf(seat)) return [];
  return legalUcis(board);
}

function withPocket(board: ChessGame, color: Color, type: PocketType): ChessGame {
  const pockets = board.position.pockets;
  if (!pockets) return board;
  const mine = pockets[color];
  return {
    ...board,
    position: {
      ...board.position,
      pockets: { ...pockets, [color]: { ...mine, [type]: mine[type] + 1 } },
    },
  };
}

function finish(game: BughouseGame, result: BughouseResult, now: number): BughouseGame {
  const stop = (b: ChessGame): ChessGame => ({
    ...b,
    clock: b.clock ? stopClock(b.clock, now) : null,
  });
  return { ...game, boards: [stop(game.boards[0]), stop(game.boards[1])], result };
}

/** End the game from a finished board: its winner's team takes the whole match. */
function settleFrom(game: BughouseGame, board: BoardIndex, now: number): BughouseGame {
  const res = game.boards[board].result;
  if (!res?.winner) return game;
  const loserSeat = seatAt(board, opposite(res.winner));
  const termination =
    res.termination === "checkmate"
      ? "checkmate"
      : res.termination === "resign"
        ? "resign"
        : "timeout";
  return finish(
    game,
    { winningTeam: teamOf(seatAt(board, res.winner)), board, loserSeat, termination },
    now,
  );
}

/** Play a legal move for `seat` (checked by the caller against `seatMoves`). */
export function playBughouseMove(
  game: BughouseGame,
  seat: number,
  uci: string,
  now: number,
): BughouseGame {
  if (game.result) return game;
  const b = boardOf(seat);
  const other: BoardIndex = b === 0 ? 1 : 0;
  const played = playMove(game.boards[b], uci, now);
  let boards: [ChessGame, ChessGame] = [game.boards[0], game.boards[1]];
  boards[b] = played.game;
  // The capture crosses the table to the partner — the same colour as the captured piece.
  if (played.captured && played.captured !== "k") {
    boards[other] = withPocket(boards[other], opposite(colorOf(seat)), played.captured);
  }
  boards = [boards[0], boards[1]];
  const last = played.game.history.at(-1);
  const moved = last && played.game.history.length > game.boards[b].history.length;
  const next: BughouseGame = {
    ...game,
    boards,
    moves: moved
      ? [
          ...game.moves,
          {
            board: b,
            seat,
            uci,
            san: last.san,
            fenAfter: toFen(boards[b].position),
            otherFenAfter: toFen(boards[other].position),
            at: now - game.startedAt,
          },
        ]
      : game.moves,
  };
  return played.game.result ? settleFrom(next, b, now) : next;
}

/** Has the clock on `board` run out? */
export function boardFlagged(game: BughouseGame, board: BoardIndex, now: number): boolean {
  return !game.result && isFlagged(game.boards[board], now);
}

export function flagBoard(game: BughouseGame, board: BoardIndex, now: number): BughouseGame {
  if (game.result) return game;
  const boards: [ChessGame, ChessGame] = [game.boards[0], game.boards[1]];
  boards[board] = flagGame(boards[board], now);
  return settleFrom({ ...game, boards }, board, now);
}

export function resignSeat(game: BughouseGame, seat: number, now: number): BughouseGame {
  if (game.result) return game;
  return finish(
    game,
    {
      winningTeam: teamOf(seat) === 0 ? 1 : 0,
      board: boardOf(seat),
      loserSeat: seat,
      termination: "resign",
    },
    now,
  );
}

export function abandonSeat(game: BughouseGame, seat: number, now: number): BughouseGame {
  if (game.result) return game;
  return finish(
    game,
    {
      winningTeam: teamOf(seat) === 0 ? 1 : 0,
      board: boardOf(seat),
      loserSeat: seat,
      termination: "abandon",
    },
    now,
  );
}

export function sendSignal(
  game: BughouseGame,
  seat: number,
  code: SignalCode,
  now: number,
): BughouseGame {
  return { ...game, signals: [...game.signals, { seat, code, at: now }].slice(-MAX_SIGNALS) };
}
