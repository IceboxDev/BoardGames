// Integrity of the committed content under `./content/`: the files must
// re-validate against the shared shapes, the index must describe exactly
// what is on disk (the version hash included), and every answer span must
// still point at its answer. Each file is parsed once, up front.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { QUIZTOPIA_CATEGORIES } from "./categories.ts";
import {
  type CardArticles,
  CardArticlesSchema,
  type CardQuestions,
  CardQuestionsSchema,
  type ContentIndex,
  ContentIndexSchema,
  type Titles,
  TitlesSchema,
} from "./content-types.ts";
import { parseQuestionId, parseSetId, QUESTIONS_PER_SET, SETS_PER_CARD } from "./ids.ts";
import { contentVersion } from "./import/normalize.ts";

const DIR = fileURLToPath(new URL("./content/", import.meta.url));

const EXPECTED = { cards: 177, sets: 2124, questions: 10620 };

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(rel, `file://${DIR}`), "utf8"));
}

let index: ContentIndex;
let titles: Titles;
let questions: CardQuestions[];
let articles: CardArticles[];

beforeAll(() => {
  index = ContentIndexSchema.parse(readJson("index.json"));
  titles = TitlesSchema.parse(readJson("titles.json"));
  questions = index.cards.map((c) => CardQuestionsSchema.parse(readJson(`questions/${c.id}.json`)));
  articles = index.cards.map((c) => CardArticlesSchema.parse(readJson(`articles/${c.id}.json`)));
});

describe("quiztopia content", () => {
  it("has the expected counts and the version recomputed from the files", () => {
    expect(index.counts).toEqual(EXPECTED);
    expect(index.cards).toHaveLength(EXPECTED.cards);
    expect(questions).toHaveLength(EXPECTED.cards);
    expect(articles).toHaveLength(EXPECTED.cards);
    expect(
      contentVersion({
        categories: index.categories,
        cards: index.cards,
        titles,
        questions,
        articles,
      }),
    ).toBe(index.version);
  });

  it("pins c001 to the first photographed card and lists the shared categories", () => {
    expect(index.cards[0]).toEqual({ id: "c001", sourceImage: "IMG20260910164837.jpg" });
    expect(index.categories).toEqual(
      QUIZTOPIA_CATEGORIES.map(({ n, en, de, band }) => ({ n, en, de, band })),
    );
    const ids = index.cards.map((c) => c.id);
    expect(ids).toEqual(ids.map((_, i) => `c${String(i + 1).padStart(3, "0")}`));
    expect(new Set(index.cards.map((c) => c.sourceImage)).size).toBe(ids.length);
  });

  it("gives every question an id that names its file position", () => {
    let count = 0;
    questions.forEach((card, ci) => {
      expect(card.id).toBe(index.cards[ci].id);
      expect(card.sourceImage).toBe(index.cards[ci].sourceImage);
      expect(card.sets).toHaveLength(SETS_PER_CARD);
      card.sets.forEach((set, si) => {
        expect(set.n).toBe(si + 1);
        expect(parseSetId(set.id)).toEqual({ cardId: card.id, n: si + 1 });
        expect(set.questions).toHaveLength(QUESTIONS_PER_SET);
        set.questions.forEach((q, qi) => {
          expect(parseQuestionId(q.id)).toEqual({
            cardId: card.id,
            setId: set.id,
            n: si + 1,
            q: qi,
          });
          count++;
        });
      });
    });
    expect(count).toBe(EXPECTED.questions);
  });

  it("has one title pair per set, matching the article files", () => {
    expect(Object.keys(titles)).toHaveLength(EXPECTED.sets);
    articles.forEach((card, ci) => {
      expect(card.id).toBe(index.cards[ci].id);
      card.sets.forEach((set, si) => {
        expect(set.id).toBe(questions[ci].sets[si].id);
        expect(titles[set.id]).toEqual([set.titleEn, set.titleDe]);
      });
    });
  });

  it("points every answer span at its answer (case-insensitively)", () => {
    const mismatches: string[] = [];
    articles.forEach((card, ci) => {
      card.sets.forEach((set, si) => {
        const qs = questions[ci].sets[si].questions;
        set.answerSpans.en.forEach(([start, len], qi) => {
          const slice = set.articleEn.slice(start, start + len);
          if (slice.toLowerCase() !== qs[qi].answerEn.toLowerCase()) {
            mismatches.push(`${qs[qi].id} en: "${slice}" != "${qs[qi].answerEn}"`);
          }
        });
        set.answerSpans.de.forEach(([start, len], qi) => {
          const slice = set.articleDe.slice(start, start + len);
          if (slice.toLowerCase() !== qs[qi].answerDe.toLowerCase()) {
            mismatches.push(`${qs[qi].id} de: "${slice}" != "${qs[qi].answerDe}"`);
          }
        });
      });
    });
    expect(mismatches).toEqual([]);
  });
});
