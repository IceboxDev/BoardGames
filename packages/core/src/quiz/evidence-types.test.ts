import { describe, expect, it } from "vitest";
import {
  type ArticleEvidence,
  ArticleEvidenceSchema,
  evidenceProblems,
  parseEvidenceRef,
} from "./evidence-types.ts";

const good: ArticleEvidence = {
  article: "a0001",
  sources: {
    s1: {
      url: "https://en.wikipedia.org/wiki/Rome",
      title: "Rome",
      kind: "encyclopedia",
      lang: "en",
      retrievedAt: "2026-10-23",
      snapshot: "a".repeat(64),
    },
    s2: {
      url: "https://www.wikiwand.com/en/Rome",
      kind: "encyclopedia",
      lang: "en",
      retrievedAt: "2026-10-23T10:00:00Z",
      cloneOf: "s1",
    },
  },
  assessments: [
    {
      id: "e1",
      at: "2026-10-23",
      target: "f00001",
      claim: "answer",
      verdict: "confirmed",
      confidence: "high",
      support: [{ source: "s1", quote: "Rome was founded", quoteLang: "en", verbatim: true }],
      by: "crawler",
      run: "evidence-crawl-1",
    },
    {
      id: "e2",
      at: "2026-10-24",
      target: "a0001:body",
      claim: "body-number",
      verdict: "unverified",
      confidence: "low",
      support: [],
      by: "owner",
    },
  ],
};

const article = { id: "a0001", facts: [{ id: "f00001" }], retired: [{ id: "f00009" }] };

describe("evidence ledger", () => {
  it("parses a good ledger", () => {
    expect(ArticleEvidenceSchema.parse(good)).toEqual(good);
    expect(evidenceProblems(article, good)).toEqual([]);
  });

  it("rejects bad shapes", () => {
    const bad = (patch: (e: ArticleEvidence) => void) => {
      const e = structuredClone(good);
      patch(e);
      return ArticleEvidenceSchema.safeParse(e).success;
    };
    expect(bad((e) => (e.sources.s1.kind = "blog" as "fan"))).toBe(false);
    expect(bad((e) => (e.assessments[0].target = "w00001"))).toBe(false);
    expect(bad((e) => (e.sources.s1.snapshot = "abc"))).toBe(false);
    expect(bad((e) => (e.assessments[0].verdict = "maybe" as "confirmed"))).toBe(false);
    expect(bad((e) => (e.assessments[0].id = "x1"))).toBe(false);
    expect(bad((e) => (e.sources.s2.cloneOf = "Not A Domain"))).toBe(false);
  });

  it("finds unknown targets and sources, duplicate ids and out-of-order entries", () => {
    const e = structuredClone(good);
    e.assessments.push(
      { ...e.assessments[0], id: "e1", at: "2026-10-22", target: "f00002" },
      { ...e.assessments[0], id: "e3", at: "2026-10-25", target: "a0002:body" },
      {
        ...e.assessments[0],
        id: "e4",
        at: "2026-10-25",
        target: "f00009",
        support: [{ source: "s7", quote: "q", quoteLang: "en", verbatim: false }],
      },
    );
    e.sources.s2.cloneOf = "s5";
    expect(evidenceProblems(article, e)).toEqual([
      "evidence/a0001/s2: clone of unknown source s5",
      "evidence/a0001: duplicate assessment e1",
      "evidence/a0001/e1: out of order (2026-10-22 after 2026-10-24)",
      "evidence/a0001/e1: unknown target f00002",
      "evidence/a0001/e3: unknown target a0002:body",
      "evidence/a0001/e4: unknown source s7",
    ]);
    expect(evidenceProblems({ ...article, id: "a0002" }, good)[0]).toBe(
      "evidence/a0002: file is for a0001",
    );
  });

  it("resolves history evidence refs", () => {
    expect(parseEvidenceRef("e12", "a0001")).toEqual({ article: "a0001", id: "e12" });
    expect(parseEvidenceRef("a0042/e3", "a0001")).toEqual({ article: "a0042", id: "e3" });
    expect(parseEvidenceRef("s1", "a0001")).toBeNull();
  });
});
