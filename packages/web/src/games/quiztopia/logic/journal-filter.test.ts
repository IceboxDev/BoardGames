import type { JournalDay, JournalQuestion, JournalSet } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { filterDay, fold, type JournalFilter, NO_FILTER, studyIds } from "./journal-filter";

function question(id: string, over: Partial<JournalQuestion> = {}): JournalQuestion {
  return {
    questionId: id,
    q: Number(id.slice(-1)),
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

function set(
  setId: string,
  questions: JournalQuestion[],
  over: Partial<JournalSet> = {},
): JournalSet {
  return {
    setId,
    category: Number(setId.slice(6, 8)),
    titleEn: `Title ${setId}`,
    titleDe: `Titel ${setId}`,
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
  sets: [
    set("c001-s01", [
      question("c001-s01-q0", { grades: ["again", "good"], firstSeen: true }),
      question("c001-s01-q1", {
        en: "Who wrote the Kinderhymne?",
        de: "Wer schrieb die Kinderhymne?",
      }),
    ]),
    set("c002-s06", [question("c002-s06-q2", { grades: ["again"] })]),
    set("c003-s06", [], { readAt: "2026-10-06T18:00:00.000Z", titleDe: "Bühnenbild" }),
  ],
};

const f = (over: Partial<JournalFilter>): JournalFilter => ({ ...NO_FILTER, ...over });
const ids = (day: JournalDay | null) =>
  day?.sets.map((s) => [s.setId, s.questions.map((q) => q.questionId)]) ?? null;

describe("filterDay", () => {
  it("returns the day untouched without a filter", () => {
    expect(filterDay(DAY, NO_FILTER)).toBe(DAY);
  });

  it("keeps only questions missed that day", () => {
    expect(ids(filterDay(DAY, f({ mode: "missed" })))).toEqual([
      ["c001-s01", ["c001-s01-q0"]],
      ["c002-s06", ["c002-s06-q2"]],
    ]);
  });

  it("keeps only first sightings", () => {
    expect(ids(filterDay(DAY, f({ mode: "new" })))).toEqual([["c001-s01", ["c001-s01-q0"]]]);
  });

  it("keeps only read articles", () => {
    expect(ids(filterDay(DAY, f({ mode: "read" })))).toEqual([["c003-s06", []]]);
  });

  it("searches both languages of questions and answers, ignoring case and accents", () => {
    expect(ids(filterDay(DAY, f({ text: "kinderhymne" })))).toEqual([
      ["c001-s01", ["c001-s01-q1"]],
    ]);
    expect(ids(filterDay(DAY, f({ text: "ANTWORT c002" })))).toEqual([
      ["c002-s06", ["c002-s06-q2"]],
    ]);
  });

  it("keeps a whole article when its title matches", () => {
    expect(ids(filterDay(DAY, f({ text: "buhnenbild" })))).toEqual([["c003-s06", []]]);
    expect(ids(filterDay(DAY, f({ text: "title c001" })))).toEqual([
      ["c001-s01", ["c001-s01-q0", "c001-s01-q1"]],
    ]);
  });

  it("keeps only the chosen districts", () => {
    expect(ids(filterDay(DAY, f({ districts: new Set([6]) })))).toEqual([
      ["c002-s06", ["c002-s06-q2"]],
      ["c003-s06", []],
    ]);
  });

  it("drops a day where nothing matches", () => {
    expect(filterDay(DAY, f({ text: "nothing like this" }))).toBeNull();
  });
});

describe("studyIds", () => {
  it("lists every question once, or only the misses, capped", () => {
    expect(studyIds(DAY)).toEqual(["c001-s01-q0", "c001-s01-q1", "c002-s06-q2"]);
    expect(studyIds(DAY, true)).toEqual(["c001-s01-q0", "c002-s06-q2"]);
    expect(studyIds(DAY, false, 2)).toHaveLength(2);
  });
});

describe("fold", () => {
  it("strips accents and case", () => {
    expect(fold("Bühne & Müller")).toBe("buhne & muller");
  });
});
