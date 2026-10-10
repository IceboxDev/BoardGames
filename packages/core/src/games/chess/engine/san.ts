/**
 * Standard Algebraic Notation, for the move list, PGN and tests.
 */

import { applyMove } from "./apply";
import { fileOf, inCheck, rankOf, squareName, typeOf } from "./board";
import { hasLegalMove, legalMoves } from "./movegen";
import type { Move, Position } from "./types";

/** SAN for a legal `move` in `pos`, with `+` / `#` suffixes. */
export function toSan(pos: Position, move: Move, legal: readonly Move[] = legalMoves(pos)): string {
  const san = sanBody(pos, move, legal);
  const after = applyMove(pos, move);
  if (!inCheck(after)) return san;
  return `${san}${hasLegalMove(after) ? "+" : "#"}`;
}

function sanBody(pos: Position, move: Move, legal: readonly Move[]): string {
  if (move.drop !== undefined) {
    return `${move.drop.toUpperCase()}@${squareName(move.to)}`;
  }
  const piece = pos.board[move.from];
  if (!piece) return "??";
  const type = typeOf(piece);
  const capture = !!pos.board[move.to] || (type === "p" && move.to === pos.ep);

  if (type === "k" && Math.abs(move.to - move.from) === 2) {
    return move.to > move.from ? "O-O" : "O-O-O";
  }

  if (type === "p") {
    const from = capture ? `${squareName(move.from)[0]}x` : "";
    const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
    return `${from}${squareName(move.to)}${promo}`;
  }

  // Disambiguate among same-type pieces that can reach the same square.
  const rivals = legal.filter(
    (m) =>
      m.drop === undefined &&
      m.to === move.to &&
      m.from !== move.from &&
      pos.board[m.from] === piece,
  );
  let qualifier = "";
  if (rivals.length > 0) {
    const sameFile = rivals.some(
      (m) => m.from !== undefined && fileOf(m.from) === fileOf(move.from),
    );
    const sameRank = rivals.some(
      (m) => m.from !== undefined && rankOf(m.from) === rankOf(move.from),
    );
    const name = squareName(move.from);
    if (!sameFile) qualifier = name[0] ?? "";
    else if (!sameRank) qualifier = name[1] ?? "";
    else qualifier = name;
  }
  return `${type.toUpperCase()}${qualifier}${capture ? "x" : ""}${squareName(move.to)}`;
}

/** The legal move a SAN string names, or `null`. Tolerates `+`, `#`, `!`, `?`. */
export function parseSan(pos: Position, text: string): Move | null {
  const clean = text.replace(/[+#!?]+$/, "").replace(/0/g, "O");
  const legal = legalMoves(pos);
  return legal.find((m) => sanBody(pos, m, legal) === clean) ?? null;
}
