// Every numeric coordinate of the Sensō map lives here.
//
// The board is the painted map of Japan (`assets/map.webp`, a 16:9 frame).
// Two frozen layouts share it: landscape (rails beside the board) shows the
// painting as is; portrait (phones) turns it a quarter turn clockwise so the
// west→east chain of regions runs top→bottom. Each region is a paper card
// placed on the painting by a `NodePlacement` — a top-left corner, a uniform
// scale, and whether its squares stack (column) or sit side by side (row).
// The placements below were fixed by hand in the dev adjust mode
// (`/dev/senso-preview?adjust`): drag, resize, copy, paste here.
//
// Components import from this file and never inline a number.

import { EDGES, REGIONS } from "@boardgames/core/games/senso-battle-for-japan/map";
import type { BoardPoint, BoardRect, BoardViewBox } from "../../../../components/board";

export type MapOrientation = "landscape" | "portrait";
export type NodeArrangement = "column" | "row";

export interface NodePlacement {
  /** Top-left corner of the card, in viewBox units. */
  x: number;
  y: number;
  /** Uniform scale of the card and everything on it (1 = the stock size). */
  scale: number;
  /** Squares stacked top-down with the VP gutter on the left (column), or
   * side by side under a VP row (row). */
  arrangement: NodeArrangement;
}

/** The stock (scale 1) sizes. */
export const SQUARE = 48;
export const SQUARE_GAP = 6;
export const CUBE = 38;
export const CUBE_RADIUS = 6;
export const NODE_RADIUS = 10;
export const BADGE_RADIUS = 12;
export const HIT_INSET = -3;

/** Column card: number badge band, squares stacked top-down, VP gutter on the left. */
const C_HEAD = 28;
const C_GUTTER = 14;
const C_PAD = 8;
const C_NODE_W = C_GUTTER + C_PAD + SQUARE + C_PAD;

/** Row card: badge band + a VP label row, squares side by side. */
const R_HEAD = 22;
const R_VP_ROW = 12;
const R_PAD = 8;

/** The painting's frame. The landscape viewBox keeps the painting's aspect
 * (3344 × 1882 px source); portrait is the same frame turned on its side. */
export const MAP_IMAGE_ASPECT = 3344 / 1882;
const LANDSCAPE_VIEWBOX: BoardViewBox = { x: 0, y: 0, width: 790, height: 445 };
const PORTRAIT_VIEWBOX: BoardViewBox = { x: 0, y: 0, width: 445, height: 790 };

export const MIN_NODE_SCALE = 0.4;
export const MAX_NODE_SCALE = 2;

// ── Placements ────────────────────────────────────────────────────────────
//
// Index = region (0-based; the rulebook's 1–10). West to east: 1 Kyūshū,
// 2 Chūgoku, 3 the Kansai hub, 4 north / 5 south of it, 6 Chūbu, 7 north /
// 8 south, 9 north / 10 south in the east.

export const LANDSCAPE_PLACEMENTS: readonly NodePlacement[] = [
  { x: 96, y: 239, scale: 0.73, arrangement: "column" }, // 1
  { x: 182, y: 158, scale: 0.73, arrangement: "column" }, // 2
  { x: 248, y: 283, scale: 0.73, arrangement: "column" }, // 3
  { x: 277, y: 201, scale: 0.73, arrangement: "column" }, // 4
  { x: 365, y: 173, scale: 0.73, arrangement: "column" }, // 5
  { x: 444, y: 199, scale: 0.73, arrangement: "column" }, // 6
  { x: 527, y: 225, scale: 0.73, arrangement: "column" }, // 7
  { x: 520, y: 107, scale: 0.73, arrangement: "column" }, // 8
  { x: 609, y: 152, scale: 0.73, arrangement: "column" }, // 9
  { x: 695, y: 30, scale: 0.73, arrangement: "column" }, // 10
];

// Derived from the landscape cards above: each centre turned a quarter turn
// clockwise onto the portrait painting, squares laid in a row. Refine on a
// phone (or `?frame=411x915`) with the adjust mode when needed.
export const PORTRAIT_PLACEMENTS: readonly NodePlacement[] = [
  { x: 73, y: 92, scale: 0.73, arrangement: "row" }, // 1
  { x: 194, y: 178, scale: 0.73, arrangement: "row" }, // 2
  { x: 69, y: 244, scale: 0.73, arrangement: "row" }, // 3
  { x: 190, y: 273, scale: 0.73, arrangement: "row" }, // 4
  { x: 139, y: 361, scale: 0.73, arrangement: "row" }, // 5
  { x: 153, y: 440, scale: 0.73, arrangement: "row" }, // 6
  { x: 87, y: 523, scale: 0.73, arrangement: "row" }, // 7
  { x: 284, y: 516, scale: 0.73, arrangement: "row" }, // 8
  { x: 160, y: 605, scale: 0.73, arrangement: "row" }, // 9
  { x: 282, y: 691, scale: 0.73, arrangement: "row" }, // 10
];

export const DEFAULT_PLACEMENTS: Record<MapOrientation, readonly NodePlacement[]> = {
  landscape: LANDSCAPE_PLACEMENTS,
  portrait: PORTRAIT_PLACEMENTS,
};

// ── Layout ────────────────────────────────────────────────────────────────

export interface NodeLayout {
  region: number;
  placement: NodePlacement;
  /** The placement's scale, for anything drawn in stock units (text, radii). */
  scale: number;
  bounds: BoardRect;
  badge: BoardPoint;
  lock: BoardPoint;
  squares: BoardRect[];
  vpLabels: BoardPoint[];
  center: BoardPoint;
}

export interface MapLayout {
  orientation: MapOrientation;
  viewBox: BoardViewBox;
  /** CSS aspect-ratio string for the sizing wrapper. */
  aspect: string;
  nodes: NodeLayout[];
  edges: { a: BoardPoint; b: BoardPoint; key: string }[];
}

/** Stock (scale 1) size of a card with `n` squares. */
export function stockNodeSize(n: number, arrangement: NodeArrangement): { w: number; h: number } {
  if (arrangement === "column") {
    return { w: C_NODE_W, h: C_HEAD + n * SQUARE + (n - 1) * SQUARE_GAP + C_PAD };
  }
  return {
    w: R_PAD + n * SQUARE + (n - 1) * SQUARE_GAP + R_PAD,
    h: R_HEAD + R_VP_ROW + SQUARE + R_PAD,
  };
}

export function buildNode(region: number, placement: NodePlacement): NodeLayout {
  const n = REGIONS[region].squares.length;
  const { x, y, scale: s, arrangement } = placement;
  const stock = stockNodeSize(n, arrangement);
  const w = stock.w * s;
  const h = stock.h * s;
  const squares: BoardRect[] = [];
  const vpLabels: BoardPoint[] = [];
  if (arrangement === "column") {
    for (let i = 0; i < n; i++) {
      const sy = y + (C_HEAD + i * (SQUARE + SQUARE_GAP)) * s;
      squares.push({ x: x + (C_GUTTER + C_PAD) * s, y: sy, w: SQUARE * s, h: SQUARE * s });
      vpLabels.push({ x: x + (C_GUTTER / 2 + 2) * s, y: sy + (SQUARE / 2) * s });
    }
  } else {
    for (let i = 0; i < n; i++) {
      const sx = x + (R_PAD + i * (SQUARE + SQUARE_GAP)) * s;
      squares.push({ x: sx, y: y + (R_HEAD + R_VP_ROW) * s, w: SQUARE * s, h: SQUARE * s });
      vpLabels.push({ x: sx + (SQUARE / 2) * s, y: y + (R_HEAD + R_VP_ROW / 2 + 1) * s });
    }
  }
  const badgeY = arrangement === "column" ? 14 : 12;
  return {
    region,
    placement,
    scale: s,
    bounds: { x, y, w, h },
    badge: { x: x + 16 * s, y: y + badgeY * s },
    lock: { x: x + w - 14 * s, y: y + badgeY * s },
    squares,
    vpLabels,
    center: { x: x + w / 2, y: y + h / 2 },
  };
}

export function buildLayout(
  orientation: MapOrientation,
  placements: readonly NodePlacement[] = DEFAULT_PLACEMENTS[orientation],
): MapLayout {
  const nodes = REGIONS.map((r) => buildNode(r.id, placements[r.id] ?? placements[0]));
  const viewBox = orientation === "landscape" ? LANDSCAPE_VIEWBOX : PORTRAIT_VIEWBOX;
  return {
    orientation,
    viewBox,
    aspect: `${viewBox.width} / ${viewBox.height}`,
    nodes,
    edges: EDGES.map(([a, b]) => ({ a: nodes[a].center, b: nodes[b].center, key: `${a}-${b}` })),
  };
}

export const LAYOUTS: Record<MapOrientation, MapLayout> = {
  landscape: buildLayout("landscape"),
  portrait: buildLayout("portrait"),
};

export function squareRect(layout: MapLayout, region: number, square: number): BoardRect {
  return layout.nodes[region].squares[square];
}

export function cubeCenter(layout: MapLayout, region: number, square: number): BoardPoint {
  const r = squareRect(layout, region, square);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** A cube fills its square at the stock ratio, whatever the card's scale. */
export function cubeSize(layout: MapLayout, region: number, square: number): number {
  return (squareRect(layout, region, square).w * CUBE) / SQUARE;
}

export function inflate(rect: BoardRect, by: number): BoardRect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

/** The placements as a TypeScript literal, ready to paste above. */
export function placementsToSource(
  orientation: MapOrientation,
  placements: readonly NodePlacement[],
): string {
  const name = orientation === "landscape" ? "LANDSCAPE_PLACEMENTS" : "PORTRAIT_PLACEMENTS";
  const rows = placements.map(
    (p, i) =>
      `  { x: ${p.x}, y: ${p.y}, scale: ${p.scale}, arrangement: "${p.arrangement}" }, // ${i + 1}`,
  );
  return `export const ${name}: readonly NodePlacement[] = [\n${rows.join("\n")}\n];`;
}
