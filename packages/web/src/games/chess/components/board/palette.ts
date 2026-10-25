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
  // Solid colours: an arrow is ONE filled shape drawn at ARROW_OPACITY, so the
  // head and shaft never double up into darker seams.
  arrowBest: "rgb(21 128 61)",
  arrowUser: "rgb(234 88 12)",
  arrowAlt: "rgb(37 99 235)",
  // The opening trainer's move kinds (= Tailwind amber-400 / sky-400 /
  // emerald-400, the explorer's dots): your pick, the engine's best, popular.
  arrowPick: "rgb(251 191 36)",
  arrowEngine: "rgb(56 189 248)",
  arrowPopular: "rgb(52 211 153)",
  // A move's grade on its square (= Tailwind emerald-400 / amber-300 /
  // orange-400 / rose-400, the move list's marks).
  gradeBest: "rgb(52 211 153)",
  gradeInaccuracy: "rgb(252 211 77)",
  gradeMistake: "rgb(251 146 60)",
  gradeBlunder: "rgb(251 113 133)",
  gradeInk: "rgb(23 20 18)",
  pickerScrim: "rgb(0 0 0 / 0.55)",
  pickerTile: "#f4ecdc",
} as const;

/** One square is 100 units; the board is 800 × 800. */
export const SQUARE = 100;
export const BOARD_SIZE = SQUARE * 8;
