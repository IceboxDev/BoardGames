import { afterEach, describe, expect, it } from "vitest";
import {
  createFixtureQuestionSource,
  getQuestionSource,
  setQuestionSource,
} from "./question-source.ts";

afterEach(() => setQuestionSource(null));

describe("createFixtureQuestionSource", () => {
  it("lists the original cards and five times as many extended refs", () => {
    const src = createFixtureQuestionSource(30);
    const original = src.listCardRefs("original");
    expect(original).toHaveLength(30);
    expect(original[0]).toBe("f001");
    expect(original[29]).toBe("f030");
    const extended = src.listCardRefs("extended");
    expect(extended).toHaveLength(150);
    expect(extended.slice(0, 30)).toEqual([...original]);
    expect(extended[30]).toBe("f001-v1");
    expect(extended[149]).toBe("f030-v4");
    expect(src.listCardRefs("original")).toBe(original);
  });

  it("builds a 12-set card whose sets line up with the building index", () => {
    const src = createFixtureQuestionSource();
    const card = src.getCard("f007");
    expect(card).not.toBeNull();
    if (!card) return;
    expect(card.ref).toBe("f007");
    expect(card.cardId).toBe("f007");
    expect(card.sets).toHaveLength(12);
    card.sets.forEach((set, i) => {
      expect(set.categoryIndex).toBe(i);
      expect(set.questionId).toBe(`f007-s${String(i + 1).padStart(2, "0")}-q0`);
      expect(set.notesEn).toBe("");
      expect(set.notesDe).toBe("");
    });
    expect(card.sets[4]).toMatchObject({
      en: "Question f007-05 (EN)?",
      de: "Frage f007-05 (DE)?",
      answerEn: "Answer f007-05",
      answerDe: "Antwort f007-05",
    });
  });

  it("derives virtual cards from the sibling suffix", () => {
    const card = createFixtureQuestionSource().getCard("f002-v3");
    expect(card?.cardId).toBe("f002");
    expect(card?.ref).toBe("f002-v3");
    expect(card?.sets[0]).toMatchObject({
      questionId: "f002-s01-q3",
      en: "Question f002-01-v3 (EN)?",
      answerEn: "Answer f002-01-v3",
    });
  });

  it("returns null for refs outside the fixture", () => {
    const src = createFixtureQuestionSource(5);
    expect(src.getCard("f006")).toBeNull();
    expect(src.getCard("f001-v5")).toBeNull();
    expect(src.getCard("c001")).toBeNull();
    expect(src.getCard("")).toBeNull();
  });
});

describe("module-level source", () => {
  it("is empty by default and swaps in and out", () => {
    expect(getQuestionSource().listCardRefs("original")).toEqual([]);
    expect(getQuestionSource().getCard("f001")).toBeNull();
    const src = createFixtureQuestionSource(3);
    setQuestionSource(src);
    expect(getQuestionSource()).toBe(src);
    setQuestionSource(null);
    expect(getQuestionSource().listCardRefs("extended")).toEqual([]);
  });
});
