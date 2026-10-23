import { describe, expect, it } from "vitest";
import type { Article } from "../../packages/core/src/quiz/content-types.ts";
import { ArticleEvidenceSchema, evidenceProblems } from "../../packages/core/src/quiz/evidence-types.ts";
import { factGrade } from "../../packages/core/src/quiz/grade.ts";
import {
  BACKFILL_BY,
  backfillArticle,
  type HandcheckVerdict,
  type HistoryEntryLike,
  inferKind,
  normalizeUrl,
} from "./backfill.ts";

const body = "Die Kinderhymne schrieb Bertolt Brecht im Jahr 1950.";
// Only the fields the backfill reads (a full article needs bodies, spans, timelines …).
const article = {
  id: "a0001",
  titleEn: "Children's Hymn",
  titleDe: "Kinderhymne",
  bodyEn: "The Children's Hymn was written by Bertolt Brecht in 1950.",
  bodyDe: body,
  notesEn: "",
  notesDe: "",
  facts: [
    {
      id: "f00001",
      answerEn: "Bertolt Brecht",
      answerDe: "Bertolt Brecht",
      spans: { en: [35, 14], de: [24, 14] },
      source: { url: "https://de.wikipedia.org/wiki/Kinderhymne#Text", title: "Kinderhymne", lang: "de" },
      wordings: [
        {
          id: "w00001",
          en: "Who wrote the Children's Hymn?",
          de: "Wer schrieb die Kinderhymne?",
          origin: "printed",
          printed: { source: "quiztopia", card: "c001", category: 1 },
        },
      ],
    },
  ],
} as unknown as Article;

const history: HistoryEntryLike[] = [
  {
    seq: 1,
    at: "2026-09-17",
    target: { type: "wording", id: "w00001" },
    sources: [{ url: "http://en.wikipedia.org/wiki/Bertolt_Brecht?utm_source=x" }],
  },
  {
    seq: 2,
    at: "2026-10-20",
    target: { type: "article", id: "a0001" },
    sources: [{ url: "https://en.wikipedia.org/wiki/Ben-Hur_(1959_film" }],
  },
];
const transcripts = new Map([
  ["quiztopia/c001/1", { url: "https://de.wikipedia.org/wiki/Kinderhymne", lang: "de" }],
]);

describe("normalizeUrl / inferKind", () => {
  it("strips fragments and tracking params, upgrades http, closes a cut-off title", () => {
    expect(normalizeUrl("http://EN.wikipedia.org/wiki/X?utm_source=a&id=2#top")).toBe(
      "https://en.wikipedia.org/wiki/X?id=2",
    );
    expect(normalizeUrl("https://en.wikipedia.org/wiki/Ben-Hur_(1959_film")).toBe(
      "https://en.wikipedia.org/wiki/Ben-Hur_(1959_film)",
    );
    expect(normalizeUrl("not a url")).toBeNull();
  });
  it("classifies kinds", () => {
    expect(inferKind("https://de.wikipedia.org/wiki/X")).toBe("encyclopedia");
    expect(inferKind("https://www.britannica.com/x")).toBe("reference");
    expect(inferKind("https://www.who.int/x")).toBe("official");
    expect(inferKind("https://www.bmluk.gv.at/x")).toBe("official");
    expect(inferKind("https://doi.org/10.1/x")).toBe("scholarly");
    expect(inferKind("https://news.mit.edu/x")).toBe("scholarly");
    expect(inferKind("https://www.bbc.co.uk/news/x")).toBe("press");
    expect(inferKind("https://example.com/x")).toBe("other");
  });
});

describe("backfillArticle", () => {
  it("seeds deduplicated sources and one unverified assessment per fact × source", () => {
    const r = backfillArticle(article, null, { history, transcripts, handcheck: [] });
    const ev = ArticleEvidenceSchema.parse(r.evidence);
    expect(evidenceProblems(article, ev)).toEqual([]);
    expect(Object.values(ev.sources).map((s) => s.url)).toEqual([
      "https://de.wikipedia.org/wiki/Kinderhymne",
      "https://en.wikipedia.org/wiki/Bertolt_Brecht",
      "https://en.wikipedia.org/wiki/Ben-Hur_(1959_film)",
    ]);
    expect(ev.assessments).toHaveLength(2);
    expect(ev.assessments[0]).toMatchObject({
      id: "e1",
      target: "f00001",
      verdict: "unverified",
      confidence: "low",
      by: BACKFILL_BY,
      note: "backfill: cited by fact source; transcript c001",
      support: [{ source: "s1", quote: "Bertolt Brecht", quoteLang: "de", verbatim: false }],
    });
    expect(ev.assessments[1].note).toBe("backfill: cited by history entry seq 1");
    expect(factGrade("f00001", ev).grade).toBe("D");
  });

  it("is idempotent", () => {
    const first = backfillArticle(article, null, { history, transcripts, handcheck: [] });
    const again = backfillArticle(article, first.evidence, { history, transcripts, handcheck: [] });
    expect(again.changed).toBe(false);
    expect(again.evidence).toEqual(first.evidence);
  });

  it("turns hand-check verdicts into assessments; a resolved card contest confirms", () => {
    const v = (over: Partial<HandcheckVerdict>): HandcheckVerdict => ({
      ref: "qt-001/1",
      article: "a0001",
      fact: "f00001",
      verdict: "confirmed",
      confidence: "high",
      why: "Brecht wrote it in 1950.",
      sources: ["https://de.wikipedia.org/wiki/Kinderhymne", "https://www.bpb.de/x"],
      changes: "",
      unit: "u01",
      ...over,
    });
    const r = backfillArticle(article, null, {
      history: [],
      transcripts: new Map(),
      handcheck: [v({})],
    });
    const ev = ArticleEvidenceSchema.parse(r.evidence);
    expect(evidenceProblems(article, ev)).toEqual([]);
    // The fact source is covered by the hand check, so it gets no seed.
    expect(ev.assessments).toHaveLength(1);
    expect(ev.assessments[0]).toMatchObject({ verdict: "confirmed", by: "handcheck-research" });
    expect(ev.sources.s2.kind).toBe("official");

    const contested = backfillArticle(article, null, {
      history: [],
      transcripts: new Map(),
      handcheck: [v({ verdict: "contested" })],
    });
    expect(factGrade("f00001", contested.evidence).contested).toBe(true);
    const resolved = backfillArticle(article, null, {
      history: [],
      transcripts: new Map(),
      handcheck: [v({ verdict: "contested", changes: "narrowed the wording" })],
    });
    expect(resolved.evidence.assessments[0]).toMatchObject({ verdict: "confirmed", confidence: "medium" });
  });

  it("appends after a later crawler assessment without breaking the order", () => {
    const first = backfillArticle(article, null, { history: [], transcripts: new Map(), handcheck: [] });
    const crawled = {
      ...first.evidence,
      assessments: [
        ...first.evidence.assessments,
        { ...first.evidence.assessments[0], id: "e2", at: "2026-10-24T10:00:00Z", by: "crawler" },
      ],
    };
    const r = backfillArticle(article, crawled, { history, transcripts, handcheck: [] });
    expect(r.evidence.assessments.slice(0, 2)).toEqual(crawled.assessments);
    expect(r.evidence.assessments[2]).toMatchObject({ id: "e3", at: "2026-10-24T10:00:00Z" });
    expect(evidenceProblems(article, ArticleEvidenceSchema.parse(r.evidence))).toEqual([]);
  });
});
