import type { JournalArticle, JournalDay, JournalQuestion } from "@boardgames/core/protocol";

// The journal's filters, applied to the days already loaded: free text (over
// both languages of the question, the answer and the article title), a mode
// (missed / new / read) and a set of domains. Pure, so it is tested
// without a DOM.

export type JournalMode = "all" | "missed" | "new" | "read";

export interface JournalFilter {
  text: string;
  mode: JournalMode;
  /** Domain slugs to keep; empty = every domain. */
  domains: ReadonlySet<string>;
}

export const NO_FILTER: JournalFilter = { text: "", mode: "all", domains: new Set() };

/** Lower-case, accents stripped: "Bühne" matches "buhne". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function isFiltering(f: JournalFilter): boolean {
  return f.text.trim() !== "" || f.mode !== "all" || f.domains.size > 0;
}

function questionMatchesMode(q: JournalQuestion, mode: JournalMode): boolean {
  if (mode === "missed") return q.grades.includes("again");
  if (mode === "new") return q.firstSeen;
  return true;
}

function questionMatchesText(q: JournalQuestion, needle: string): boolean {
  return [q.en, q.de, q.answerEn, q.answerDe].some((t) => fold(t).includes(needle));
}

function filterArticle(
  set: JournalArticle,
  f: JournalFilter,
  needle: string,
): JournalArticle | null {
  if (f.domains.size > 0 && !f.domains.has(set.domain)) return null;
  if (f.mode === "read" && set.readAt === null) return null;
  // A title hit keeps the whole article; otherwise only the matching questions.
  const titleHit =
    needle !== "" && [set.titleEn, set.titleDe].some((t) => fold(t).includes(needle));
  const questions = set.questions.filter(
    (q) =>
      questionMatchesMode(q, f.mode) &&
      (needle === "" || titleHit || questionMatchesText(q, needle)),
  );
  // A read-only article survives the "all"/"read" modes; a text search needs a hit.
  const keepEmpty =
    (f.mode === "all" || f.mode === "read") && set.readAt !== null && (needle === "" || titleHit);
  if (questions.length === 0 && !keepEmpty) return null;
  return questions.length === set.questions.length ? set : { ...set, questions };
}

/** The day with only what passes the filter, or null when nothing does. */
export function filterDay(day: JournalDay, f: JournalFilter): JournalDay | null {
  if (!isFiltering(f)) return day;
  const needle = fold(f.text.trim());
  const articles = day.articles.flatMap((s) => {
    const kept = filterArticle(s, f, needle);
    return kept ? [kept] : [];
  });
  return articles.length > 0 ? { ...day, articles } : null;
}

/** Fact ids to study again from a day (deduped, in order), optionally just the misses. */
export function studyIds(day: JournalDay, onlyMissed = false, cap = 200): string[] {
  const ids: string[] = [];
  for (const set of day.articles) {
    for (const q of set.questions) {
      if (onlyMissed && !q.grades.includes("again")) continue;
      if (!ids.includes(q.questionId)) ids.push(q.questionId);
    }
  }
  return ids.slice(0, cap);
}
