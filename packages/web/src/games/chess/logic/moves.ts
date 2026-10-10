/**
 * The board's move logic, kept out of React: which squares a click can reach,
 * which move a drag means, premoves, captured material and clock text. Moves
 * are UCI strings throughout — the same text the server lists as legal.
 */

import {
  colorOf,
  parseSquare,
  squareName,
  typeOf,
} from "@boardgames/core/games/chess/engine/board";
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import { pseudoLegalMoves } from "@boardgames/core/games/chess/engine/movegen";
import type {
  Color,
  PieceType,
  PocketType,
  Position,
} from "@boardgames/core/games/chess/engine/types";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import type { HistoryEntry } from "@boardgames/core/games/chess/schemas";

/** `from` square name → the legal UCI moves starting there. Drops key by `"N@"`. */
export type MoveMap = ReadonlyMap<string, readonly string[]>;

export function moveMap(ucis: readonly string[]): MoveMap {
  const map = new Map<string, string[]>();
  for (const uci of ucis) {
    // `e2e4` keys by `e2`; a drop `N@f3` by its pocket key `N@`.
    const key = uci.slice(0, 2);
    const list = map.get(key) ?? [];
    list.push(uci);
    map.set(key, list);
  }
  return map;
}

/** The destination square of a UCI move. */
export const uciTo = (uci: string): string => uci.slice(2, 4);
export const uciFrom = (uci: string): string | null => (uci.includes("@") ? null : uci.slice(0, 2));

/**
 * The moves from `from` to `to` — none, one, or the four promotion choices.
 * `from` is a square name, or a pocket key like `"N@"` for a drop.
 */
export function movesBetween(map: MoveMap, from: string, to: string): string[] {
  return (map.get(from) ?? []).filter((uci) => uciTo(uci) === to);
}

/**
 * Squares a premove may target: every pseudo-legal destination of the
 * viewer's pieces as if it were their turn now. Legality is checked again
 * when the turn comes; an impossible premove is simply dropped.
 */
export function premoveMap(fen: string, color: Color, bughouse = false): MoveMap {
  let pos: Position;
  try {
    pos = parseFen(fen, { bughouse });
  } catch {
    return new Map();
  }
  const mine: Position = { ...pos, turn: color, ep: null };
  // Captures of one's own pieces are pointless as premoves, but a piece that
  // is protected now may be traded off first — allow any square but our king.
  const ucis = pseudoLegalMoves(mine).map(moveToUci);
  const extra: string[] = [];
  for (let from = 0; from < 64; from++) {
    const p = pos.board[from];
    if (!p || colorOf(p) !== color || typeOf(p) === "k") continue;
    for (const uci of ucis) {
      if (uci.slice(0, 2) !== squareName(from)) continue;
      const to = parseSquare(uci.slice(2, 4));
      if (to === null) continue;
      const target = pos.board[to];
      if (target && colorOf(target) === color) extra.push(uci);
    }
  }
  return moveMap([...ucis, ...extra]);
}

const VALUE: Readonly<Record<PieceType, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER: readonly PieceType[] = ["q", "r", "b", "n", "p"];

export interface Material {
  /** Pieces each colour has taken, biggest first. */
  readonly taken: Readonly<Record<Color, readonly PieceType[]>>;
  /** White's material lead in pawns (negative: Black leads), from what is on the board. */
  readonly lead: number;
}

export function material(fen: string, history: readonly HistoryEntry[]): Material {
  const taken: Record<Color, PieceType[]> = { w: [], b: [] };
  for (const h of history) if (h.captured) taken[h.by].push(h.captured);
  for (const c of ["w", "b"] as const) {
    taken[c].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }
  let lead = 0;
  try {
    const pos = parseFen(fen, { bughouse: fen.includes("[") });
    for (const p of pos.board) {
      if (!p) continue;
      lead += (colorOf(p) === "w" ? 1 : -1) * VALUE[typeOf(p)];
    }
  } catch {
    lead = 0;
  }
  return { taken, lead };
}

/** Pocket counts from a bughouse FEN, or `null` for classical chess. */
export function pocketsOf(fen: string): Position["pockets"] {
  try {
    return parseFen(fen, { bughouse: fen.includes("[") }).pockets;
  } catch {
    return null;
  }
}

export const POCKET_ORDER: readonly PocketType[] = ["q", "r", "b", "n", "p"];

/** `m:ss`, or `s.t` (tenths) under ten seconds, or `h:mm:ss` for long games. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000) return (Math.floor(clamped / 100) / 10).toFixed(1);
  const total = Math.ceil(clamped / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
