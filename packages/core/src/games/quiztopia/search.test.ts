import { describe, expect, it } from "vitest";
import { buildSearchIndex, foldText, runSearch, type SearchDoc, searchTokens } from "./search.ts";

function doc(
  questionId: string,
  category: number,
  text: { question: string; answer: string; title: string; de?: Partial<SearchDoc["question"]> },
): SearchDoc {
  const setId = questionId.slice(0, 8);
  return {
    questionId,
    setId,
    cardId: questionId.slice(0, 4),
    category,
    original: questionId.endsWith("q0"),
    question: { en: text.question, de: text.de?.de ?? `${text.question} (de)` },
    answer: { en: text.answer, de: `${text.answer} (de)` },
    title: { en: text.title, de: `${text.title} (de)` },
  };
}

const DOCS: SearchDoc[] = [
  doc("c001-s01-q0", 1, {
    question: "Who wrote the poem „Die Kinderhymne“?",
    answer: "Bertolt Brecht",
    title: "Two Germanys, Two Anthems",
    de: { de: "Wer schrieb das Gedicht „Die Kinderhymne“?" },
  }),
  doc("c001-s02-q0", 2, {
    question: "Which city hosts the Brecht archive?",
    answer: "Berlin",
    title: "Capitals of Europe",
  }),
  doc("c002-s01-q1", 1, {
    question: "Which playwright ran the Berliner Ensemble?",
    answer: "Helene Weigel",
    title: "Brecht and the Ensemble",
  }),
  doc("c002-s01-q0", 1, {
    question: "Name the Straße where the Berliner Ensemble stands.",
    answer: "Bertolt-Brecht-Platz",
    title: "Theatres of Berlin",
  }),
];
const INDEX = buildSearchIndex(DOCS);

describe("foldText", () => {
  it("strips diacritics, quotes and ß, lowercases and collapses whitespace", () => {
    expect(foldText("Bühne „Straße“ 'Café'  Élan")).toBe("buhne strasse cafe elan");
    expect(foldText("  Don’t  \n Panic ")).toBe("dont panic");
    expect(foldText("Kinderhymne")).toBe("kinderhymne");
  });

  it("tokenises to at most six tokens of two or more characters", () => {
    expect(searchTokens("a b cd Éf")).toEqual(["cd", "ef"]);
    expect(searchTokens("t1 t2 t3 t4 t5 t6 t7 t8")).toHaveLength(6);
    expect(searchTokens("   ")).toEqual([]);
  });
});

describe("runSearch", () => {
  it("returns nothing for an empty or single-letter query", () => {
    expect(runSearch(INDEX, { q: "", lang: "en", limit: 10 })).toEqual([]);
    expect(runSearch(INDEX, { q: "B", lang: "en", limit: 10 })).toEqual([]);
  });

  it("ANDs the tokens", () => {
    const hits = runSearch(INDEX, { q: "brecht kinderhymne", lang: "en", limit: 10 });
    expect(hits.map((h) => h.questionId)).toEqual(["c001-s01-q0"]);
    expect(runSearch(INDEX, { q: "brecht mars", lang: "en", limit: 10 })).toEqual([]);
  });

  it("scores answer hits over title hits over question hits, word starts +1", () => {
    const hits = runSearch(INDEX, { q: "brecht", lang: "en", limit: 10 });
    expect(hits.map((h) => [h.questionId, h.score])).toEqual([
      ["c001-s01-q0", 5], // answer "Bertolt Brecht", word start
      ["c002-s01-q0", 4], // answer "Bertolt-Brecht-Platz", mid-word
      ["c002-s01-q1", 4], // title "Brecht and the Ensemble", word start
      ["c001-s02-q0", 2], // question only
    ]);
  });

  it("breaks ties with the original question first, then id", () => {
    const hits = runSearch(INDEX, { q: "ensemble", lang: "en", limit: 10 });
    // Both hit the question at word start (2); the title hit of q1 wins (4).
    expect(hits.map((h) => h.questionId)).toEqual(["c002-s01-q1", "c002-s01-q0"]);
    const berlin = runSearch(INDEX, { q: "berliner", lang: "en", limit: 10 });
    expect(berlin.map((h) => [h.questionId, h.score])).toEqual([
      ["c002-s01-q0", 2],
      ["c002-s01-q1", 2],
    ]);
  });

  it("matches folded text in either language and returns that language", () => {
    const de = runSearch(INDEX, { q: "gedicht kinderhymne", lang: "de", limit: 10 });
    expect(de).toHaveLength(1);
    expect(de[0].question).toBe("Wer schrieb das Gedicht „Die Kinderhymne“?");
    expect(de[0].answer).toBe("Bertolt Brecht (de)");
    expect(runSearch(INDEX, { q: "gedicht", lang: "en", limit: 10 })).toEqual([]);
    expect(runSearch(INDEX, { q: "strasse", lang: "en", limit: 10 })[0]?.questionId).toBe(
      "c002-s01-q0",
    );
  });

  it("filters by category and honours the limit", () => {
    const cat1 = runSearch(INDEX, { q: "brecht", lang: "en", limit: 10, category: 1 });
    expect(cat1.every((h) => h.category === 1)).toBe(true);
    expect(cat1).toHaveLength(3);
    expect(runSearch(INDEX, { q: "brecht", lang: "en", limit: 2 })).toHaveLength(2);
    expect(runSearch(INDEX, { q: "brecht", lang: "en", limit: 0 })).toEqual([]);
  });

  it("carries the set and card ids of the hit", () => {
    const [hit] = runSearch(INDEX, { q: "kinderhymne", lang: "en", limit: 1 });
    expect(hit).toMatchObject({
      questionId: "c001-s01-q0",
      setId: "c001-s01",
      cardId: "c001",
      category: 1,
      title: "Two Germanys, Two Anthems",
    });
  });
});
