import type { TrainerOverview } from "@boardgames/core/protocol";

// What "Study all" will bring: every due card of the districts it
// includes, plus one session's new budget drawn across them (the server's
// `capNewAcross`) — articles in whole-set mode, questions otherwise.

export interface StudyAllPlan {
  bySet: boolean;
  /** Due cards in the included districts. */
  due: number;
  /** …of which still being learned (learning / relearning steps). */
  learningDue: number;
  /** …of which scheduled reviews of known cards. */
  reviewDue: number;
  /** New articles (whole-set mode) or new cards this session brings. */
  newUnits: number;
  /** The questions those new units hold. */
  newQuestions: number;
  /** Every card the session deals: due + new questions. */
  total: number;
  /** District numbers "Study all" draws from. */
  included: readonly number[];
  excluded: number;
  /** "22 due + 3 new articles (15 questions)" — what the button promises. */
  summary: string;
}

export function studyAllPlan(
  cats: TrainerOverview["categories"],
  settings: TrainerOverview["settings"],
): StudyAllPlan {
  const bySet = settings.newCardOrder === "sets";
  const included = cats.filter((c) => !settings.excludeFromAll.includes(c.n));
  const due = sum(included.map((c) => c.due));
  const learningDue = sum(included.map((c) => c.learningDue));
  const available = sum(
    included.map((c) => (bySet ? Math.ceil(c.newRemainingToday / 5) : c.newRemainingToday)),
  );
  const newUnits = Math.min(bySet ? settings.newSetsPerDay : settings.newPerDay, available);
  const newQuestions = bySet ? newUnits * 5 : newUnits;
  const unit = bySet
    ? `new article${newUnits === 1 ? "" : "s"}`
    : `new card${newUnits === 1 ? "" : "s"}`;
  const summary = [
    due > 0 ? `${due} due` : null,
    newUnits > 0 ? `${newUnits} ${unit}${bySet ? ` (${newQuestions} questions)` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  return {
    bySet,
    due,
    learningDue,
    reviewDue: due - learningDue,
    newUnits,
    newQuestions,
    total: due + newQuestions,
    included: included.map((c) => c.n),
    excluded: cats.length - included.length,
    summary,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
