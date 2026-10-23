import type { JournalArticle, JournalDay, JournalQuestion } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { filterDay, fold, type JournalFilter, NO_FILTER, studyIds } from "./journal-filter";

function question(id: string, over: Partial<JournalQuestion> = {}): JournalQuestion {
  return {
    questionId: id,
    printed: false,
    en: `Question ${id}`,
    de: `Frage ${id}`,
    answerEn: `Answer ${id}`,
    answerDe: `Antwort ${id}`,
    grades: ["good"],
    firstSeen: false,
    fromGame: false,
    ...over,
  };
}

function article(
  articleId: string,
  domain: string,
  questions: JournalQuestion[],
  over: Partial<JournalArticle> = {},
): JournalArticle {
  return {
    articleId,
    domain,
    titleEn: `Title ${articleId}`,
    titleDe: `Titel ${articleId}`,
    readAt: null,
    questions,
    ...over,
  };
}

const DAY: JournalDay = {
  date: "2026-10-06",
  reviewed: 5,
  knew: 3,
  newQuestions: 2,
  articlesRead: 1,
  articles: [
    article("a0001", "music-stage", [
      question("f00001", { grades: ["again", "good"], firstSeen: true }),
      question("f00002", {
        en: "Who wrote the Kinderhymne?",
        de: "Wer schrieb die Kinderhymne?",
      }),
    ]),
    article("a0018", "history", [question("f00088", { grades: ["again"] })]),
    article("a0030", "history", [], { readAt: "2026-10-06T18:00:00.000Z", titleDe: "Bühnenbild" }),
  ],
};

const f = (over: Partial<JournalFilter>): JournalFilter => ({ ...NO_FILTER, ...over });
const ids = (day: JournalDay | null) =>
  day?.articles.map((s) => [s.articleId, s.questions.map((q) => q.questionId)]) ?? null;

describe("filterDay", () => {
  it("returns the day untouched without a filter", () => {
    expect(filterDay(DAY, NO_FILTER)).toBe(DAY);
  });

  it("keeps only questions missed that day", () => {
    expect(ids(filterDay(DAY, f({ mode: "missed" })))).toEqual([
      ["a0001", ["f00001"]],
      ["a0018", ["f00088"]],
    ]);
  });

  it("keeps only first sightings", () => {
    expect(ids(filterDay(DAY, f({ mode: "new" })))).toEqual([["a0001", ["f00001"]]]);
  });

  it("keeps only read articles", () => {
    expect(ids(filterDay(DAY, f({ mode: "read" })))).toEqual([["a0030", []]]);
  });

  it("searches both languages of questions and answers, ignoring case and accents", () => {
    expect(ids(filterDay(DAY, f({ text: "kinderhymne" })))).toEqual([["a0001", ["f00002"]]]);
    expect(ids(filterDay(DAY, f({ text: "ANTWORT f00088" })))).toEqual([["a0018", ["f00088"]]]);
  });

  it("keeps a whole article when its title matches", () => {
    expect(ids(filterDay(DAY, f({ text: "buhnenbild" })))).toEqual([["a0030", []]]);
    expect(ids(filterDay(DAY, f({ text: "title a0001" })))).toEqual([
      ["a0001", ["f00001", "f00002"]],
    ]);
  });

  it("keeps only the chosen domains", () => {
    expect(ids(filterDay(DAY, f({ domains: new Set(["history"]) })))).toEqual([
      ["a0018", ["f00088"]],
      ["a0030", []],
    ]);
  });

  it("drops a day where nothing matches", () => {
    expect(filterDay(DAY, f({ text: "nothing like this" }))).toBeNull();
  });
});

describe("studyIds", () => {
  it("lists every question once, or only the misses, capped", () => {
    expect(studyIds(DAY)).toEqual(["f00001", "f00002", "f00088"]);
    expect(studyIds(DAY, true)).toEqual(["f00001", "f00088"]);
    expect(studyIds(DAY, false, 2)).toHaveLength(2);
  });
});

describe("fold", () => {
  it("strips accents and case", () => {
    expect(fold("Bühne & Müller")).toBe("buhne & muller");
  });
});
