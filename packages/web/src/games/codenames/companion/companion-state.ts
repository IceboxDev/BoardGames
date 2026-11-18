import { agentsFor } from "@boardgames/core/games/codenames/seating";
import {
  type CodenamesScanResponse,
  GRID_CELLS,
  type ScanCover,
  ScanCoverSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import type { CoverTone, GridCard } from "../table";

// The companion's board, as one value on the player's own phone: the words a
// photo scan read, what covers each card (as the player taps it in), their own
// ★ marks, whether the grid is turned round, and which team started. Pure, so
// the screen only dispatches and the reducer is tested on its own.

export const BoardSchema = z.object({
  cells: z.array(z.object({ word: z.string().max(40), sure: z.boolean() })).length(GRID_CELLS),
  covers: z.array(ScanCoverSchema.nullable()).length(GRID_CELLS),
  marks: z.array(z.boolean()).length(GRID_CELLS),
  /** Turned 180° — for a grid photographed from the other side of the table. */
  rotated: z.boolean(),
  /** The team that went first (it has 9 agents), once the player says. */
  starter: z.union([z.literal(0), z.literal(1)]).nullable(),
  language: z.enum(["en", "de"]).nullable(),
});
export type Board = z.infer<typeof BoardSchema>;

export type BoardAction =
  | { type: "scanned"; scan: CodenamesScanResponse }
  | { type: "cover"; card: number; cover: ScanCover | null }
  | { type: "mark"; card: number }
  | { type: "fixWord"; card: number; word: string }
  | { type: "rotate" }
  | { type: "setStarter"; starter: 0 | 1 | null }
  | { type: "reset" };

const setAt = <T>(list: readonly T[], i: number, value: T): T[] =>
  list.map((v, j) => (j === i ? value : v));

const inGrid = (card: number) => Number.isInteger(card) && card >= 0 && card < GRID_CELLS;

export function boardFromScan(scan: CodenamesScanResponse): Board {
  return {
    cells: scan.cells.map((c) => ({ word: c.word, sure: c.sure })),
    covers: scan.cells.map((c) => c.cover),
    marks: scan.cells.map(() => false),
    rotated: false,
    starter: null,
    language: scan.language,
  };
}

/** The board after one action; `null` = no board (before the first scan, after "New grid"). */
export function boardReducer(board: Board | null, action: BoardAction): Board | null {
  if (action.type === "scanned") return boardFromScan(action.scan);
  if (action.type === "reset" || board === null) return null;
  switch (action.type) {
    case "cover":
      return inGrid(action.card)
        ? { ...board, covers: setAt(board.covers, action.card, action.cover) }
        : board;
    case "mark":
      return inGrid(action.card)
        ? { ...board, marks: setAt(board.marks, action.card, !board.marks[action.card]) }
        : board;
    case "fixWord": {
      const word = action.word.replace(/\s+/g, " ").trim().toUpperCase().slice(0, 40);
      if (!inGrid(action.card) || word === "") return board;
      // A word the player typed is the word: no longer in doubt.
      return { ...board, cells: setAt(board.cells, action.card, { word, sure: true }) };
    }
    case "rotate":
      return { ...board, rotated: !board.rotated };
    case "setStarter":
      return { ...board, starter: action.starter };
  }
}

/** Grid position on screen → the card it shows (a turned grid reads backwards). */
export function cardAt(board: Board, position: number): number {
  return board.rotated ? GRID_CELLS - 1 - position : position;
}

const COVER_TONE: Record<ScanCover, CoverTone> = { red: "red", blue: "blue", bystander: "tan" };

/** The board as the shared grid draws it, in screen order; `selected` is a card index. */
export function companionGridCards(board: Board, selected: number | null): GridCard[] {
  return Array.from({ length: GRID_CELLS }, (_, position) => {
    const card = cardAt(board, position);
    const cell = board.cells[card] ?? { word: "", sure: false };
    const cover = board.covers[card] ?? null;
    return {
      word: cell.word,
      cover: cover === null ? null : COVER_TONE[cover],
      keyTone: null,
      pickable: true,
      selected: selected === card,
      marked: board.marks[card] === true,
      unsure: !cell.sure,
    };
  });
}

export interface TeamCount {
  team: 0 | 1;
  /** Cards the player has covered in this team's colour. */
  covered: number;
  /** Agents still to find, once the starting team is known. */
  left: number | null;
}

/** Red's and Blue's covered agents — and, with the starter set, how many each still has to find. */
export function teamCounts(board: Board): TeamCount[] {
  return ([0, 1] as const).map((team) => {
    const covered = board.covers.filter((c) => c === (team === 0 ? "red" : "blue")).length;
    return {
      team,
      covered,
      left: board.starter === null ? null : Math.max(0, agentsFor(team, board.starter) - covered),
    };
  });
}

/** Words the scan wasn't sure of (still unfixed). */
export function unsureCount(board: Board): number {
  return board.cells.filter((c) => !c.sure).length;
}
