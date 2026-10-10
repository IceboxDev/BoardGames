/**
 * UCI long algebraic notation — the engine wire format and the game's action
 * encoding: `e2e4`, `e7e8q`, castling as the king's move (`e1g1`), and drops
 * as `N@f3`.
 */

import { parseSquare, squareName } from "./board";
import type { Move, PocketType, PromotionType } from "./types";

export function moveToUci(move: Move): string {
  if (move.drop !== undefined) return `${move.drop.toUpperCase()}@${squareName(move.to)}`;
  return `${squareName(move.from)}${squareName(move.to)}${move.promotion ?? ""}`;
}

/** Parse UCI text into a move shape (not checked for legality), or `null`. */
export function uciToMove(text: string): Move | null {
  const drop = /^([PNBRQ])@([a-h][1-8])$/.exec(text);
  if (drop) {
    const to = parseSquare(drop[2] ?? "");
    if (to === null) return null;
    return { drop: (drop[1] ?? "").toLowerCase() as PocketType, to };
  }
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(text);
  if (!m) return null;
  const from = parseSquare(m[1] ?? "");
  const to = parseSquare(m[2] ?? "");
  if (from === null || to === null) return null;
  return m[3] ? { from, to, promotion: m[3] as PromotionType } : { from, to };
}
