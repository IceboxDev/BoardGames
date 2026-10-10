/**
 * Square geometry, piece letters and attack detection. Attack tables are built
 * once at module load; nothing here allocates per call except the ray lists.
 */

import type { Color, PieceChar, PieceType, Position, Square } from "./types";

export const FILES = "abcdefgh";

export const fileOf = (sq: Square): number => sq & 7;
export const rankOf = (sq: Square): number => sq >> 3;
export const squareAt = (file: number, rank: number): Square => rank * 8 + file;

export function squareName(sq: Square): string {
  return `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`;
}

/** `"e4"` → 28, or `null` for anything that is not a square. */
export function parseSquare(name: string): Square | null {
  if (name.length !== 2) return null;
  const file = FILES.indexOf(name[0] ?? "");
  const rank = Number(name[1]) - 1;
  if (file < 0 || !Number.isInteger(rank) || rank < 0 || rank > 7) return null;
  return squareAt(file, rank);
}

export const colorOf = (piece: PieceChar): Color => (piece === piece.toUpperCase() ? "w" : "b");
export const typeOf = (piece: PieceChar): PieceType => piece.toLowerCase() as PieceType;
export const opposite = (color: Color): Color => (color === "w" ? "b" : "w");

export function pieceOf(color: Color, type: PieceType): PieceChar {
  return (color === "w" ? type.toUpperCase() : type) as PieceChar;
}

/** Light squares: a1 is dark, so file + rank odd is light. */
export const isLightSquare = (sq: Square): boolean => (fileOf(sq) + rankOf(sq)) % 2 === 1;

// ── Attack tables ──────────────────────────────────────────────────────────

const KNIGHT_DELTAS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
] as const;

/** Orthogonal directions first (0–3), then diagonals (4–7). */
export const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
] as const;

function targets(sq: Square, deltas: readonly (readonly [number, number])[]): Square[] {
  const out: Square[] = [];
  for (const [df, dr] of deltas) {
    const f = fileOf(sq) + df;
    const r = rankOf(sq) + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(squareAt(f, r));
  }
  return out;
}

export const KNIGHT_TARGETS: readonly (readonly Square[])[] = Array.from({ length: 64 }, (_, sq) =>
  targets(sq, KNIGHT_DELTAS),
);
export const KING_TARGETS: readonly (readonly Square[])[] = Array.from({ length: 64 }, (_, sq) =>
  targets(sq, DIRECTIONS),
);

/** `RAYS[sq][dir]` — the squares from `sq` outward in direction `dir`, nearest first. */
export const RAYS: readonly (readonly (readonly Square[])[])[] = Array.from(
  { length: 64 },
  (_, sq) =>
    DIRECTIONS.map(([df, dr]) => {
      const ray: Square[] = [];
      let f = fileOf(sq) + df;
      let r = rankOf(sq) + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        ray.push(squareAt(f, r));
        f += df;
        r += dr;
      }
      return ray;
    }),
);

/** Is `sq` attacked by any piece of `by`? (Occupancy of `sq` itself is irrelevant.) */
export function isAttacked(board: Position["board"], sq: Square, by: Color): boolean {
  const pawn = by === "w" ? "P" : "p";
  const knight = by === "w" ? "N" : "n";
  const king = by === "w" ? "K" : "k";
  const rook = by === "w" ? "R" : "r";
  const bishop = by === "w" ? "B" : "b";
  const queen = by === "w" ? "Q" : "q";

  // A white pawn attacks upward, so it sits one rank BELOW the target.
  const pawnRank = rankOf(sq) + (by === "w" ? -1 : 1);
  if (pawnRank >= 0 && pawnRank < 8) {
    const f = fileOf(sq);
    if (f > 0 && board[squareAt(f - 1, pawnRank)] === pawn) return true;
    if (f < 7 && board[squareAt(f + 1, pawnRank)] === pawn) return true;
  }
  for (const t of KNIGHT_TARGETS[sq] ?? []) if (board[t] === knight) return true;
  for (const t of KING_TARGETS[sq] ?? []) if (board[t] === king) return true;

  const rays = RAYS[sq] ?? [];
  for (let dir = 0; dir < 8; dir++) {
    const straight = dir < 4;
    for (const t of rays[dir] ?? []) {
      const p = board[t];
      if (!p) continue;
      if (p === queen || p === (straight ? rook : bishop)) return true;
      break;
    }
  }
  return false;
}

export function findKing(board: Position["board"], color: Color): Square {
  const king = color === "w" ? "K" : "k";
  return board.indexOf(king);
}

export function inCheck(pos: Position, color: Color = pos.turn): boolean {
  const king = findKing(pos.board, color);
  return king >= 0 && isAttacked(pos.board, king, opposite(color));
}
