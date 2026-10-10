/**
 * FEN in and out. Bughouse positions carry their pockets in brackets after the
 * placement (`…/RNBQKBNR[Qn]`) and mark promoted pieces with `~` (`Q~`) — the
 * notation lichess and Fairy-Stockfish both read.
 */

import { colorOf, parseSquare, squareAt, squareName, typeOf } from "./board";
import { legalMoves } from "./movegen";
import type {
  CastlingRights,
  PieceChar,
  PocketCounts,
  Pockets,
  PocketType,
  Position,
} from "./types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECE_CHARS = "PNBRQKpnbrqk";
const POCKET_TYPES: readonly PocketType[] = ["q", "r", "b", "n", "p"];

export const EMPTY_POCKET: PocketCounts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
export const EMPTY_POCKETS: Pockets = { w: EMPTY_POCKET, b: EMPTY_POCKET };

export class FenError extends Error {}

function parsePlacement(text: string, withPockets: boolean) {
  let placement = text;
  let pockets: Pockets | null = null;
  const bracket = placement.indexOf("[");
  if (bracket >= 0) {
    if (!placement.endsWith("]")) throw new FenError("unterminated pocket");
    const held = placement.slice(bracket + 1, -1);
    placement = placement.slice(0, bracket);
    const w = { ...EMPTY_POCKET };
    const b = { ...EMPTY_POCKET };
    for (const ch of held) {
      if (ch === "-") continue;
      const type = ch.toLowerCase();
      if (!POCKET_TYPES.includes(type as PocketType)) throw new FenError(`bad pocket piece ${ch}`);
      const side = ch === type ? b : w;
      side[type as PocketType] += 1;
    }
    pockets = { w, b };
  } else if (withPockets) {
    pockets = EMPTY_POCKETS;
  }

  const ranks = placement.split("/");
  if (ranks.length === 9 && withPockets) {
    // `…/RNBQKBNR/Qn` — the slash form of holdings.
    const held = ranks.pop() ?? "";
    return parsePlacement(`${ranks.join("/")}[${held}]`, true);
  }
  if (ranks.length !== 8) throw new FenError("placement needs 8 ranks");

  const board: (PieceChar | null)[] = new Array(64).fill(null);
  const promoted: number[] = [];
  ranks.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else if (ch === "~") {
        if (file === 0) throw new FenError("~ before any piece");
        promoted.push(squareAt(file - 1, rank));
      } else if (PIECE_CHARS.includes(ch)) {
        if (file > 7) throw new FenError(`rank ${rank + 1} is too long`);
        board[squareAt(file, rank)] = ch as PieceChar;
        file += 1;
      } else {
        throw new FenError(`bad placement character ${ch}`);
      }
    }
    if (file !== 8) throw new FenError(`rank ${rank + 1} has ${file} files`);
  });
  return { board, pockets, promoted };
}

/** Parse a FEN. `bughouse` forces pockets on even when the FEN has none. */
export function parseFen(fen: string, opts: { bughouse?: boolean } = {}): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new FenError("FEN needs at least 4 fields");
  const [placement = "", turn = "", castlingText = "", epText = "", half = "0", full = "1"] = parts;
  const { board, pockets, promoted } = parsePlacement(placement, opts.bughouse ?? false);

  if (turn !== "w" && turn !== "b") throw new FenError("side to move must be w or b");
  if (!/^(-|K?Q?k?q?)$/.test(castlingText) || castlingText === "") {
    throw new FenError("bad castling field");
  }
  const castling: CastlingRights = {
    K: castlingText.includes("K") && board[7] === "R" && board[4] === "K",
    Q: castlingText.includes("Q") && board[0] === "R" && board[4] === "K",
    k: castlingText.includes("k") && board[63] === "r" && board[60] === "k",
    q: castlingText.includes("q") && board[56] === "r" && board[60] === "k",
  };
  const ep = epText === "-" ? null : parseSquare(epText);
  if (epText !== "-" && ep === null) throw new FenError("bad en-passant square");
  const halfmove = Number(half);
  const fullmove = Number(full);
  if (!Number.isInteger(halfmove) || halfmove < 0) throw new FenError("bad halfmove clock");
  if (!Number.isInteger(fullmove) || fullmove < 1) throw new FenError("bad fullmove number");

  const kings = { w: 0, b: 0 };
  for (const p of board) if (p && typeOf(p) === "k") kings[colorOf(p)] += 1;
  if (kings.w !== 1 || kings.b !== 1) throw new FenError("each side needs exactly one king");

  return {
    board,
    turn,
    castling,
    ep,
    halfmove,
    fullmove,
    pockets,
    promoted: pockets ? promoted.sort((a, b) => a - b) : null,
  };
}

function placementText(pos: Position): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const sq = squareAt(file, rank);
      const piece = pos.board[sq];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += piece;
      if (pos.promoted?.includes(sq)) row += "~";
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  let text = rows.join("/");
  if (pos.pockets) {
    let held = "";
    for (const type of POCKET_TYPES) held += type.toUpperCase().repeat(pos.pockets.w[type]);
    for (const type of POCKET_TYPES) held += type.repeat(pos.pockets.b[type]);
    text += `[${held}]`;
  }
  return text;
}

function castlingText(c: CastlingRights): string {
  const text = `${c.K ? "K" : ""}${c.Q ? "Q" : ""}${c.k ? "k" : ""}${c.q ? "q" : ""}`;
  return text || "-";
}

/**
 * The en-passant square only when a capture there is actually legal — what
 * FIDE's repetition rule counts and what modern FEN writers print.
 */
export function legalEpSquare(pos: Position): number | null {
  if (pos.ep === null) return null;
  const ep = pos.ep;
  return legalMoves(pos).some(
    (m) => m.drop === undefined && m.to === ep && pos.board[m.from]?.toLowerCase() === "p",
  )
    ? ep
    : null;
}

export function toFen(pos: Position): string {
  const ep = legalEpSquare(pos);
  return [
    placementText(pos),
    pos.turn,
    castlingText(pos.castling),
    ep === null ? "-" : squareName(ep),
    String(pos.halfmove),
    String(pos.fullmove),
  ].join(" ");
}

/**
 * The part of a position that decides "the same position" for repetition:
 * pieces (and pockets), side to move, castling rights and a legal ep square.
 */
export function positionKey(pos: Position): string {
  const ep = legalEpSquare(pos);
  return `${placementText(pos)} ${pos.turn} ${castlingText(pos.castling)} ${ep === null ? "-" : squareName(ep)}`;
}
