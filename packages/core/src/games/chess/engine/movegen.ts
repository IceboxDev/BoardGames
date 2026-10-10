/**
 * Legal move generation: pseudo-legal moves, then a filter that plays each on
 * a scratch board and drops the ones that leave the mover's king attacked.
 * Verified against the published perft counts (`perft.test.ts`).
 */

import {
  colorOf,
  findKing,
  isAttacked,
  KING_TARGETS,
  KNIGHT_TARGETS,
  opposite,
  pieceOf,
  RAYS,
  rankOf,
  typeOf,
} from "./board";
import type { Color, Move, PieceChar, PocketType, Position, PromotionType, Square } from "./types";

const PROMOTIONS: readonly PromotionType[] = ["q", "r", "b", "n"];
const POCKET_ORDER: readonly PocketType[] = ["p", "n", "b", "r", "q"];

function pushPawnMove(out: Move[], from: Square, to: Square, us: Color): void {
  const lastRank = us === "w" ? 7 : 0;
  if (rankOf(to) === lastRank) {
    for (const promotion of PROMOTIONS) out.push({ from, to, promotion });
  } else {
    out.push({ from, to });
  }
}

/** Moves that obey piece movement but may leave the king in check. */
export function pseudoLegalMoves(pos: Position): Move[] {
  const { board, turn: us } = pos;
  const them = opposite(us);
  const out: Move[] = [];
  const forward = us === "w" ? 8 : -8;
  const startRank = us === "w" ? 1 : 6;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || colorOf(piece) !== us) continue;
    const type = typeOf(piece);

    if (type === "p") {
      const one = from + forward;
      if (one >= 0 && one < 64 && !board[one]) {
        pushPawnMove(out, from, one, us);
        const two = one + forward;
        if (rankOf(from) === startRank && !board[two]) out.push({ from, to: two });
      }
      for (const side of [-1, 1]) {
        const file = (from & 7) + side;
        if (file < 0 || file > 7) continue;
        const to = one + side;
        if (to < 0 || to >= 64) continue;
        const target = board[to];
        if (target && colorOf(target) === them) pushPawnMove(out, from, to, us);
        else if (!target && to === pos.ep) out.push({ from, to });
      }
      continue;
    }

    if (type === "n" || type === "k") {
      const table = type === "n" ? KNIGHT_TARGETS : KING_TARGETS;
      for (const to of table[from] ?? []) {
        const target = board[to];
        if (!target || colorOf(target) === them) out.push({ from, to });
      }
      if (type === "k") pushCastles(pos, from, out);
      continue;
    }

    const first = type === "b" ? 4 : 0;
    const last = type === "r" ? 4 : 8;
    const rays = RAYS[from] ?? [];
    for (let dir = first; dir < last; dir++) {
      for (const to of rays[dir] ?? []) {
        const target = board[to];
        if (!target) {
          out.push({ from, to });
          continue;
        }
        if (colorOf(target) === them) out.push({ from, to });
        break;
      }
    }
  }

  if (pos.pockets) pushDrops(pos, out);
  return out;
}

function pushCastles(pos: Position, from: Square, out: Move[]): void {
  const { board, turn: us } = pos;
  const home = us === "w" ? 4 : 60;
  if (from !== home) return;
  const them = opposite(us);
  const rook: PieceChar = pieceOf(us, "r");
  const kingSide = us === "w" ? pos.castling.K : pos.castling.k;
  const queenSide = us === "w" ? pos.castling.Q : pos.castling.q;
  if (!kingSide && !queenSide) return;
  if (isAttacked(board, home, them)) return;

  if (
    kingSide &&
    board[home + 3] === rook &&
    !board[home + 1] &&
    !board[home + 2] &&
    !isAttacked(board, home + 1, them) &&
    !isAttacked(board, home + 2, them)
  ) {
    out.push({ from: home, to: home + 2 });
  }
  if (
    queenSide &&
    board[home - 4] === rook &&
    !board[home - 1] &&
    !board[home - 2] &&
    !board[home - 3] &&
    !isAttacked(board, home - 1, them) &&
    !isAttacked(board, home - 2, them)
  ) {
    out.push({ from: home, to: home - 2 });
  }
}

function pushDrops(pos: Position, out: Move[]): void {
  const pocket = pos.pockets?.[pos.turn];
  if (!pocket) return;
  for (const drop of POCKET_ORDER) {
    if (pocket[drop] <= 0) continue;
    for (let to = 0; to < 64; to++) {
      if (pos.board[to]) continue;
      if (drop === "p" && (rankOf(to) === 0 || rankOf(to) === 7)) continue;
      out.push({ drop, to });
    }
  }
}

/** Does `move` (pseudo-legal) leave the mover's own king safe? */
export function keepsKingSafe(pos: Position, move: Move): boolean {
  const board = pos.board.slice();
  const us = pos.turn;
  if (move.drop !== undefined) {
    board[move.to] = pieceOf(us, move.drop);
  } else {
    const piece = board[move.from];
    if (piece && typeOf(piece) === "p" && move.to === pos.ep && !board[move.to]) {
      board[move.to + (us === "w" ? -8 : 8)] = null;
    }
    board[move.to] = piece ?? null;
    board[move.from] = null;
  }
  const king = findKing(board, us);
  return king < 0 || !isAttacked(board, king, opposite(us));
}

export function legalMoves(pos: Position): Move[] {
  return pseudoLegalMoves(pos).filter((m) => keepsKingSafe(pos, m));
}

export function hasLegalMove(pos: Position): boolean {
  return pseudoLegalMoves(pos).some((m) => keepsKingSafe(pos, m));
}
