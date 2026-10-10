/**
 * Making a move. `applyMove` trusts its input — callers pass a move from
 * `legalMoves` (the machine validates every client move against that list).
 */

import { opposite, pieceOf, typeOf } from "./board";
import type {
  CastlingRights,
  Move,
  MoveEffects,
  PieceChar,
  PieceType,
  PocketType,
  Position,
  Square,
} from "./types";

const A1 = 0;
const H1 = 7;
const A8 = 56;
const H8 = 63;
const E1 = 4;
const E8 = 60;

function dropRights(rights: CastlingRights, sq: Square): CastlingRights {
  switch (sq) {
    case A1:
      return rights.Q ? { ...rights, Q: false } : rights;
    case H1:
      return rights.K ? { ...rights, K: false } : rights;
    case A8:
      return rights.q ? { ...rights, q: false } : rights;
    case H8:
      return rights.k ? { ...rights, k: false } : rights;
    case E1:
      return rights.K || rights.Q ? { ...rights, K: false, Q: false } : rights;
    case E8:
      return rights.k || rights.q ? { ...rights, k: false, q: false } : rights;
    default:
      return rights;
  }
}

function withPocket(
  pockets: Position["pockets"],
  color: "w" | "b",
  type: PocketType,
  delta: number,
): Position["pockets"] {
  if (!pockets) return pockets;
  const mine = pockets[color];
  return { ...pockets, [color]: { ...mine, [type]: mine[type] + delta } };
}

export function applyMoveDetailed(pos: Position, move: Move): MoveEffects {
  const board = pos.board.slice();
  const us = pos.turn;
  const them = opposite(us);
  let castling = pos.castling;
  let pockets = pos.pockets;
  let promoted = pos.promoted ? pos.promoted.slice() : null;
  let captured: PieceType | null = null;
  let castle: "k" | "q" | null = null;
  let enPassant = false;
  let ep: Square | null = null;
  let resetsClock = false;

  if (move.drop !== undefined) {
    board[move.to] = pieceOf(us, move.drop);
    pockets = withPocket(pockets, us, move.drop, -1);
    resetsClock = move.drop === "p";
  } else {
    const piece = board[move.from] as PieceChar;
    const type = typeOf(piece);
    const target = board[move.to];

    if (target) {
      const wasPromoted = promoted?.includes(move.to) ?? false;
      captured = wasPromoted ? "p" : typeOf(target);
      if (promoted && wasPromoted) promoted = promoted.filter((s) => s !== move.to);
      resetsClock = true;
    }

    if (type === "p") {
      resetsClock = true;
      if (move.to === pos.ep && !target) {
        // En passant: the captured pawn sits beside the mover, not on `to`.
        const victim = move.to + (us === "w" ? -8 : 8);
        board[victim] = null;
        captured = "p";
        enPassant = true;
      }
      if (Math.abs(move.to - move.from) === 16) ep = (move.from + move.to) / 2;
    }

    board[move.from] = null;
    board[move.to] = move.promotion ? pieceOf(us, move.promotion) : piece;

    if (promoted) {
      if (promoted.includes(move.from)) {
        promoted = promoted.map((s) => (s === move.from ? move.to : s));
      } else if (move.promotion) {
        promoted.push(move.to);
      }
      promoted.sort((a, b) => a - b);
    }

    if (type === "k" && Math.abs(move.to - move.from) === 2) {
      // Castling: the rook jumps over the king.
      const kingSide = move.to > move.from;
      const rookFrom = kingSide ? move.from + 3 : move.from - 4;
      const rookTo = kingSide ? move.from + 1 : move.from - 1;
      board[rookTo] = board[rookFrom] ?? null;
      board[rookFrom] = null;
      castle = kingSide ? "k" : "q";
    }

    castling = dropRights(dropRights(castling, move.from), move.to);
  }

  const position: Position = {
    board,
    turn: them,
    castling,
    ep,
    halfmove: resetsClock ? 0 : pos.halfmove + 1,
    fullmove: us === "b" ? pos.fullmove + 1 : pos.fullmove,
    pockets,
    promoted,
  };
  return { position, captured, castle, enPassant };
}

export function applyMove(pos: Position, move: Move): Position {
  return applyMoveDetailed(pos, move).position;
}
