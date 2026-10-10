/**
 * A game of chess as pure data and pure transitions: the position, its move
 * history, repetition counts, the clock, standing offers and the result. The
 * machine (`machine.ts`) only routes events here; every rule lives in this file
 * and `engine/`.
 *
 * Bughouse reuses `createGame` / `playMove` per board with `bughouse: true`,
 * which keeps pockets and turns off the draw rules that can't apply there.
 */

import {
  type ClockState,
  flagged,
  pressClock,
  remaining,
  resumeFor,
  startClock,
  stopClock,
} from "./clock";
import { applyMoveDetailed } from "./engine/apply";
import { opposite } from "./engine/board";
import { parseFen, positionKey, START_FEN, toFen } from "./engine/fen";
import { legalMoves } from "./engine/movegen";
import { toSan } from "./engine/san";
import {
  AUTO_HALFMOVES,
  AUTO_REPETITIONS,
  boardState,
  CLAIM_HALFMOVES,
  CLAIM_REPETITIONS,
  hasLoneKing,
  insufficientMaterial,
} from "./engine/status";
import type { Color, PieceType, Position } from "./engine/types";
import { moveToUci } from "./engine/uci";
import type { ChessResult, HistoryEntry, TimeControl } from "./schemas";

export interface ChessGame {
  readonly startFen: string;
  readonly bughouse: boolean;
  readonly position: Position;
  readonly history: readonly HistoryEntry[];
  /** `positionKey` → how many times it has stood on the board. */
  readonly repetitions: Readonly<Record<string, number>>;
  readonly clock: ClockState | null;
  readonly timeControl: TimeControl | null;
  readonly drawOffer: Color | null;
  /** History length when each side last offered — one offer per move. */
  readonly drawOfferedAt: Readonly<Record<Color, number>>;
  readonly takebackRequest: Color | null;
  readonly takebackRequestedAt: Readonly<Record<Color, number>>;
  readonly result: ChessResult | null;
}

const NEVER: Readonly<Record<Color, number>> = { w: -1, b: -1 };

export interface NewGameOptions {
  readonly timeControl: TimeControl | null;
  readonly now: number;
  readonly startFen?: string;
  readonly bughouse?: boolean;
}

export function createGame(opts: NewGameOptions): ChessGame {
  const bughouse = opts.bughouse ?? false;
  const startFen = opts.startFen ?? START_FEN;
  const position = parseFen(startFen, { bughouse });
  return {
    startFen: toFen(position),
    bughouse,
    position,
    history: [],
    repetitions: { [positionKey(position)]: 1 },
    clock: opts.timeControl ? startClock(opts.timeControl, position.turn, opts.now) : null,
    timeControl: opts.timeControl,
    drawOffer: null,
    drawOfferedAt: NEVER,
    takebackRequest: null,
    takebackRequestedAt: NEVER,
    result: null,
  };
}

/** Every legal move for the side to move, as UCI. Empty once the game is over. */
export function legalUcis(game: ChessGame): string[] {
  if (game.result) return [];
  return legalMoves(game.position).map(moveToUci);
}

function finish(game: ChessGame, result: ChessResult, now: number): ChessGame {
  return {
    ...game,
    result,
    clock: game.clock ? stopClock(game.clock, now) : null,
    drawOffer: null,
    takebackRequest: null,
  };
}

/**
 * The running side ran out of time. FIDE 6.9: it is a draw instead when the
 * opponent could not possibly mate — here, when the opponent has a lone king.
 */
export function flagGame(game: ChessGame, now: number): ChessGame {
  const loser = game.clock?.running ?? game.position.turn;
  const winner = opposite(loser);
  const drawn = !game.bughouse && hasLoneKing(game.position, winner);
  return finish(
    game,
    drawn
      ? { winner: null, termination: "timeout-vs-insufficient" }
      : { winner, termination: "timeout" },
    now,
  );
}

/** Has the side to move run out of time at `now`? */
export function isFlagged(game: ChessGame, now: number): boolean {
  return !game.result && game.clock !== null && flagged(game.clock, now);
}

export interface PlayedMove {
  readonly game: ChessGame;
  /** The piece taken (a promoted piece counts as a pawn) — bughouse passes it on. */
  readonly captured: PieceType | null;
}

/**
 * Play a move the caller has checked against `legalUcis`. A move that arrives
 * after the mover's flag fell loses on time instead.
 */
export function playMove(game: ChessGame, uci: string, now: number): PlayedMove {
  if (game.result) return { game, captured: null };
  if (isFlagged(game, now)) return { game: flagGame(game, now), captured: null };

  const before = game.position;
  const legal = legalMoves(before);
  const move = legal.find((m) => moveToUci(m) === uci);
  if (!move) throw new Error(`illegal move ${uci} in ${toFen(before)}`);

  const effects = applyMoveDetailed(before, move);
  const position = effects.position;
  const clock = game.clock ? pressClock(game.clock, now) : null;
  const key = positionKey(position);
  const repetitions = { ...game.repetitions, [key]: (game.repetitions[key] ?? 0) + 1 };
  const mover = before.turn;
  const entry: HistoryEntry = {
    uci,
    san: toSan(before, move, legal),
    by: mover,
    clockMs: clock ? clock.remainingMs[mover] : null,
    captured: effects.captured,
  };

  let next: ChessGame = {
    ...game,
    position,
    history: [...game.history, entry],
    repetitions,
    clock,
    // Moving answers the opponent's offer (declines it) and withdraws a
    // request of one's own that the opponent ignored.
    drawOffer: game.drawOffer === mover ? mover : null,
    takebackRequest: null,
  };

  const state = boardState(position);
  if (state === "checkmate") {
    next = finish(next, { winner: mover, termination: "checkmate" }, now);
  } else if (game.bughouse) {
    // Bughouse has no stalemate (you wait for a piece) and no draw rules.
  } else if (state === "stalemate") {
    next = finish(next, { winner: null, termination: "stalemate" }, now);
  } else if (insufficientMaterial(position)) {
    next = finish(next, { winner: null, termination: "insufficient" }, now);
  } else if ((repetitions[key] ?? 0) >= AUTO_REPETITIONS) {
    next = finish(next, { winner: null, termination: "fivefold" }, now);
  } else if (position.halfmove >= AUTO_HALFMOVES) {
    next = finish(next, { winner: null, termination: "seventy-five-move" }, now);
  }
  return { game: next, captured: effects.captured };
}

/** A draw the side to move may claim now (threefold or the 50-move rule). */
export function claimableDraw(game: ChessGame): "threefold" | "fifty-move" | null {
  if (game.result || game.bughouse) return null;
  if ((game.repetitions[positionKey(game.position)] ?? 0) >= CLAIM_REPETITIONS) return "threefold";
  if (game.position.halfmove >= CLAIM_HALFMOVES) return "fifty-move";
  return null;
}

export function resign(game: ChessGame, color: Color, now: number): ChessGame {
  return finish(game, { winner: opposite(color), termination: "resign" }, now);
}

export function drawBy(
  game: ChessGame,
  termination: "agreement" | "threefold" | "fifty-move" | "abandon",
  now: number,
): ChessGame {
  return finish(game, { winner: null, termination }, now);
}

export function winByAbandon(game: ChessGame, winner: Color, now: number): ChessGame {
  return finish(game, { winner, termination: "abandon" }, now);
}

export function canOfferDraw(game: ChessGame, color: Color): boolean {
  return (
    !game.result &&
    !game.bughouse &&
    game.drawOffer === null &&
    game.history.length > 0 &&
    game.drawOfferedAt[color] !== game.history.length
  );
}

export function offerDraw(game: ChessGame, color: Color): ChessGame {
  return {
    ...game,
    drawOffer: color,
    drawOfferedAt: { ...game.drawOfferedAt, [color]: game.history.length },
  };
}

export function declineDraw(game: ChessGame): ChessGame {
  return { ...game, drawOffer: null };
}

/** Has `color` a move of its own on the board to take back? */
export function hasOwnMove(game: ChessGame, color: Color): boolean {
  return game.history.some((h) => h.by === color);
}

export function canRequestTakeback(game: ChessGame, color: Color): boolean {
  return (
    !game.result &&
    game.takebackRequest === null &&
    hasOwnMove(game, color) &&
    game.takebackRequestedAt[color] !== game.history.length
  );
}

export function requestTakeback(game: ChessGame, color: Color): ChessGame {
  return {
    ...game,
    takebackRequest: color,
    takebackRequestedAt: { ...game.takebackRequestedAt, [color]: game.history.length },
  };
}

export function declineTakeback(game: ChessGame): ChessGame {
  return { ...game, takebackRequest: null };
}

/**
 * Rewind to just before `color`'s last move (taking back the opponent's reply
 * too, when there is one). The clocks keep the time already spent and resume
 * for whoever is to move.
 */
export function takeBack(game: ChessGame, color: Color, now: number): ChessGame {
  let cut = game.history.length - 1;
  while (cut >= 0 && game.history[cut]?.by !== color) cut--;
  if (cut < 0) return game;
  const rebuilt = replayGame(game.startFen, game.history.slice(0, cut), game.bughouse);
  return {
    ...game,
    position: rebuilt.position,
    history: game.history.slice(0, cut),
    repetitions: rebuilt.repetitions,
    clock: game.clock ? resumeFor(game.clock, rebuilt.position.turn, now) : null,
    drawOffer: null,
    takebackRequest: null,
  };
}

/** Rebuild position and repetition counts by replaying `history` from `startFen`. */
export function replayGame(
  startFen: string,
  history: readonly Pick<HistoryEntry, "uci">[],
  bughouse = false,
): { position: Position; repetitions: Record<string, number>; positions: Position[] } {
  let position = parseFen(startFen, { bughouse });
  const positions = [position];
  const repetitions: Record<string, number> = { [positionKey(position)]: 1 };
  for (const { uci } of history) {
    const move = legalMoves(position).find((m) => moveToUci(m) === uci);
    if (!move) throw new Error(`replay: illegal move ${uci} in ${toFen(position)}`);
    position = applyMoveDetailed(position, move).position;
    positions.push(position);
    const key = positionKey(position);
    repetitions[key] = (repetitions[key] ?? 0) + 1;
  }
  return { position, repetitions, positions };
}

/** Remaining time per side at `now`, for an AI's time management. */
export function clockAt(
  game: ChessGame,
  now: number,
): { w: number; b: number; inc: number } | null {
  if (!game.clock) return null;
  return {
    w: Math.max(0, remaining(game.clock, "w", now)),
    b: Math.max(0, remaining(game.clock, "b", now)),
    inc: game.clock.incrementMs,
  };
}
