/**
 * Disc and frame colours — SVG fills, so they live here as literals rather
 * than as Tailwind classes. Seat 0 is Red, seat 1 Yellow, for a whole series.
 */

import type { Seat } from "@boardgames/core/games/connect-4/types";

export const DISC_COLORS = [
  { fill: "#e5484d", rim: "#a8262b", shine: "#ff8a8d", name: "Red" },
  { fill: "#f5c518", rim: "#b98d00", shine: "#ffe27a", name: "Yellow" },
] as const satisfies readonly { fill: string; rim: string; shine: string; name: string }[];

export const FACE_FILL = "#1f4fd1";
export const FACE_EDGE = "#14318a";
/** The slot behind the holes. */
export const WELL_FILL = "#0b1530";
/** Hint / best-move columns glowing through the holes. */
export const HIGHLIGHT_FILL = "#34d399";
/** The winning line's rings and the last-move dot. */
export const MARK_FILL = "#ffffff";
/** The bar under a drawn column's value on the analysis board. */
export const DRAW_FILL = "#64748b";

/**
 * A seat's colour as *text* ink. The disc fill mixed a third of the way
 * towards the theme's strongest ink: paler on a dark ramp, deeper on a light
 * one — Yellow's raw fill is unreadable on a light surface.
 */
export function seatInk(seat: Seat): string {
  return `color-mix(in oklab, ${DISC_COLORS[seat].fill} 65%, var(--color-fg-strong))`;
}
