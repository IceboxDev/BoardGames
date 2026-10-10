/**
 * Every coordinate of the Go board, in one place (see
 * docs/intricate-board-rendering.md): one viewBox per board size, the grid
 * spacing, and where a point sits. Stone and wood colours are game art and
 * live here too, not in the theme.
 */

import { columnLabels } from "@boardgames/core/games/go/coords";

/** Distance between two lines, in viewBox units. */
export const CELL = 100;
/** Room outside the outer lines for the coordinate labels. */
export const MARGIN = 115;
export const STONE_R = CELL * 0.47;

export interface BoardGeometry {
  readonly size: number;
  readonly extent: number;
  readonly viewBox: { x: number; y: number; width: number; height: number };
  readonly columns: readonly string[];
}

const cache = new Map<number, BoardGeometry>();

export function geometry(size: number): BoardGeometry {
  const hit = cache.get(size);
  if (hit) return hit;
  const extent = MARGIN * 2 + (size - 1) * CELL;
  const g = {
    size,
    extent,
    viewBox: { x: 0, y: 0, width: extent, height: extent },
    columns: columnLabels(size),
  };
  cache.set(size, g);
  return g;
}

/** The centre of `point` in viewBox units. */
export function pointXY(size: number, point: number): { x: number; y: number } {
  return { x: MARGIN + (point % size) * CELL, y: MARGIN + Math.floor(point / size) * CELL };
}

/** The point nearest a viewBox position, or `null` off the grid. */
export function nearestPoint(size: number, x: number, y: number): number | null {
  const col = Math.round((x - MARGIN) / CELL);
  const row = Math.round((y - MARGIN) / CELL);
  if (col < 0 || row < 0 || col >= size || row >= size) return null;
  return row * size + col;
}

export const WOOD = {
  light: "#e3b66a",
  dark: "#c8933f",
  line: "#3d2a12",
  label: "#5a3f1c",
} as const;

export const STONE = {
  black: { hi: "#5b5b5b", lo: "#0b0b0b", rim: "#000000" },
  white: { hi: "#ffffff", lo: "#cfcbc2", rim: "#8d887d" },
} as const;

export const MARK = {
  lastOnBlack: "#f4f1ea",
  lastOnWhite: "#1a1a1a",
  ko: "#3d2a12",
  hover: "rgba(0,0,0,0.35)",
  blackArea: "#111111",
  whiteArea: "#fafafa",
  best: "#22c55e",
} as const;
