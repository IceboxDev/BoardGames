import type { JournalDay, JournalQuestion, JournalSet } from "@boardgames/core/protocol";

// The journal's filters, applied to the days already loaded: free text (over
// both languages of the question, the answer and the article title), a mode
// (missed / new / read) and a set of districts. Pure, so it is tested
// without a DOM.

export type JournalMode = "all" | "missed" | "new" | "read";

export interface JournalFilter {
  text: string;
  mode: JournalMode;
  /** District numbers to keep; empty = every district. */
  districts: ReadonlySet<number>;
}

export const NO_FILTER: JournalFilter = { text: "", mode: "all", districts: new Set() };

/** Lower-case, accents stripped: "Bühne" matches "buhne". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function isFiltering(f: JournalFilter): boolean {
  return f.text.trim() !== "" || f.mode !== "all" || f.districts.size > 0;
}

function questionMatchesMode(q: JournalQuestion, mode: JournalMode): boolean {
  if (mode === "missed") return q.grades.includes("again");
  if (mode === "new") return q.firstSeen;
  return true;
}

function questionMatchesText(q: JournalQuestion, needle: string): boolean {
  return [q.en, q.de, q.answerEn, q.answerDe].some((t) => fold(t).includes(needle));
}

function filterSet(set: JournalSet, f: JournalFilter, needle: string): JournalSet | null {
  if (f.districts.size > 0 && !f.districts.has(set.category)) return null;
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
  const sets = day.sets.flatMap((s) => {
    const kept = filterSet(s, f, needle);
    return kept ? [kept] : [];
  });
  return sets.length > 0 ? { ...day, sets } : null;
}

/** Question ids to study again from a day (deduped, in order), optionally just the misses. */
export function studyIds(day: JournalDay, onlyMissed = false, cap = 200): string[] {
  const ids: string[] = [];
  for (const set of day.sets) {
    for (const q of set.questions) {
      if (onlyMissed && !q.grades.includes("again")) continue;
      if (!ids.includes(q.questionId)) ids.push(q.questionId);
    }
  }
  return ids.slice(0, cap);
}
