// Win/loss streak arithmetic over a chronological run of decisive results.
//
// One definition, two callers: the profile pages fold a member's own match
// summaries through it, and the skill-rating recompute folds every member's
// derived results through it to find who currently holds the group's longest
// active run. Keeping the rule here means "five straight" means the same
// thing on a profile card and in a spotlight greeting.

/** The only dispositions that participate: everything else is transparent. */
export type StreakResult = "win" | "loss" | "draw";

export type StreakRun = { type: "win" | "loss"; length: number };

export interface StreakInfo {
  /**
   * The live run of consecutive wins or losses; null when none — a draw just
   * broke it, or there are no decisive results yet.
   */
  current: StreakRun | null;
  /** Longest win run in the supplied history. */
  bestWin: number;
}

/**
 * Fold decisive results, oldest first, into streak info. Draws BREAK a run
 * (a run of wins ends on a draw) but never start one; callers are expected to
 * have already dropped non-decisive results (moderator seats, scored co-ops,
 * ongoing campaigns), which neither extend nor break a run.
 */
export function streakInfo(results: readonly StreakResult[]): StreakInfo {
  let bestWin = 0;
  let run: StreakRun | null = null;
  for (const result of results) {
    if (result === "draw") {
      run = null;
      continue;
    }
    run =
      run && run.type === result
        ? { type: result, length: run.length + 1 }
        : { type: result, length: 1 };
    if (result === "win" && run.length > bestWin) bestWin = run.length;
  }
  return { current: run, bestWin };
}

/** The live win run's length, or 0 when the latest decisive result wasn't a win. */
export function activeWinStreak(results: readonly StreakResult[]): number {
  const { current } = streakInfo(results);
  return current?.type === "win" ? current.length : 0;
}
