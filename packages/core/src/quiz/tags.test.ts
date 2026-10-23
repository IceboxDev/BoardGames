import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Article, Fact } from "./content-types.ts";
import {
  answerShape,
  derivedTags,
  eraTag,
  facetAccepts,
  mergeTags,
  parseTag,
  questionForm,
  type TagRegistry,
  TagRegistrySchema,
  tagLabel,
  tagMatches,
  tagProblems,
  timeSensitiveText,
} from "./tags.ts";

const registry: TagRegistry = TagRegistrySchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("./content/tags.json", import.meta.url)), "utf8")),
);

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: "f00001",
  answerEn: "Rome",
  answerDe: "Rom",
  spans: { en: [0, 4], de: [0, 3] },
  timeline: {
    kind: "founding",
    start: "-753",
    end: null,
    precision: "year",
    approx: true,
    ongoing: false,
    labelEn: "Rome founded",
    labelDe: "Rom gegründet",
  },
  source: { url: "https://en.wikipedia.org/wiki/Rome", title: "Rome", lang: "en" },
  wordings: [{ id: "w00001", en: "Which city?", de: "Welche Stadt?", origin: "generated" }],
  ...over,
});

const article = (facts: Fact[], over: Partial<Article> = {}): Article => ({
  id: "a0001",
  domain: "history",
  sub: "ancient",
  titleEn: "T",
  titleDe: "T",
  bodyEn: "Rome …",
  bodyDe: "Rom …",
  notesEn: "",
  notesDe: "",
  images: [],
  facts,
  ...over,
});

describe("registry", () => {
  it("parses the seeded tags.json with the planned facets", () => {
    expect(registry.facets.map((f) => f.id)).toEqual([
      "topic",
      "region",
      "era",
      "form",
      "answer",
      "audience",
      "risk",
      "difficulty",
      "source",
      "printed",
    ]);
  });

  it("rejects duplicate facets, duplicate values and paths in flat facets", () => {
    const labels = { en: "x", de: "x", ru: "x" };
    const v = { id: "a", en: "a", de: "a", ru: "a" };
    expect(
      TagRegistrySchema.safeParse({
        version: 1,
        facets: [
          { id: "x", labels, values: [v] },
          { id: "x", labels, values: [v] },
        ],
      }).success,
    ).toBe(false);
    expect(
      TagRegistrySchema.safeParse({ version: 1, facets: [{ id: "x", labels, values: [v, v] }] })
        .success,
    ).toBe(false);
    expect(
      TagRegistrySchema.safeParse({
        version: 1,
        facets: [{ id: "x", labels, values: [{ ...v, id: "a/b" }] }],
      }).success,
    ).toBe(false);
    expect(TagRegistrySchema.safeParse({ version: 1, facets: [{ id: "x", labels }] }).success).toBe(
      false,
    );
  });
});

describe("parseTag / facetAccepts / tagMatches", () => {
  it("parses facet:value and paths", () => {
    expect(parseTag("topic:music/opera")).toEqual({
      facet: "topic",
      value: "music/opera",
      path: ["music", "opera"],
    });
    expect(parseTag("Topic:x")).toBeNull();
    expect(parseTag("printed")).toBeNull();
    expect(parseTag("topic:music//opera")).toBeNull();
  });

  it("accepts listed, ISO and open values only", () => {
    const region = registry.facets.find((f) => f.id === "region");
    const topic = registry.facets.find((f) => f.id === "topic");
    const risk = registry.facets.find((f) => f.id === "risk");
    if (!region || !topic || !risk) throw new Error("facets missing");
    expect(facetAccepts(region, "de")).toBe(true);
    expect(facetAccepts(region, "europe")).toBe(true);
    expect(facetAccepts(region, "xx")).toBe(false);
    expect(facetAccepts(region, "de/by")).toBe(false);
    expect(facetAccepts(topic, "music/opera/verdi")).toBe(true);
    expect(facetAccepts(risk, "superlative")).toBe(true);
    expect(facetAccepts(risk, "spicy")).toBe(false);
  });

  it("matches facets, exact tags and hierarchical ancestors", () => {
    expect(tagMatches("era:m2/c19", "era:m2")).toBe(true);
    expect(tagMatches("era:m2/c19", "era:m2/c19")).toBe(true);
    expect(tagMatches("era:m2/c19", "era")).toBe(true);
    expect(tagMatches("era:m2/c19", "era:")).toBe(true);
    expect(tagMatches("era:m20", "era:m2")).toBe(false);
    expect(tagMatches("topic:music", "topic:music/opera")).toBe(false);
  });

  it("labels listed values and countries", () => {
    expect(tagLabel(registry, "risk:superlative", "de")).toBe("Superlativ");
    expect(tagLabel(registry, "region:de", "en")).toBe("Germany");
    expect(tagLabel(registry, "topic:music/opera", "en")).toBe("music/opera");
  });
});

describe("tagProblems", () => {
  it("passes good tags and names every kind of bad one", () => {
    const good = article([fact({ tags: ["risk:superlative", "form:who"] })], {
      tags: ["region:it", "topic:history/rome", "audience:international"],
    });
    expect(tagProblems(good, registry)).toEqual([]);
    const bad = article(
      [fact({ tags: ["era:m1-bc/c8-bc", "form:who", "form:what", "risk:spicy", "mood:happy"] })],
      { tags: ["region:xx"] },
    );
    expect(tagProblems(bad, registry)).toEqual([
      "a0001: unknown tag value region:xx",
      "f00001: era:m1-bc/c8-bc is derived, never stored",
      "f00001: more than one form: tag",
      "f00001: unknown tag value risk:spicy",
      'f00001: unknown tag facet "mood" (mood:happy)',
    ]);
  });
});

describe("derived tags", () => {
  it("eras by the popular count, BC and deep time", () => {
    expect(eraTag("1889")).toBe("era:m2/c19");
    expect(eraTag("1900")).toBe("era:m2/c20");
    expect(eraTag("2000")).toBe("era:m3/c21");
    expect(eraTag("1999-12-31")).toBe("era:m2/c20");
    expect(eraTag("1")).toBe("era:m1/c1");
    expect(eraTag("-753")).toBe("era:m1-bc/c8-bc");
    expect(eraTag("-1")).toBe("era:m1-bc/c1-bc");
    expect(eraTag("-2500")).toBe("era:m3-bc/c25-bc");
    expect(eraTag("-66000000")).toBe("era:deep-time");
  });

  it("flags time-sensitive phrasings, not electric current", () => {
    expect(timeSensitiveText("Who is the current Pope?")).toBe(true);
    expect(timeSensitiveText("Which is currently the tallest building?")).toBe(true);
    expect(timeSensitiveText("Wer ist derzeit Bundeskanzler?")).toBe(true);
    expect(timeSensitiveText("Welcher Rekord besteht bis heute?")).toBe(true);
    expect(timeSensitiveText("the record as of 2024")).toBe(true);
    expect(timeSensitiveText("What unit measures electric current?")).toBe(false);
    expect(timeSensitiveText("the relation of voltage, current and resistance")).toBe(false);
  });

  it("reads the question's form in English and German", () => {
    expect(questionForm("Who painted the Mona Lisa?", "en")).toBe("who");
    expect(questionForm("In which year did the Wall fall?", "en")).toBe("when");
    expect(questionForm("When did the Wall fall?", "en")).toBe("when");
    expect(questionForm("Where is Timbuktu?", "en")).toBe("where");
    expect(questionForm("In which country is Timbuktu?", "en")).toBe("where");
    expect(questionForm("How many strings does a violin have?", "en")).toBe("how-many");
    expect(questionForm("What is a sonnet?", "en")).toBe("definition");
    expect(questionForm("What is a long skateboard called?", "en")).toBe("what");
    expect(questionForm("Which planet is not a gas giant?", "en")).toBe("which-not");
    expect(questionForm("Which god, sacred to many, was never painted?", "en")).toBe("what");
    expect(questionForm("What is the capital of Peru?", "en")).toBe("what");
    expect(questionForm("Why was it postponed?", "en")).toBeNull();
    expect(questionForm("Wer malte die Mona Lisa?", "de")).toBe("who");
    expect(questionForm("Wie viele Saiten hat eine Geige?", "de")).toBe("how-many");
    expect(questionForm("Wann fiel die Mauer?", "de")).toBe("when");
    expect(questionForm("In welchem Jahr fiel die Mauer?", "de")).toBe("when");
    expect(questionForm("Wo liegt Timbuktu?", "de")).toBe("where");
    expect(questionForm("Welcher Planet ist kein Gasriese?", "de")).toBe("which-not");
    expect(questionForm("Was bedeutet „Atom“?", "de")).toBe("definition");
    expect(questionForm("Wie heißt die Hauptstadt von Peru?", "de")).toBe("what");
  });

  it("reads dates and numbers off the answer", () => {
    expect(answerShape("14 July 1789")).toBe("date");
    expect(answerShape("1492", null, "In which year did Columbus sail?")).toBe("date");
    expect(answerShape("1492", "1492-10-12")).toBe("date");
    expect(answerShape("753 BC", "-753")).toBe("date");
    expect(answerShape("1492")).toBe("number");
    expect(answerShape("34 bolts")).toBe("number");
    expect(answerShape("13.8 billion years")).toBe("number");
    expect(answerShape("8,848 m")).toBe("number");
    expect(answerShape("99 Luftballons")).toBeNull();
    expect(answerShape("Rome")).toBeNull();
  });

  it("derives per fact and per article", () => {
    const printed = fact({
      id: "f00002",
      answerEn: "1789",
      wordings: [
        {
          id: "w00002",
          en: "In which year did the Bastille fall?",
          de: "In welchem Jahr fiel die Bastille?",
          origin: "printed",
          printed: { source: "quiztopia", card: "c001", category: 6 },
        },
      ],
      timeline: { ...fact().timeline, start: "1789-07-14", precision: "day" },
    });
    const a = article([fact({ reviewBy: "2030-01-01" }), printed]);
    expect(derivedTags(a, a.facts[0])).toEqual([
      "era:m1-bc/c8-bc",
      "form:where",
      "printed:no",
      "risk:time-sensitive",
    ]);
    expect(derivedTags(a, printed)).toEqual([
      "answer:date",
      "era:m2/c18",
      "form:when",
      "printed:yes",
      "source:quiztopia",
    ]);
    expect(derivedTags(a)).toEqual([
      "era:m1-bc/c8-bc",
      "era:m2/c18",
      "printed:yes",
      "risk:time-sensitive",
      "source:quiztopia",
    ]);
  });

  it("merges stored over derived for single facets", () => {
    expect(mergeTags(["form:who"], ["form:what", "era:m2/c19"], registry)).toEqual([
      "era:m2/c19",
      "form:who",
    ]);
    expect(mergeTags(["risk:number"], ["risk:time-sensitive"], registry)).toEqual([
      "risk:number",
      "risk:time-sensitive",
    ]);
    expect(mergeTags(["form:who"], ["form:what"])).toEqual(["form:what", "form:who"]);
  });
});
