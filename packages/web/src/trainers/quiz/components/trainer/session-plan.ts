import type { TrainerOverview } from "@boardgames/core/protocol";

// What "Study all" will bring: every due card of the domains it includes,
// plus the day's new facts — whole articles under the fact budget — and the
// leftovers of articles begun on an earlier sitting.

export interface StudyAllPlan {
  /** Due cards in the included domains. */
  due: number;
  /** …of which still being learned (learning / relearning steps). */
  learningDue: number;
  /** …of which scheduled reviews of known cards. */
  reviewDue: number;
  /** New facts the day's budget still allows (whole articles; an estimate). */
  newFacts: number;
  /** Facts left over from articles begun on an earlier sitting — dealt on top. */
  leftover: number;
  /** Every card the session deals: due + new + leftovers. */
  total: number;
  /** Domain slugs "Study all" draws from. */
  included: readonly string[];
  excluded: number;
  /** "22 due + 15 new + 1 to finish" — what the button promises. */
  summary: string;
}

export function studyAllPlan(overview: TrainerOverview): StudyAllPlan {
  const { settings } = overview;
  const included = overview.domains.filter((d) => !settings.excludeFromAll.includes(d.domain));
  const due = sum(included.map((d) => d.due));
  const learningDue = sum(included.map((d) => d.learningDue));
  const available = sum(included.map((d) => d.newAvailable));
  const newFacts = Math.min(overview.newRemainingToday, available);
  const leftover = overview.leftoverToday;
  const summary = [
    due > 0 ? `${due} due` : null,
    newFacts > 0 ? `${newFacts} new` : null,
    leftover > 0 ? `${leftover} to finish` : null,
  ]
    .filter(Boolean)
    .join(" + ");
  return {
    due,
    learningDue,
    reviewDue: due - learningDue,
    newFacts,
    leftover,
    total: due + newFacts + leftover,
    included: included.map((d) => d.domain),
    excluded: overview.domains.length - included.length,
    summary,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** An article the day's intro reads before any card is dealt. */
export interface ArticleToRead {
  articleId: string;
  domain: string;
}

/**
 * The day's reading list: each article with a new fact in the session, in
 * deal order — except an article begun on an earlier sitting, which was
 * read then; its leftover facts are just dealt.
 */
export function articlesToRead(
  items: readonly { articleId: string; domain: string; tier: string; articleStarted?: boolean }[],
): ArticleToRead[] {
  const seen = new Map<string, ArticleToRead>();
  for (const it of items) {
    if (it.tier !== "new" || it.articleStarted || seen.has(it.articleId)) continue;
    seen.set(it.articleId, { articleId: it.articleId, domain: it.domain });
  }
  return [...seen.values()];
}
