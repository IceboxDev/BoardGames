import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildIndex,
  buildMeta,
  buildTimeline,
  contentProblems,
  domainShape,
  indexEntities,
  indexTags,
} from "./build.ts";
import { type Article, ArticleSchema, ContentMetaSchema, type Fact } from "./content-types.ts";
import { TagRegistrySchema } from "./tags.ts";

const registry = TagRegistrySchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("./content/tags.json", import.meta.url)), "utf8")),
);

let next = 0;
function fact(over: Partial<Fact> = {}): Fact {
  next++;
  const n = String(next).padStart(5, "0");
  return {
    id: `f${n}`,
    answerEn: "Verdi",
    answerDe: "Verdi",
    spans: { en: [0, 5], de: [0, 5] },
    timeline: {
      kind: "creation",
      start: "1871",
      end: null,
      precision: "year",
      approx: false,
      ongoing: false,
      labelEn: "Aida",
      labelDe: "Aida",
    },
    source: { url: "https://en.wikipedia.org/wiki/Aida", title: "Aida", lang: "en" },
    wordings: [
      {
        id: `w${n}`,
        en: `Who wrote opera ${n}?`,
        de: `Wer schrieb Oper ${n}?`,
        origin: "generated",
      },
    ],
    ...over,
  };
}

function article(id: string, facts: Fact[], over: Partial<Article> = {}): Article {
  return {
    id,
    domain: "music-stage",
    sub: "classical",
    titleEn: "Verdi",
    titleDe: "Verdi",
    bodyEn: "Verdi wrote Aida.",
    bodyDe: "Verdi schrieb Aida.",
    notesEn: "",
    notesDe: "",
    images: [],
    facts,
    ...over,
  };
}

describe("retired articles", () => {
  const live = article("a0001", [fact(), fact()]);
  const retirement = {
    at: "2026-10-23",
    code: "duplicate" as const,
    reason: "dup",
    replacedBy: ["a0001"],
  };
  const gone = article("a0002", [fact()], { articleRetired: retirement });

  it("parse, and leave the index, the timeline and the active counts", () => {
    expect(ArticleSchema.parse(gone)).toEqual(gone);
    expect(buildIndex([live, gone]).articles.map((a) => a.id)).toEqual(["a0001"]);
    expect(Object.keys(buildTimeline([live, gone]))).toEqual(live.facts.map((f) => f.id));
    const meta = ContentMetaSchema.parse(buildMeta([live, gone], []));
    expect(meta.counts).toMatchObject({ articles: 1, facts: 2, wordings: 2, retiredArticles: 1 });
    expect(buildMeta([live], []).counts.retiredArticles).toBeUndefined();
    expect(contentProblems([live, gone], [])).toEqual([]);
  });

  it("must be replaced by an active article that exists, not by themselves", () => {
    const self = { ...gone, articleRetired: { ...retirement, replacedBy: ["a0002"] } };
    const unknown = { ...gone, articleRetired: { ...retirement, replacedBy: ["a0009"] } };
    const chained = article("a0003", [fact()], {
      articleRetired: { at: "2026-10-23", code: "merged", reason: "m", replacedBy: ["a0002"] },
    });
    expect(contentProblems([live, self], [])).toContain("a0002: retired, replaced by itself");
    expect(contentProblems([live, unknown], [])).toContain(
      "a0002: retired, replaced by unknown article a0009",
    );
    expect(contentProblems([live, gone, chained], [])).toContain(
      "a0003: retired, replaced by retired a0002",
    );
  });

  it("don't count as duplicates of the question that replaced them", () => {
    const twin = fact({ wordings: live.facts[0].wordings.map((w) => ({ ...w, id: "w09999" })) });
    const retiredTwin = article("a0004", [twin], { articleRetired: gone.articleRetired });
    expect(
      contentProblems([live, retiredTwin], []).filter((p) => p.includes("same question")),
    ).toEqual([]);
    const activeTwin = article("a0004", [twin]);
    expect(contentProblems([live, activeTwin], []).some((p) => p.includes("same question"))).toBe(
      true,
    );
  });
});

describe("index tags and entities", () => {
  it("unions stored and derived tags, and lists qids", () => {
    const a = article(
      "a0001",
      [
        fact({
          tags: ["risk:superlative"],
          entities: [{ qid: "Q7317", label: "Giuseppe Verdi", role: "answer" }],
        }),
      ],
      {
        tags: ["region:it", "topic:music/opera"],
        entities: [
          { qid: "Q7317", label: "Giuseppe Verdi", role: "subject" },
          { qid: "Q217", label: "x", role: "mentioned" },
        ],
      },
    );
    expect(indexTags(a)).toEqual([
      "era:m2/c19",
      "printed:no",
      "region:it",
      "risk:superlative",
      "topic:music/opera",
    ]);
    expect(indexEntities(a)).toEqual(["Q217", "Q7317"]);
    const [entry] = buildIndex([a]).articles;
    expect(entry.tags).toEqual(indexTags(a));
    expect(entry.entities).toEqual(["Q217", "Q7317"]);
    expect(buildIndex([article("a0002", [fact()])]).articles[0].entities).toBeUndefined();
  });
});

describe("contentProblems v2 checks", () => {
  it("validates tags against the registry only when given one", () => {
    const a = article("a0001", [fact({ tags: ["era:m2/c19"] })], { tags: ["region:zz"] });
    expect(contentProblems([a], [])).toEqual([]);
    expect(contentProblems([a], [], { tags: registry })).toEqual([
      "a0001: unknown tag value region:zz",
      `${a.facts[0].id}: era:m2/c19 is derived, never stored`,
    ]);
  });

  it("finds an entity linked twice in one role and bad qids", () => {
    const e = { qid: "Q1", label: "universe", role: "subject" as const };
    const a = article("a0001", [fact()], { entities: [e, e, { ...e, role: "mentioned" }] });
    expect(contentProblems([a], [])).toEqual(["a0001: entity Q1 linked twice as subject"]);
    expect(ArticleSchema.safeParse({ ...a, entities: [{ ...e, qid: "q1" }] }).success).toBe(false);
  });

  it("finds retirements replaced by nothing and checks codes", () => {
    const f = fact();
    const retiredFact = {
      ...fact(),
      retired: {
        at: "2026-10-23",
        code: "duplicate" as const,
        reason: "dup",
        replacedBy: ["f99999"],
      },
    };
    const a = article("a0001", [f], { retired: [retiredFact] });
    expect(contentProblems([a], [])).toEqual([
      `${retiredFact.id}: replaced by unknown fact f99999`,
    ]);
    const bad = {
      ...a,
      retired: [{ ...retiredFact, retired: { ...retiredFact.retired, code: "boring" } }],
    };
    expect(ArticleSchema.safeParse(bad).success).toBe(false);
    expect(ArticleSchema.safeParse({ ...a, facts: [{ ...f, reviewBy: "2027-1-1" }] }).success).toBe(
      false,
    );
  });
});

describe("domainShape", () => {
  it("counts active articles per domain by their active facts", () => {
    const shape = domainShape([
      article("a0001", [fact(), fact()]),
      article("a0002", [fact()]),
      article("a0003", [fact()], { domain: "history", sub: "ancient" }),
      article("a0004", [fact()], {
        articleRetired: { at: "2026-10-23", code: "other", reason: "x" },
      }),
    ]);
    expect(shape["music-stage"]).toEqual({
      articles: 2,
      facts: 3,
      byFactCount: [0, 1, 1, 0, 0, 0, 0, 0, 0],
    });
    expect(shape.history?.articles ?? 0).toBe(1);
    expect(Object.keys(shape).length).toBe(14);
  });
});
