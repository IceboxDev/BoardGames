// Pure transform from the transcription output (one JSON per photographed
// card, see ~/Downloads/quiz-cards/tools/WORKER_INSTRUCTIONS.md) into the
// committed content files. The CLI in `scripts/quiztopia-import.ts` does the
// file IO; this module is what the tests exercise.
//
// Id stability: card ids are handed out in ascending image-stem order the
// first time and then pinned through the previous `index.json`, so a
// re-import (a re-shot photo, a corrected question) never renumbers a card
// that trainer rows already reference.

import { createHash } from "node:crypto";
import { QUIZTOPIA_CATEGORIES } from "../categories.ts";
import {
  type CardArticles,
  CardArticlesSchema,
  type CardQuestions,
  CardQuestionsSchema,
  type ContentIndex,
  ContentIndexSchema,
  type Titles,
  TitlesSchema,
} from "../content-types.ts";
import { cardId, QUESTIONS_PER_SET, questionId, SETS_PER_CARD, setId } from "../ids.ts";

export interface RawQuestion {
  original: boolean;
  de: string;
  en: string;
  answer_de: string;
  answer_en: string;
}

export interface RawSet {
  n: number;
  category_en: string;
  category_de: string;
  questions: RawQuestion[];
  article_title_en: string;
  article_en: string;
  article_title_de: string;
  article_de: string;
  notes?: string;
}

export interface RawCard {
  image: string;
  sets: RawSet[];
}

export interface NormalizeInput {
  /** `stem` = image file name without extension (the sort key). */
  cards: readonly { stem: string; card: RawCard }[];
  previousIndex: ContentIndex | null;
  /** Let cards that were in the previous index disappear (default: throw). */
  allowRemoved?: boolean;
  generatedAt?: string;
}

export interface NormalizeOutput {
  index: ContentIndex;
  titles: Titles;
  questions: CardQuestions[];
  articles: CardArticles[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where the answer sits in the article: an exact match first, then a
 * case-insensitive one (the prose lowercases "Neck stiffness" mid-sentence).
 * Null when the article does not contain the answer at all.
 */
export function locateAnswerSpan(article: string, answer: string): [number, number] | null {
  const exact = article.indexOf(answer);
  if (exact >= 0) return [exact, answer.length];
  const m = new RegExp(escapeRegExp(answer), "iu").exec(article);
  if (!m) return null;
  return [m.index, m[0].length];
}

function stemOf(image: string): string {
  return image.replace(/\.[^.]+$/, "");
}

/** First 12 hex of sha256 over the canonical content; the content version. */
export function contentVersion(parts: {
  categories: ContentIndex["categories"];
  cards: ContentIndex["cards"];
  titles: Titles;
  questions: CardQuestions[];
  articles: CardArticles[];
}): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(parts.categories));
  h.update(JSON.stringify(parts.cards));
  h.update(JSON.stringify(parts.titles));
  for (const q of parts.questions) h.update(JSON.stringify(q));
  for (const a of parts.articles) h.update(JSON.stringify(a));
  return h.digest("hex").slice(0, 12);
}

export function normalizeCards(input: NormalizeInput): NormalizeOutput {
  const byStem = new Map<string, RawCard>();
  for (const { stem, card } of input.cards) {
    if (byStem.has(stem)) throw new Error(`duplicate image stem: ${stem}`);
    byStem.set(stem, card);
  }

  // Pin known ids, then hand out the next free ordinals in stem order.
  const idByStem = new Map<string, string>();
  const taken = new Set<string>();
  for (const prev of input.previousIndex?.cards ?? []) {
    const stem = stemOf(prev.sourceImage);
    if (!byStem.has(stem)) {
      if (!input.allowRemoved) {
        throw new Error(
          `card ${prev.id} (${prev.sourceImage}) is missing from the import; pass --allow-removed to drop it`,
        );
      }
      continue;
    }
    idByStem.set(stem, prev.id);
    taken.add(prev.id);
  }
  let next = 1;
  for (const stem of [...byStem.keys()].sort()) {
    if (idByStem.has(stem)) continue;
    while (taken.has(cardId(next))) next++;
    const id = cardId(next);
    idByStem.set(stem, id);
    taken.add(id);
  }

  const ordered = [...idByStem.entries()].sort((a, b) => (a[1] < b[1] ? -1 : 1));

  const titles: Titles = {};
  const questions: CardQuestions[] = [];
  const articles: CardArticles[] = [];
  const cards: ContentIndex["cards"] = [];

  for (const [stem, id] of ordered) {
    const raw = byStem.get(stem) as RawCard;
    if (raw.sets.length !== SETS_PER_CARD) {
      throw new Error(`${stem}: expected ${SETS_PER_CARD} sets, got ${raw.sets.length}`);
    }
    const qSets: CardQuestions["sets"] = [];
    const aSets: CardArticles["sets"] = [];
    raw.sets.forEach((set, i) => {
      const n = i + 1;
      if (set.n !== n) throw new Error(`${stem}: set ${i} has n=${set.n}, expected ${n}`);
      const cat = QUIZTOPIA_CATEGORIES[i];
      if (set.category_en !== cat.en || set.category_de !== cat.de) {
        throw new Error(`${stem} set ${n}: category "${set.category_en}" != "${cat.en}"`);
      }
      if (set.questions.length !== QUESTIONS_PER_SET) {
        throw new Error(`${stem} set ${n}: expected ${QUESTIONS_PER_SET} questions`);
      }
      const sid = setId(id, n);
      const qs = set.questions.map((q, qi) => {
        if (q.original !== (qi === 0)) {
          throw new Error(`${stem} set ${n}: question ${qi} original flag mismatch`);
        }
        return {
          id: questionId(sid, qi),
          en: q.en.trim(),
          de: q.de.trim(),
          answerEn: q.answer_en.trim(),
          answerDe: q.answer_de.trim(),
        };
      });
      const articleEn = set.article_en.normalize("NFC");
      const articleDe = set.article_de.normalize("NFC");
      const spansEn = qs.map((q) => {
        const span = locateAnswerSpan(articleEn, q.answerEn.normalize("NFC"));
        if (!span) throw new Error(`${q.id}: answer "${q.answerEn}" not found in article_en`);
        return span;
      });
      const spansDe = qs.map((q) => {
        const span = locateAnswerSpan(articleDe, q.answerDe.normalize("NFC"));
        if (!span) throw new Error(`${q.id}: answer "${q.answerDe}" not found in article_de`);
        return span;
      });
      qSets.push({ id: sid, n, notes: (set.notes ?? "").trim(), questions: qs });
      aSets.push({
        id: sid,
        titleEn: set.article_title_en.trim(),
        articleEn,
        titleDe: set.article_title_de.trim(),
        articleDe,
        answerSpans: { en: spansEn, de: spansDe },
      });
      titles[sid] = [set.article_title_en.trim(), set.article_title_de.trim()];
    });
    cards.push({ id, sourceImage: raw.image });
    questions.push({ id, sourceImage: raw.image, sets: qSets });
    articles.push({ id, sets: aSets });
  }

  const categories = QUIZTOPIA_CATEGORIES.map(({ n, en, de, band }) => ({ n, en, de, band }));
  const version = contentVersion({ categories, cards, titles, questions, articles });
  const index: ContentIndex = {
    version,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    counts: {
      cards: cards.length,
      sets: cards.length * SETS_PER_CARD,
      questions: cards.length * SETS_PER_CARD * QUESTIONS_PER_SET,
    },
    categories,
    cards,
  };

  return {
    index: ContentIndexSchema.parse(index),
    titles: TitlesSchema.parse(titles),
    questions: questions.map((q) => CardQuestionsSchema.parse(q)),
    articles: articles.map((a) => CardArticlesSchema.parse(a)),
  };
}
