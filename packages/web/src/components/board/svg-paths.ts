import type { BoardPoint } from "./types";

/**
 * Build a circular-arc path command (`M ... A ...`) from `from` to `to` on a
 * circle of the given radius.
 *
 * - `sweep`: 0 = counter-clockwise, 1 = clockwise.
 * - `large`: 0 = minor arc, 1 = major arc.
 */
export function arcPath(
  from: BoardPoint,
  to: BoardPoint,
  radius: number,
  sweep: 0 | 1 = 0,
  large: 0 | 1 = 0,
): string {
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} ${sweep} ${to.x} ${to.y}`;
}

/**
 * Build a circular-arc path from a centre + start/end angles. Angles in
 * degrees, 0° = east, sweeping clockwise to match SVG's coordinate system.
 */
export function arcPathFromCenter(
  center: BoardPoint,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const from = {
    x: center.x + radius * Math.cos(startRad),
    y: center.y + radius * Math.sin(startRad),
  };
  const to = {
    x: center.x + radius * Math.cos(endRad),
    y: center.y + radius * Math.sin(endRad),
  };
  const delta = (((endDeg - startDeg) % 360) + 360) % 360;
  const large = delta > 180 ? 1 : 0;
  return arcPath(from, to, radius, 1, large as 0 | 1);
}

export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + rr} ${y}`,
    `H ${x + w - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V ${y + h - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H ${x + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V ${y + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    "Z",
  ].join(" ");
}

export function polyline(points: BoardPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")}`;
}
