/**
 * The grade vocabulary of the analysis board, chess-style: a word, a mark and
 * a colour per grade, shared by the move list, the card, the graph and the
 * board's ring. `fill` is an SVG colour (the board and graph draw in SVG).
 */

import type { Grade } from "@boardgames/core/games/connect-4/solver/analysis";

export interface GradeLook {
  word: string;
  /** The move list's mark; empty for a move that kept the result. */
  mark: string;
  /** Text colour class. */
  ink: string;
  /** A soft background for flawed moves in the list. */
  tint: string;
  fill: string;
}

export const GRADES: Record<Grade, GradeLook> = {
  best: { word: "Best", mark: "", ink: "text-emerald-300", tint: "", fill: "#34d399" },
  good: { word: "Good", mark: "", ink: "text-sky-300", tint: "", fill: "#38bdf8" },
  inaccuracy: {
    word: "Inaccuracy",
    mark: "?!",
    ink: "text-amber-300",
    tint: "bg-amber-400/10",
    fill: "#fbbf24",
  },
  mistake: {
    word: "Mistake",
    mark: "?",
    ink: "text-orange-300",
    tint: "bg-orange-400/10",
    fill: "#fb923c",
  },
  blunder: {
    word: "Blunder",
    mark: "??",
    ink: "text-rose-300",
    tint: "bg-rose-400/15",
    fill: "#fb7185",
  },
  unknown: { word: "Not solved", mark: "", ink: "text-fg-muted", tint: "", fill: "#94a3b8" },
};

/** The mark for "the only move that kept the result", lichess's "!". */
export const ONLY_MOVE = { word: "Only move", mark: "!", ink: "text-cyan-300", fill: "#22d3ee" };
