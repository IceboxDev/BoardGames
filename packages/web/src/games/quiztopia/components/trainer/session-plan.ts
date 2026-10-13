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
  /** Whole-set mode: questions left over from articles begun on an earlier
   *  sitting — dealt on top of the day's new articles. */
  leftover: number;
  /** Every card the session deals: due + new questions + leftovers. */
  total: number;
  /** District numbers "Study all" draws from. */
  included: readonly number[];
  excluded: number;
  /** "22 due + 3 new articles (15 questions) + 1 to finish" — what the button promises. */
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
  const leftover = bySet ? sum(included.map((c) => c.leftoverToday)) : 0;
  const unit = bySet
    ? `new article${newUnits === 1 ? "" : "s"}`
    : `new card${newUnits === 1 ? "" : "s"}`;
  const summary = [
    due > 0 ? `${due} due` : null,
    newUnits > 0 ? `${newUnits} ${unit}${bySet ? ` (${newQuestions} questions)` : ""}` : null,
    leftover > 0 ? `${leftover} to finish` : null,
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
    leftover,
    total: due + newQuestions + leftover,
    included: included.map((c) => c.n),
    excluded: cats.length - included.length,
    summary,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** An article the day's intro reads before any card is dealt. */
export interface ArticleToRead {
  setId: string;
  cardId: string;
  category: number;
}

/**
 * The whole-set day's reading list: each article with a new question in the
 * session, in deal order — except an article begun on an earlier sitting,
 * which was read then; its leftover questions are just dealt.
 */
export function articlesToRead(
  items: readonly {
    setId: string;
    cardId: string;
    category: number;
    tier: string;
    setStarted?: boolean;
  }[],
): ArticleToRead[] {
  const seen = new Map<string, ArticleToRead>();
  for (const it of items) {
    if (it.tier !== "new" || it.setStarted || seen.has(it.setId)) continue;
    seen.set(it.setId, { setId: it.setId, cardId: it.cardId, category: it.category });
  }
  return [...seen.values()];
}
