// Every numeric coordinate of the conflict table lives here.
//
// The table is a fixed design canvas — a photographed tabletop — scaled
// uniformly to whatever box the Table face has, so the same picture reads
// on a phone, a laptop and a 4K monitor. Two frozen canvases (landscape for
// `sm` and up, portrait for phones) and ONE placement rule for every player
// count: seats sit around an oval in seat order, clockwise, with the local
// player at the bottom — the next seat is on the left, exactly as at a real
// table, and play goes round the same way.
//
// Components import from this file and never inline a number.

import type { BoardRect } from "../../../../components/board";
import type { MapOrientation } from "../board/geometry";

export type TableOrientation = MapOrientation;

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}

export interface TableLayout {
  orientation: TableOrientation;
  canvas: Size;
  /** CSS aspect-ratio string for the width-fit wrapper. */
  aspect: string;
  centre: Point;
  /** The cloth's half-axes. */
  felt: { rx: number; ry: number };
  /** Width of the lacquered rim outside the cloth. */
  rim: number;
  /** A seat's paper plate, outside the rim. */
  plate: Size;
  /** Gap between the cloth edge and the plate's inner edge. */
  platePad: number;
  /** The ring the played-card slots sit on. */
  slotRing: { rx: number; ry: number };
  /** A played card on the cloth. */
  card: Size;
  /** The trump card in the centre. */
  trumpCard: Size;
  /** Width of one advantage-row card in the centre. */
  advantageCardWidth: number;
  /** The centre block (trump, advantage row, status) — kept clear of slots. */
  centreBlock: Size;
  /** Edge length of the clan monogram on a plate. */
  monogram: number;
  /** A face-down card in the hand fan / tricks pile on a plate. */
  miniBack: Size;
  /** How many card backs the hand fan shows before the count carries the rest. */
  fanMax: number;
  /** Trick pip diameter on a plate; 0 hides the pips (the count stays). */
  pip: number;
  /** Whether the centre shows the trump as its own big card beside the row;
   * the phone canvas has no room and the row's lifted card says it. */
  trumpCardInCentre: boolean;
  /** Tailwind type tokens — sized for the canvas, which is scaled DOWN on
   * screen (≈0.6 on a laptop with rails, ≈0.4 on a phone), so these are
   * larger than the intended on-screen size. */
  text: { name: string; meta: string; chip: string; label: string; status: string };
}

const LANDSCAPE: TableLayout = {
  orientation: "landscape",
  canvas: { w: 1600, h: 1000 },
  aspect: "1600 / 1000",
  centre: { x: 800, y: 500 },
  felt: { rx: 512, ry: 352 },
  rim: 18,
  plate: { w: 270, h: 120 },
  platePad: 4,
  slotRing: { rx: 400, ry: 240 },
  card: { w: 120, h: 180 },
  trumpCard: { w: 80, h: 120 },
  advantageCardWidth: 36,
  centreBlock: { w: 340, h: 240 },
  monogram: 44,
  miniBack: { w: 28, h: 42 },
  fanMax: 5,
  pip: 12,
  trumpCardInCentre: true,
  text: {
    name: "text-2xl font-semibold",
    meta: "text-xl",
    chip: "text-base font-bold",
    label: "text-lg uppercase tracking-label",
    status: "text-2xl",
  },
};

const PORTRAIT: TableLayout = {
  orientation: "portrait",
  canvas: { w: 1000, h: 1500 },
  aspect: "1000 / 1500",
  centre: { x: 500, y: 750 },
  felt: { rx: 265, ry: 600 },
  rim: 14,
  plate: { w: 220, h: 100 },
  platePad: 4,
  slotRing: { rx: 180, ry: 410 },
  card: { w: 120, h: 180 },
  trumpCard: { w: 72, h: 108 },
  advantageCardWidth: 48,
  centreBlock: { w: 220, h: 220 },
  monogram: 44,
  miniBack: { w: 24, h: 36 },
  fanMax: 3,
  pip: 0,
  trumpCardInCentre: false,
  text: {
    name: "text-3xl font-semibold",
    meta: "text-2xl",
    chip: "text-2xl font-bold",
    label: "text-xl uppercase tracking-label",
    status: "text-2xl",
  },
};

export const TABLE_LAYOUTS: Record<TableOrientation, TableLayout> = {
  landscape: LANDSCAPE,
  portrait: PORTRAIT,
};

export interface SeatPosition {
  /** Position around the table, 0 = the anchor seat at the bottom. */
  k: number;
  /** Screen-space angle in degrees (y down): 90 = bottom, increasing clockwise. */
  angle: number;
  plate: Point;
  slot: Point;
}

/** Where `seat` sits relative to `me` (a spectator, `me === -1`, watches from seat 0). */
export function relativeSeat(seat: number, me: number, n: number): number {
  const anchor = me >= 0 ? me : 0;
  return (((seat - anchor) % n) + n) % n;
}

/** The anchor at 90° (bottom), then evenly clockwise. */
export function seatAngle(k: number, n: number): number {
  return (90 + (k * 360) / n) % 360;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The point on the cloth's edge at `angle`. */
export function feltPoint(layout: TableLayout, angle: number): Point {
  return {
    x: layout.centre.x + layout.felt.rx * Math.cos(rad(angle)),
    y: layout.centre.y + layout.felt.ry * Math.sin(rad(angle)),
  };
}

/** The unit normal pointing out of the cloth at `angle`. */
export function outwardNormal(layout: TableLayout, angle: number): Point {
  const nx = Math.cos(rad(angle)) / layout.felt.rx;
  const ny = Math.sin(rad(angle)) / layout.felt.ry;
  const len = Math.hypot(nx, ny);
  return { x: nx / len, y: ny / len };
}

/**
 * One position per seat. The slot sits on the slot ring at the seat's angle.
 * The plate sits outside the cloth: the cloth-edge point pushed along the
 * outward normal by the plate's support distance, so whatever the angle the
 * whole plate lies beyond the tangent line — a plain plate ring would cut
 * into the cloth on the diagonal seats of a five-player table.
 */
export function seatPositions(layout: TableLayout, n: number): SeatPosition[] {
  const out: SeatPosition[] = [];
  for (let k = 0; k < n; k++) {
    const angle = seatAngle(k, n);
    const edge = feltPoint(layout, angle);
    const normal = outwardNormal(layout, angle);
    const support =
      (layout.plate.w / 2) * Math.abs(normal.x) +
      (layout.plate.h / 2) * Math.abs(normal.y) +
      layout.platePad;
    out.push({
      k,
      angle,
      plate: {
        x: Math.round(edge.x + normal.x * support),
        y: Math.round(edge.y + normal.y * support),
      },
      slot: {
        x: Math.round(layout.centre.x + layout.slotRing.rx * Math.cos(rad(angle))),
        y: Math.round(layout.centre.y + layout.slotRing.ry * Math.sin(rad(angle))),
      },
    });
  }
  return out;
}

/** The rect of size `size` centred on `centre`. */
export function rectAround(centre: Point, size: Size): BoardRect {
  return { x: centre.x - size.w / 2, y: centre.y - size.h / 2, w: size.w, h: size.h };
}

/** Normalised ellipse radius of a point: < 1 inside the cloth, > 1 outside. */
export function feltRadius(layout: TableLayout, p: Point): number {
  const dx = (p.x - layout.centre.x) / layout.felt.rx;
  const dy = (p.y - layout.centre.y) / layout.felt.ry;
  return Math.hypot(dx, dy);
}
