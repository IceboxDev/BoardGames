/**
 * Moves played out from a position, for the review board: each position on
 * the way, and the moves as score-sheet entries (SAN, who moved, what was
 * taken). Lines that stop being legal stop there.
 */
import { applyMoveDetailed } from "@boardgames/core/games/chess/engine/apply";
import { inCheck } from "@boardgames/core/games/chess/engine/board";
import { parseFen, toFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { toSan } from "@boardgames/core/games/chess/engine/san";
import type { Color, PieceType } from "@boardgames/core/games/chess/engine/types";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import type { Score } from "./grade";

export interface LineEntry {
  readonly uci: string;
  readonly san: string;
  readonly by: Color;
  readonly captured: PieceType | null;
}

/** `ucis` played from `fen`: the positions after each move and the moves. */
export function playLine(
  fen: string,
  ucis: readonly string[],
): { fens: string[]; entries: LineEntry[] } {
  const fens: string[] = [];
  const entries: LineEntry[] = [];
  try {
    let pos = parseFen(fen);
    for (const uci of ucis) {
      const legal = legalMoves(pos);
      const move = legal.find((m) => moveToUci(m) === uci);
      if (!move) break;
      const san = toSan(pos, move, legal);
      const effects = applyMoveDetailed(pos, move);
      entries.push({ uci, san, by: pos.turn, captured: effects.captured });
      pos = effects.position;
      fens.push(toFen(pos));
    }
  } catch {
    // A position that doesn't parse plays nothing.
  }
  return { fens, entries };
}

/** The legal moves at `fen` (UCI), for whoever is to move. */
export function legalAt(fen: string): string[] {
  try {
    return legalMoves(parseFen(fen)).map(moveToUci);
  } catch {
    return [];
  }
}

/** A finished position's score (White's view): mate is ±10000, stalemate 0; `null` when play goes on. */
export function terminalScore(fen: string): Score | null {
  try {
    const pos = parseFen(fen);
    if (legalMoves(pos).length > 0) return null;
    if (!inCheck(pos)) return { cp: 0 };
    return { cp: pos.turn === "w" ? -10_000 : 10_000 };
  } catch {
    return null;
  }
}

/** Moves as numbered text from `fen`: "22. Nd5 Qe7 23. Rac1", "22… Qe7". */
export function lineText(fen: string, ucis: readonly string[], max = 6): string {
  const fields = fen.split(" ");
  let number = Number(fields[5] ?? "1") || 1;
  let white = fields[1] !== "b";
  const { entries } = playLine(fen, ucis.slice(0, max));
  const out: string[] = [];
  entries.forEach((e, i) => {
    if (white) out.push(`${number}. ${e.san}`);
    else out.push(i === 0 ? `${number}… ${e.san}` : e.san);
    if (!white) number++;
    white = !white;
  });
  return out.join(" ");
}
