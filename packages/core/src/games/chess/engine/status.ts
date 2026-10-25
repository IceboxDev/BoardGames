/**
 * How a position stands: mate, stalemate, and the material draw rules.
 * Repetition and the move-count rules need the game's history, so they live
 * with the game (`../game.ts`); the thresholds are here.
 */

import { colorOf, inCheck, isLightSquare, typeOf } from "./board";
import { hasLegalMove } from "./movegen";
import type { Color, Position } from "./types";

/** Threefold and the 50-move rule may be CLAIMED. */
export const CLAIM_REPETITIONS = 3;
export const CLAIM_HALFMOVES = 100;
/** Fivefold and the 75-move rule end the game on their own (FIDE 9.6). */
export const AUTO_REPETITIONS = 5;
export const AUTO_HALFMOVES = 150;

export type BoardState = "checkmate" | "stalemate" | "ongoing";

export function boardState(pos: Position): BoardState {
  if (hasLegalMove(pos)) return "ongoing";
  return inCheck(pos) ? "checkmate" : "stalemate";
}

/**
 * Neither side can ever mate: K v K, K+minor v K, or only bishops all on one
 * colour of square. Never true with pockets — pieces can come back.
 */
export function insufficientMaterial(pos: Position): boolean {
  if (pos.pockets) return false;
  let knights = 0;
  const bishopColors = new Set<boolean>();
  let bishops = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = pos.board[sq];
    if (!p) continue;
    const t = typeOf(p);
    if (t === "k") continue;
    if (t === "n") knights += 1;
    else if (t === "b") {
      bishops += 1;
      bishopColors.add(isLightSquare(sq));
    } else return false; // a pawn, rook or queen can always mate
  }
  if (knights + bishops <= 1) return true;
  return knights === 0 && bishopColors.size === 1;
}

/** Does `color` have only its king left? (A flag fall against it is a draw.) */
export function hasLoneKing(pos: Position, color: Color): boolean {
  if (pos.pockets) {
    const pocket = pos.pockets[color];
    if (pocket.p + pocket.n + pocket.b + pocket.r + pocket.q > 0) return false;
  }
  return pos.board.every((p) => !p || colorOf(p) !== color || typeOf(p) === "k");
}

/**
 * Can `color` not mate by any series of legal moves, however the other side
 * plays? True for a lone king, and for king and one minor piece against a
 * lone king. Anything more can mate with the other side's help (a bishop
 * mates a king boxed in by its own rook), so a flag fall loses then.
 * FIDE 6.9, on the board alone (a bughouse pocket counts as mating material).
 */
export function cannotMate(pos: Position, color: Color): boolean {
  if (hasLoneKing(pos, color)) return true;
  if (pos.pockets) return false;
  const mine = pos.board.filter((p) => p && colorOf(p) === color && typeOf(p) !== "k");
  const one = mine.length === 1 ? mine[0] : null;
  const minor = one ? typeOf(one) === "n" || typeOf(one) === "b" : false;
  return minor && hasLoneKing(pos, color === "w" ? "b" : "w");
}
