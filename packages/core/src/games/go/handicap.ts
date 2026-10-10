/**
 * Fixed handicap placement (the GTP `fixed_handicap` layout): the corner star
 * points first, then the side points, with tengen on odd counts from 5.
 */

import { pointOf } from "./coords";

/** Largest fixed handicap each board allows. */
export function maxHandicap(size: number): number {
  if (size >= 13) return 9;
  if (size >= 9) return 5;
  return 0;
}

/** A reason the handicap does not fit the board, or `null`. */
export function handicapProblem(size: number, handicap: number): string | null {
  if (handicap === 0) return null;
  if (handicap === 1) return "A handicap of one stone is played as Black with no komi instead";
  if (handicap > maxHandicap(size))
    return `At most ${maxHandicap(size)} handicap stones on ${size}×${size}`;
  return null;
}

/** Black's handicap stones, in placement order. */
export function handicapPoints(size: number, handicap: number): number[] {
  if (handicap < 2 || handicapProblem(size, handicap)) return [];
  const e = size >= 13 ? 3 : 2;
  const f = size - 1 - e;
  const m = (size - 1) / 2;
  const at = (x: number, y: number) => pointOf(size, x, y);
  // y = 0 is the top row: (f, e) is the upper right from Black's side.
  const upperRight = at(f, e);
  const lowerLeft = at(e, f);
  const lowerRight = at(f, f);
  const upperLeft = at(e, e);
  const center = at(m, m);
  const leftSide = at(e, m);
  const rightSide = at(f, m);
  const top = at(m, e);
  const bottom = at(m, f);
  const corners = [upperRight, lowerLeft, lowerRight, upperLeft];
  switch (handicap) {
    case 2:
      return corners.slice(0, 2);
    case 3:
      return corners.slice(0, 3);
    case 4:
      return corners;
    case 5:
      return [...corners, center];
    case 6:
      return [...corners, leftSide, rightSide];
    case 7:
      return [...corners, leftSide, rightSide, center];
    case 8:
      return [...corners, leftSide, rightSide, top, bottom];
    default:
      return [...corners, leftSide, rightSide, top, bottom, center];
  }
}

/** Star points drawn on the board. */
export function starPoints(size: number): number[] {
  if (size === 19) return handicapPoints(19, 9);
  if (size === 13) return handicapPoints(13, 5);
  if (size === 9) return handicapPoints(9, 5);
  return [];
}
