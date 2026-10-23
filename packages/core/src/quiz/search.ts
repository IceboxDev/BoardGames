// Dependency-free search over the quiz bank: every fact's lead wording, its
// answer and its article's title, in English, German and Russian (Russian
// falls back to English while a fact is untranslated). Folded
// text (no diacritics, no quotes, lowercase) is prebuilt once; a query is
// an AND of up to six tokens, scored by where each token hits.

export interface SearchDoc {
  factId: string;
  articleId: string;
  domain: string;
  /** A game prints this fact (ranked above our own generated ones). */
  printed: boolean;
  question: { en: string; de: string; ru?: string };
  answer: { en: string; de: string; ru?: string };
  title: { en: string; de: string; ru?: string };
}

export interface SearchHit {
  factId: string;
  articleId: string;
  domain: string;
  question: string;
  answer: string;
  title: string;
  score: number;
}

export type SearchLang = "en" | "de" | "ru";

interface FoldedDoc {
  question: string;
  answer: string;
  title: string;
}

export interface SearchIndex {
  docs: readonly SearchDoc[];
  folded: Record<SearchLang, FoldedDoc[]>;
}

export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[„“”"‚‘’'`´«»]/g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(docs: readonly SearchDoc[]): SearchIndex {
  const fold = (lang: SearchLang): FoldedDoc[] =>
    docs.map((d) => ({
      question: foldText(d.question[lang] ?? d.question.en),
      answer: foldText(d.answer[lang] ?? d.answer.en),
      title: foldText(d.title[lang] ?? d.title.en),
    }));
  return { docs, folded: { en: fold("en"), de: fold("de"), ru: fold("ru") } };
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
  opts: { q: string; lang: SearchLang; limit: number; domain?: string },
): SearchHit[] {
  const tokens = searchTokens(opts.q);
  if (tokens.length === 0) return [];
  const folded = index.folded[opts.lang];
  const scored: { i: number; score: number }[] = [];
  for (let i = 0; i < index.docs.length; i++) {
    const doc = index.docs[i];
    if (opts.domain !== undefined && doc.domain !== opts.domain) continue;
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
    if (da.printed !== db.printed) return da.printed ? -1 : 1;
    return da.factId.localeCompare(db.factId);
  });
  return scored.slice(0, Math.max(0, opts.limit)).map(({ i, score }) => {
    const d = index.docs[i];
    return {
      factId: d.factId,
      articleId: d.articleId,
      domain: d.domain,
      question: d.question[opts.lang] ?? d.question.en,
      answer: d.answer[opts.lang] ?? d.answer.en,
      title: d.title[opts.lang] ?? d.title.en,
      score,
    };
  });
}
