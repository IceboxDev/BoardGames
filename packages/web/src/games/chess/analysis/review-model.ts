/**
 * What the review board says about a finished game, as data: the story of
 * each move (its grade, what it changed, in a few fixed words), the game's
 * key moments, the mistakes worth practising, and how a practice answer
 * measures up. Pure — engine evaluations in, plain values out — so every
 * rule is unit-tested; the components only lay it out.
 *
 * Conventions (as `useAnalysis`): `evals[p]` is the position after `p`
 * moves; move `i` (0-based) made position `i + 1`. Scores are White's.
 */

import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { MoveGrade } from "../components/MoveList";
import { gradeFor, type PositionEval, type Score, winPercent } from "./grade";

/** Where a position leaves one side, by its chance to win. */
export type Band = "winning" | "better" | "equal" | "worse" | "losing";

/** `side`'s chance to win, 0–100. */
export function winFor(score: Score, side: Color): number {
  const white = winPercent(score);
  return side === "w" ? white : 100 - white;
}

export function bandOf(score: Score, side: Color): Band {
  const p = winFor(score, side);
  if (p >= 70) return "winning";
  if (p >= 58) return "better";
  if (p > 42) return "equal";
  if (p > 30) return "worse";
  return "losing";
}

/** Mate for `side` in N moves (positive), against it (negative), or `null`. */
function mateFor(score: Score, side: Color): number | null {
  if (!("mate" in score) || score.mate === 0) return null;
  return side === "w" ? score.mate : -score.mate;
}

export interface MoveStory {
  /** Index into the game's moves. */
  readonly index: number;
  readonly by: Color;
  readonly grade: MoveGrade;
  readonly before: Score;
  readonly after: Score;
  /** Win chance the move threw away, in points (0 when it gained). */
  readonly drop: number;
  /** The move in a few words (its mark says the grade): "Turns it lost", "Misses mate in 3". */
  readonly words: string;
  /** The engine's move where this one was played (UCI), when known. */
  readonly best: string | null;
}

/**
 * Move `index`'s story, or `null` while either side of it is still being
 * evaluated.
 */
export function storyOf(
  moves: readonly { readonly uci: string; readonly by: Color }[],
  evals: readonly (PositionEval | undefined)[],
  index: number,
): MoveStory | null {
  const move = moves[index];
  const before = evals[index];
  const after = evals[index + 1];
  if (!move || !before || !after) return null;
  const side = move.by;
  const drop = Math.max(0, winFor(before.score, side) - winFor(after.score, side));
  const wasBest = before.best === move.uci;
  const grade = gradeFor(drop, wasBest);
  return {
    index,
    by: side,
    grade,
    before: before.score,
    after: after.score,
    drop,
    words: wordsFor(before.score, after.score, side, grade),
    best: before.best,
  };
}

function wordsFor(before: Score, after: Score, side: Color, grade: MoveGrade): string {
  const hadMate = mateFor(before, side);
  const hasMate = mateFor(after, side);
  if (hadMate !== null && hadMate > 0 && (hasMate === null || hasMate < 0)) {
    return `Misses mate in ${hadMate}`;
  }
  if (hasMate !== null && hasMate < 0 && (hadMate === null || hadMate > 0)) {
    return `Allows mate in ${-hasMate}`;
  }
  const from = bandOf(before, side);
  const to = bandOf(after, side);
  switch (grade) {
    case "best":
      return "Best move";
    case "blunder":
      if (to === "losing" && from !== "losing") return "Turns it lost";
      if (from === "winning") return "Throws the win away";
      return "Blunder";
    case "mistake":
      return from === "winning" || from === "better" ? "Lets the advantage go" : "Mistake";
    case "inaccuracy":
      return "Gives back some edge";
    case null:
      return "Good";
  }
}

const FLAWS = new Set<MoveGrade>(["inaccuracy", "mistake", "blunder"]);
const SERIOUS = new Set<MoveGrade>(["mistake", "blunder"]);

/**
 * The moves that decided the game: every mistake and blunder, and every move
 * that crossed from one band to another for the side that played it (better
 * → worse), the biggest swings first, at most `max`, back in game order.
 */
export function keyMoments(stories: readonly (MoveStory | null)[], max = 5): MoveStory[] {
  const picked = stories.filter(
    (s): s is MoveStory =>
      s !== null &&
      s.drop >= 10 &&
      (SERIOUS.has(s.grade) || bandOf(s.before, s.by) !== bandOf(s.after, s.by)),
  );
  return picked
    .sort((a, b) => b.drop - a.drop)
    .slice(0, max)
    .sort((a, b) => a.index - b.index);
}

/** The mistakes and blunders `sides` made, in game order — what practice deals. */
export function practiceQueue(
  stories: readonly (MoveStory | null)[],
  sides: readonly Color[],
): number[] {
  return stories.flatMap((s) =>
    s && SERIOUS.has(s.grade) && sides.includes(s.by) ? [s.index] : [],
  );
}

/** Per side: the indices of its flawed moves (?! ? ??), for "jump to the next one". */
export function flawsOf(stories: readonly (MoveStory | null)[], side: Color): number[] {
  return stories.flatMap((s) => (s && s.by === side && FLAWS.has(s.grade) ? [s.index] : []));
}

export type Verdict = "best" | "keeps" | "miss";

/**
 * A practice answer against the engine's best at that position: within 5
 * points of its win chance is as good as best, within 10 keeps the game, more
 * is a miss. `best` and `answer` are the positions after each move.
 */
export function judge(best: Score, answer: Score, side: Color): { verdict: Verdict; drop: number } {
  const drop = Math.max(0, winFor(best, side) - winFor(answer, side));
  return { verdict: drop < 5 ? "best" : drop < 10 ? "keeps" : "miss", drop };
}
