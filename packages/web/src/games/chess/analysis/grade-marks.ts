import type { MoveGrade } from "../components/MoveList";

/** How a graded move is marked: the score sheet, the review rail, the move card. */
export const GRADE_MARK: Readonly<
  Record<Exclude<MoveGrade, null>, { mark: string; className: string; label: string }>
> = {
  best: { mark: "★", className: "text-emerald-400", label: "best move" },
  inaccuracy: { mark: "?!", className: "text-amber-300", label: "inaccuracy" },
  mistake: { mark: "?", className: "text-orange-400", label: "mistake" },
  blunder: { mark: "??", className: "text-rose-400", label: "blunder" },
};
