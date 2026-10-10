/**
 * The board's own colours. These are game art (wood and ink), not chrome, so
 * they are fixed rather than theme tokens — like Sky Team's cockpit palette.
 */

export const BOARD_COLORS = {
  light: "#ecd9b6",
  dark: "#b0835a",
  /** Coordinate text on a light / dark square. */
  coordOnLight: "#b0835a",
  coordOnDark: "#ecd9b6",
  lastMove: "rgb(205 210 106 / 0.55)",
  selected: "rgb(20 85 30 / 0.5)",
  premove: "rgb(20 30 85 / 0.45)",
  legalDot: "rgb(20 85 30 / 0.45)",
  check: "rgb(220 38 38 / 0.85)",
  cursor: "rgb(250 204 21)",
  arrowBest: "rgb(21 128 61 / 0.75)",
  arrowUser: "rgb(234 88 12 / 0.75)",
  arrowAlt: "rgb(37 99 235 / 0.6)",
  pickerScrim: "rgb(0 0 0 / 0.55)",
  pickerTile: "#f4ecdc",
} as const;

/** One square is 100 units; the board is 800 × 800. */
export const SQUARE = 100;
export const BOARD_SIZE = SQUARE * 8;
