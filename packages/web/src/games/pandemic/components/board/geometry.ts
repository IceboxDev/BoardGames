// Numeric constants for the Pandemic board. Every coordinate the SVG layout
// uses lives here — components import from this file rather than inlining
// magic numbers, matching the convention Sky Team's geometry.ts established.
//
// The map background image is 1920×1080 pixels; city positions in
// `cities.json` and the live `CITY_DATA` map are expressed in that frame.
// We use the same plane as the SVG viewBox so coordinates map 1:1 to the
// existing data without a translation step.

import type { BoardViewBox } from "../../../../components/board";

export const REFERENCE_WIDTH = 1920;
export const REFERENCE_HEIGHT = 1080;

/** SVG viewBox spanning the full reference frame. `preserveAspectRatio` on
 *  BoardSurface ("xMidYMid meet") centers the board when the container
 *  aspect ratio differs from 1920:1080. */
export const BOARD_VIEWBOX: BoardViewBox = {
  x: 0,
  y: 0,
  width: REFERENCE_WIDTH,
  height: REFERENCE_HEIGHT,
};

/**
 * City positions in the source JSON are the top-left corner of a 150-wide
 * label sprite slot with the city dot at +75 horizontal. We want the dot
 * coordinate directly, so every component shifts by this constant rather
 * than each file inlining the same magic number.
 */
export const CITY_LABEL_WIDTH = 150;
export const CITY_LABEL_HEIGHT = 24;
export const CITY_DOT_RADIUS = 16;
export const CITY_DOT_STROKE = 2.5;
/** Vertical offset from the dot to the start of the cube stack. */
export const CUBE_STACK_OFFSET_Y = 28;
export const CUBE_SIZE = 14;
export const CUBE_GAP = 3;
/** Cubes wrap to a second row after this many in one row. */
export const CUBE_ROW_LIMIT = 4;

/** Player pawn sized so 2–3 pawns can stack on one city without overflow. */
export const PAWN_RADIUS = 13;
export const PAWN_GAP = 4;
export const PAWN_OFFSET_Y = 0;

/** Research station "house" silhouette is centered above the city dot. */
export const STATION_SIZE = 22;
export const STATION_OFFSET_Y = 36;

/** Stroke for inter-city connection lines. Loop (wrap-around) connections
 *  use the same color/width but render in two pieces against the map edges. */
export const CONNECTION_STROKE = "rgb(180, 240, 255)";
export const CONNECTION_STROKE_WIDTH = 3.5;
export const CONNECTION_OPACITY = 0.55;

/** Glow around legal-destination cities while a movement action is armed. */
export const HIGHLIGHT_RING_RADIUS = 24;
export const HIGHLIGHT_RING_STROKE = "rgba(34, 197, 94, 0.85)";
export const HIGHLIGHT_RING_FILL = "rgba(34, 197, 94, 0.18)";

/** Ring around the city the user is currently hovering over (drives the
 *  tooltip + visual focus). Different from the highlight ring so a
 *  hovered legal city reads as both. */
export const HOVER_RING_STROKE = "rgba(255, 255, 255, 0.85)";

/** Convert a raw city position into a `<g transform="translate(x, y)">`
 *  origin centered on the city's dot. Components nest cube stacks, pawns,
 *  and stations underneath this transform so each lives in city-local
 *  coordinates. */
export function cityOrigin(position: readonly [number, number]): { x: number; y: number } {
  return {
    x: position[0] + CITY_LABEL_WIDTH / 2,
    y: position[1] + CITY_LABEL_HEIGHT / 2,
  };
}
