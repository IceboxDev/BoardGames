// Dependency-free search over questions, answers and article titles. Folded
// text (no diacritics, no quotes, lowercase) is prebuilt once; a query is
// an AND of up to six tokens, scored by where each token hits.

export interface SearchDoc {
  questionId: string;
  setId: string;
  cardId: string;
  /** Category n, 1..12. */
  category: number;
  original: boolean;
  question: { en: string; de: string };
  answer: { en: string; de: string };
  title: { en: string; de: string };
}

export interface SearchHit {
  questionId: string;
  setId: string;
  cardId: string;
  category: number;
  question: string;
  answer: string;
  title: string;
  score: number;
}

export type SearchLang = "en" | "de";

interface FoldedDoc {
  question: string;
  answer: string;
  title: string;
}

export interface SearchIndex {
  docs: readonly SearchDoc[];
  folded: { en: FoldedDoc[]; de: FoldedDoc[] };
}

export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[„“”"‚‘’'`´]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(docs: readonly SearchDoc[]): SearchIndex {
  const fold = (lang: SearchLang): FoldedDoc[] =>
    docs.map((d) => ({
      question: foldText(d.question[lang]),
      answer: foldText(d.answer[lang]),
      title: foldText(d.title[lang]),
    }));
  return { docs, folded: { en: fold("en"), de: fold("de") } };
}

export const SEARCH_MAX_TOKENS = 6;

export function searchTokens(q: string): string[] {
  return foldText(q)
    .split(" ")
    .filter((t) => t.length >= 2)
    .slice(0, SEARCH_MAX_TOKENS);
}

function hitScore(haystack: string, token: string, weight: number): number {
  const i = haystack.indexOf(token);
  if (i < 0) return 0;
  const wordStart = i === 0 || haystack[i - 1] === " ";
  return weight + (wordStart ? 1 : 0);
}

export function runSearch(
  index: SearchIndex,
  opts: { q: string; lang: SearchLang; limit: number; category?: number },
): SearchHit[] {
  const tokens = searchTokens(opts.q);
  if (tokens.length === 0) return [];
  const folded = index.folded[opts.lang];
  const scored: { i: number; score: number }[] = [];
  for (let i = 0; i < index.docs.length; i++) {
    const doc = index.docs[i];
    if (opts.category !== undefined && doc.category !== opts.category) continue;
    const f = folded[i];
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const s = Math.max(
        hitScore(f.answer, t, 4),
        hitScore(f.title, t, 3),
        hitScore(f.question, t, 1),
      );
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) scored.push({ i, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = index.docs[a.i];
    const db = index.docs[b.i];
    if (da.original !== db.original) return da.original ? -1 : 1;
    return da.questionId.localeCompare(db.questionId);
  });
  return scored.slice(0, Math.max(0, opts.limit)).map(({ i, score }) => {
    const d = index.docs[i];
    return {
      questionId: d.questionId,
      setId: d.setId,
      cardId: d.cardId,
      category: d.category,
      question: d.question[opts.lang],
      answer: d.answer[opts.lang],
      title: d.title[opts.lang],
      score,
    };
  });
}
