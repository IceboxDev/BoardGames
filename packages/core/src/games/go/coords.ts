/**
 * Coordinates: GTP vertices ("D4", letters skip "I", row 1 at the bottom) for
 * people and KataGo, SGF pairs ("dp", "aa" top-left) for files.
 */

const GTP_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

export function pointOf(size: number, x: number, y: number): number {
  return y * size + x;
}

export function xyOf(size: number, point: number): { x: number; y: number } {
  return { x: point % size, y: Math.floor(point / size) };
}

/** "D4" for a point, "pass" for `null`. */
export function toGtp(size: number, point: number | null): string {
  if (point === null) return "pass";
  const { x, y } = xyOf(size, point);
  return `${GTP_LETTERS[x]}${size - y}`;
}

/** The point for a GTP vertex, `null` for a pass, `undefined` when it is not one. */
export function fromGtp(size: number, vertex: string): number | null | undefined {
  const v = vertex.trim().toUpperCase();
  if (v === "PASS") return null;
  const m = /^([A-HJ-Z])(\d{1,2})$/.exec(v);
  if (!m) return undefined;
  const x = GTP_LETTERS.indexOf(m[1] as string);
  const row = Number(m[2]);
  if (x < 0 || x >= size || row < 1 || row > size) return undefined;
  return pointOf(size, x, size - row);
}

/** Column letters, left to right, for board labels. */
export function columnLabels(size: number): string[] {
  return [...GTP_LETTERS.slice(0, size)];
}

/** "dp" for a point. */
export function toSgfPoint(size: number, point: number): string {
  const { x, y } = xyOf(size, point);
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

/** The point for an SGF pair; `null` for a pass ("" or "tt" on boards up to 19). */
export function fromSgfPoint(size: number, pair: string): number | null | undefined {
  if (pair === "" || (pair === "tt" && size <= 19)) return null;
  if (pair.length !== 2) return undefined;
  const x = pair.charCodeAt(0) - 97;
  const y = pair.charCodeAt(1) - 97;
  if (x < 0 || x >= size || y < 0 || y >= size) return undefined;
  return pointOf(size, x, y);
}
