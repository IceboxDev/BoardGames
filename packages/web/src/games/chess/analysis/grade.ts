/**
 * Turning engine evaluations into what a player reads: a win chance, a grade
 * per move (best / inaccuracy / mistake / blunder) and an accuracy score.
 * The formulas are lichess's published ones, so the numbers feel familiar.
 */

import type { MoveGrade } from "../components/MoveList";

/** An engine score from WHITE's point of view. */
export type Score = { readonly cp: number } | { readonly mate: number };

export interface PositionEval {
  readonly score: Score;
  /** The engine's best move here (UCI), or `null` when the game is over. */
  readonly best: string | null;
  /** Principal variation (UCI). */
  readonly pv: readonly string[];
  readonly depth: number;
}

const MATE_CP = 10_000;

/** A score as centipawns for White, mates as ±10000 (nearer mates larger). */
export function toCp(score: Score): number {
  if ("cp" in score) return score.cp;
  if (score.mate === 0) return 0;
  return Math.sign(score.mate) * (MATE_CP - Math.abs(score.mate));
}

/** White's chance to win, 0–100 (lichess's logistic). */
export function winPercent(score: Score): number {
  const cp = Math.max(-1000, Math.min(1000, toCp(score)));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** How a move is graded by the win chance it threw away (percentage points). */
export function gradeFor(drop: number, wasBest: boolean): MoveGrade {
  if (wasBest) return "best";
  if (drop >= 30) return "blunder";
  if (drop >= 20) return "mistake";
  if (drop >= 10) return "inaccuracy";
  return null;
}

/** One move's accuracy, 0–100, from the win chance it lost. */
export function moveAccuracy(drop: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, drop)) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

export interface GameReview {
  /** Per ply: the grade of the move that was played (`null` = fine). */
  readonly grades: readonly MoveGrade[];
  /** Per side: mean move accuracy, or `null` before any move was analysed. */
  readonly accuracy: Readonly<Record<"w" | "b", number | null>>;
  readonly counts: Readonly<
    Record<"w" | "b", Readonly<Record<"inaccuracy" | "mistake" | "blunder", number>>>
  >;
}

/**
 * Grade every move, given `evals[i]` = the evaluation of the position after
 * `i` moves (index 0 is the start). Missing evals (still being computed)
 * leave a move ungraded.
 */
export function reviewGame(
  moves: readonly { readonly uci: string; readonly by: "w" | "b" }[],
  evals: readonly (PositionEval | undefined)[],
): GameReview {
  const grades: MoveGrade[] = [];
  const sums = { w: 0, b: 0 };
  const n = { w: 0, b: 0 };
  const counts = {
    w: { inaccuracy: 0, mistake: 0, blunder: 0 },
    b: { inaccuracy: 0, mistake: 0, blunder: 0 },
  };
  moves.forEach((move, i) => {
    const before = evals[i];
    const after = evals[i + 1];
    if (!before || !after) {
      grades.push(null);
      return;
    }
    const sign = move.by === "w" ? 1 : -1;
    const wpBefore = sign === 1 ? winPercent(before.score) : 100 - winPercent(before.score);
    const wpAfter = sign === 1 ? winPercent(after.score) : 100 - winPercent(after.score);
    const drop = Math.max(0, wpBefore - wpAfter);
    const grade = gradeFor(drop, before.best === move.uci);
    grades.push(grade);
    sums[move.by] += moveAccuracy(drop);
    n[move.by] += 1;
    if (grade === "inaccuracy" || grade === "mistake" || grade === "blunder")
      counts[move.by][grade] += 1;
  });
  return {
    grades,
    accuracy: {
      w: n.w ? Math.round((sums.w / n.w) * 10) / 10 : null,
      b: n.b ? Math.round((sums.b / n.b) * 10) / 10 : null,
    },
    counts,
  };
}

/** "+1.3", "−0.4", "#3", "#−2" — an eval as players write it, from White's side. */
export function formatScore(score: Score): string {
  if ("mate" in score) return score.mate >= 0 ? `#${score.mate}` : `#−${-score.mate}`;
  const pawns = score.cp / 100;
  const text = Math.abs(pawns).toFixed(1);
  return pawns > 0.04 ? `+${text}` : pawns < -0.04 ? `−${text}` : "0.0";
}
