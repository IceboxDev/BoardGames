// Every numeric coordinate of the Sensō map lives here. Two frozen layouts:
// landscape (rails beside the board) and portrait (phones), each with its own
// viewBox. Components import from this file and never inline a number.

import { EDGES, REGIONS } from "@boardgames/core/games/senso-battle-for-japan/map";
import type { BoardPoint, BoardRect, BoardViewBox } from "../../../../components/board";

export type MapOrientation = "landscape" | "portrait";

export const SQUARE = 48;
export const SQUARE_GAP = 6;
export const CUBE = 38;
export const CUBE_RADIUS = 6;
export const NODE_RADIUS = 10;
export const BADGE_RADIUS = 12;
export const HIT_INSET = -3;

/** Landscape node: number badge band, squares stacked top-down, VP gutter on the left. */
const L_HEAD = 28;
const L_GUTTER = 14;
const L_PAD = 8;
const L_NODE_W = L_GUTTER + L_PAD + SQUARE + L_PAD;

/** Portrait node: badge band + a VP label row, squares side by side. */
const P_HEAD = 22;
const P_VP_ROW = 12;
const P_PAD = 8;

const LANDSCAPE_VIEWBOX: BoardViewBox = { x: 0, y: 0, width: 790, height: 500 };
const PORTRAIT_VIEWBOX: BoardViewBox = { x: 0, y: 0, width: 600, height: 900 };

/** Column (landscape) / row (portrait) index per region, and the band. */
const REGION_SLOT: readonly { col: number; band: "top" | "mid" | "bottom" }[] = [
  { col: 0, band: "mid" }, // 1
  { col: 1, band: "mid" }, // 2
  { col: 2, band: "mid" }, // 3
  { col: 3, band: "top" }, // 4
  { col: 3, band: "bottom" }, // 5
  { col: 4, band: "mid" }, // 6
  { col: 5, band: "top" }, // 7
  { col: 5, band: "bottom" }, // 8
  { col: 6, band: "top" }, // 9
  { col: 6, band: "bottom" }, // 10
];

const L_COL_X = [30, 138, 246, 354, 462, 570, 678];
const L_BAND_Y = { top: 130, mid: 250, bottom: 370 };

const P_ROW_Y = [40, 165, 290, 415, 540, 665, 790];
const P_BAND_X = { top: 110, mid: 300, bottom: 490 };

export interface NodeLayout {
  region: number;
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

function landscapeNode(region: number): NodeLayout {
  const n = REGIONS[region].squares.length;
  const { col, band } = REGION_SLOT[region];
  const h = L_HEAD + n * SQUARE + (n - 1) * SQUARE_GAP + L_PAD;
  const x = L_COL_X[col];
  const y = Math.round(L_BAND_Y[band] - h / 2);
  const squares: BoardRect[] = [];
  const vpLabels: BoardPoint[] = [];
  for (let i = 0; i < n; i++) {
    const sy = y + L_HEAD + i * (SQUARE + SQUARE_GAP);
    squares.push({ x: x + L_GUTTER + L_PAD, y: sy, w: SQUARE, h: SQUARE });
    vpLabels.push({ x: x + L_GUTTER / 2 + 2, y: sy + SQUARE / 2 });
  }
  return {
    region,
    bounds: { x, y, w: L_NODE_W, h },
    badge: { x: x + 16, y: y + 14 },
    lock: { x: x + L_NODE_W - 14, y: y + 14 },
    squares,
    vpLabels,
    center: { x: x + L_NODE_W / 2, y: y + h / 2 },
  };
}

function portraitNode(region: number): NodeLayout {
  const n = REGIONS[region].squares.length;
  const { col, band } = REGION_SLOT[region];
  const w = P_PAD + n * SQUARE + (n - 1) * SQUARE_GAP + P_PAD;
  const h = P_HEAD + P_VP_ROW + SQUARE + P_PAD;
  const x = Math.round(P_BAND_X[band] - w / 2);
  const y = P_ROW_Y[col];
  const squares: BoardRect[] = [];
  const vpLabels: BoardPoint[] = [];
  for (let i = 0; i < n; i++) {
    const sx = x + P_PAD + i * (SQUARE + SQUARE_GAP);
    squares.push({ x: sx, y: y + P_HEAD + P_VP_ROW, w: SQUARE, h: SQUARE });
    vpLabels.push({ x: sx + SQUARE / 2, y: y + P_HEAD + P_VP_ROW / 2 + 1 });
  }
  return {
    region,
    bounds: { x, y, w, h },
    badge: { x: x + 16, y: y + 12 },
    lock: { x: x + w - 14, y: y + 12 },
    squares,
    vpLabels,
    center: { x: x + w / 2, y: y + h / 2 },
  };
}

function build(orientation: MapOrientation): MapLayout {
  const nodes = REGIONS.map((r) =>
    orientation === "landscape" ? landscapeNode(r.id) : portraitNode(r.id),
  );
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
  landscape: build("landscape"),
  portrait: build("portrait"),
};

export function squareRect(layout: MapLayout, region: number, square: number): BoardRect {
  return layout.nodes[region].squares[square];
}

export function cubeCenter(layout: MapLayout, region: number, square: number): BoardPoint {
  const r = squareRect(layout, region, square);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function inflate(rect: BoardRect, by: number): BoardRect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}
