import { describe, expect, it } from "vitest";
import { buildSearchIndex, foldText, runSearch, type SearchDoc, searchTokens } from "./search.ts";

function doc(
  factId: string,
  articleId: string,
  domain: string,
  printed: boolean,
  text: { question: string; answer: string; title: string; de?: Partial<SearchDoc["question"]> },
): SearchDoc {
  return {
    factId,
    articleId,
    domain,
    printed,
    question: { en: text.question, de: text.de?.de ?? `${text.question} (de)` },
    answer: { en: text.answer, de: `${text.answer} (de)` },
    title: { en: text.title, de: `${text.title} (de)` },
  };
}

const DOCS: SearchDoc[] = [
  doc("f00001", "a0001", "music-stage", true, {
    question: "Who wrote the poem „Die Kinderhymne“?",
    answer: "Bertolt Brecht",
    title: "Two Germanys, Two Anthems",
    de: { de: "Wer schrieb das Gedicht „Die Kinderhymne“?" },
  }),
  doc("f00006", "a0002", "literature", true, {
    question: "Which city hosts the Brecht archive?",
    answer: "Berlin",
    title: "Capitals of Europe",
  }),
  doc("f00062", "a0013", "music-stage", false, {
    question: "Which playwright ran the Berliner Ensemble?",
    answer: "Helene Weigel",
    title: "Brecht and the Ensemble",
  }),
  doc("f00061", "a0013", "music-stage", true, {
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
    expect(hits.map((h) => h.factId)).toEqual(["f00001"]);
    expect(runSearch(INDEX, { q: "brecht mars", lang: "en", limit: 10 })).toEqual([]);
  });

  it("scores answer hits over title hits over question hits, word starts +1", () => {
    const hits = runSearch(INDEX, { q: "brecht", lang: "en", limit: 10 });
    expect(hits.map((h) => [h.factId, h.score])).toEqual([
      ["f00001", 5], // answer "Bertolt Brecht", word start
      ["f00061", 4], // answer "Bertolt-Brecht-Platz", mid-word
      ["f00062", 4], // title "Brecht and the Ensemble", word start
      ["f00006", 2], // question only
    ]);
  });

  it("breaks ties with printed facts first, then id", () => {
    const hits = runSearch(INDEX, { q: "ensemble", lang: "en", limit: 10 });
    // Both hit the question at word start (2); the title hit of q1 wins (4).
    expect(hits.map((h) => h.factId)).toEqual(["f00062", "f00061"]);
    const berlin = runSearch(INDEX, { q: "berliner", lang: "en", limit: 10 });
    expect(berlin.map((h) => [h.factId, h.score])).toEqual([
      ["f00061", 2],
      ["f00062", 2],
    ]);
  });

  it("searches Russian, falling back to English where a fact has none", () => {
    const ru = buildSearchIndex([
      { ...DOCS[0], answer: { ...DOCS[0].answer, ru: "Бертольт Брехт" } },
      DOCS[1],
    ]);
    expect(runSearch(ru, { q: "брехт", lang: "ru", limit: 10 })[0]?.answer).toBe("Бертольт Брехт");
    expect(runSearch(ru, { q: "berlin", lang: "ru", limit: 10 })[0]?.answer).toBe("Berlin");
  });

  it("matches folded text in either language and returns that language", () => {
    const de = runSearch(INDEX, { q: "gedicht kinderhymne", lang: "de", limit: 10 });
    expect(de).toHaveLength(1);
    expect(de[0].question).toBe("Wer schrieb das Gedicht „Die Kinderhymne“?");
    expect(de[0].answer).toBe("Bertolt Brecht (de)");
    expect(runSearch(INDEX, { q: "gedicht", lang: "en", limit: 10 })).toEqual([]);
    expect(runSearch(INDEX, { q: "strasse", lang: "en", limit: 10 })[0]?.factId).toBe("f00061");
  });

  it("filters by domain and honours the limit", () => {
    const cat1 = runSearch(INDEX, { q: "brecht", lang: "en", limit: 10, domain: "music-stage" });
    expect(cat1.every((h) => h.domain === "music-stage")).toBe(true);
    expect(cat1).toHaveLength(3);
    expect(runSearch(INDEX, { q: "brecht", lang: "en", limit: 2 })).toHaveLength(2);
    expect(runSearch(INDEX, { q: "brecht", lang: "en", limit: 0 })).toEqual([]);
  });

  it("carries the article and domain of the hit", () => {
    const [hit] = runSearch(INDEX, { q: "kinderhymne", lang: "en", limit: 1 });
    expect(hit).toMatchObject({
      factId: "f00001",
      articleId: "a0001",
      domain: "music-stage",
      title: "Two Germanys, Two Anthems",
    });
  });
});
