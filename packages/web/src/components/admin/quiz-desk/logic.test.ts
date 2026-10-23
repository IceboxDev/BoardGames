import type { QuizDeskRetiredRow } from "@boardgames/core/protocol/http/quiz-desk";
import type { BacklogItem } from "@boardgames/core/quiz/backlog-types";
import { describe, expect, it } from "vitest";
import { FIXTURE_SUMMARY } from "./fixtures";
import {
  ARTICLES_TARGET,
  FACTS_TARGET,
  filterBacklog,
  filterRetired,
  formatDelta,
  gradeSegments,
  gradeTooltip,
  hostOf,
  page,
  pickArticles,
  queryString,
  SHAPE_TARGET,
  shapeRows,
} from "./logic";

describe("shape", () => {
  it("targets 200 articles and 1050 facts per domain", () => {
    expect(ARTICLES_TARGET).toBe(200);
    expect(FACTS_TARGET).toBe(1050);
  });

  it("marks a domain on target ok and reports each size's deviation otherwise", () => {
    const rows = shapeRows({
      art: { articles: 200, facts: 1050, byFactCount: [...SHAPE_TARGET] },
      history: { articles: 200, facts: 1047, byFactCount: [0, 0, 0, 1, 31, 118, 30, 10, 10] },
    });
    const art = rows.find((r) => r.domain === "art");
    const history = rows.find((r) => r.domain === "history");
    expect(art?.ok).toBe(true);
    expect(art?.sizes.every((s) => s.delta === 0)).toBe(true);
    expect(history?.ok).toBe(false);
    expect(history?.small).toBe(1);
    expect(history?.factsDelta).toBe(-3);
    expect(history?.articlesDelta).toBe(0);
    expect(history?.sizes.find((s) => s.size === 5)).toEqual({
      size: 5,
      have: 118,
      want: 120,
      delta: -2,
    });
    expect(history?.sizes.find((s) => s.size === 4)?.delta).toBe(1);
  });

  it("flags exactly the fixture's off-shape domains", () => {
    const off = shapeRows(FIXTURE_SUMMARY.shape)
      .filter((r) => !r.ok)
      .map((r) => r.domain)
      .sort();
    expect(off).toEqual(["geography", "history", "science"]);
  });

  it("formats deltas with a real minus and nothing for zero", () => {
    expect(formatDelta(3)).toBe("+3");
    expect(formatDelta(-2)).toBe("−2");
    expect(formatDelta(0)).toBe("");
  });
});

describe("grades", () => {
  it("explains the grade, the counts behind it and the next step", () => {
    const tip = gradeTooltip({
      grade: "C",
      independentSources: 1,
      verbatim: 1,
      primary: 0,
      contested: false,
      latestConfidence: "medium",
    });
    expect(tip).toContain("Grade C: 1 source with the answer verbatim-verified on its page.");
    expect(tip).toContain("This fact: 1 independent source, 1 verbatim-verified, 0 primary");
    expect(tip).toContain("Latest assessment confidence: medium.");
    expect(tip).toContain("Next: a second independent verbatim-verified source");
  });

  it("names an unresolved contest and has no next step at A", () => {
    const contested = gradeTooltip({
      grade: "E",
      independentSources: 2,
      verbatim: 2,
      primary: 1,
      contested: true,
      latestConfidence: null,
    });
    expect(contested).toContain("contested or refuted (unresolved)");
    expect(contested).toContain("Next: resolve the contest");
    expect(contested).not.toContain("confidence");
    const a = gradeTooltip({
      grade: "A",
      independentSources: 3,
      verbatim: 3,
      primary: 1,
      contested: false,
      latestConfidence: "high",
    });
    expect(a).toContain("3 independent sources");
    expect(a).not.toContain("Next:");
  });

  it("splits a distribution into shares in grade order", () => {
    const segs = gradeSegments({ A: 1, B: 1, C: 2, D: 0, E: 0 });
    expect(segs.map((s) => s.grade)).toEqual(["A", "B", "C", "D", "E"]);
    expect(segs[2]?.share).toBe(0.5);
    expect(gradeSegments({ A: 0, B: 0, C: 0, D: 0, E: 0 })[0]?.share).toBe(0);
  });
});

const item = (over: Partial<BacklogItem>): BacklogItem => ({
  id: "b00001",
  kind: "verify",
  target: "f00001",
  priority: 2,
  status: "open",
  created: "2026-10-20",
  by: "owner",
  notes: "",
  links: [],
  ...over,
});

describe("backlog filter", () => {
  const items = [
    item({ id: "b00001", priority: 2, created: "2026-10-20" }),
    item({ id: "b00002", priority: 1, kind: "photo-check", target: "quiztopia/c001" }),
    item({ id: "b00003", priority: 2, created: "2026-10-22", target: "a0001:body" }),
    item({
      id: "b00004",
      status: "done",
      closedBy: "a0001#3",
      target: "a0002",
      priority: 4,
    }),
  ];

  it("orders by priority, then newest, then id", () => {
    expect(filterBacklog(items, {}).map((b) => b.id)).toEqual([
      "b00002",
      "b00003",
      "b00001",
      "b00004",
    ]);
  });

  it("filters by status and kind", () => {
    expect(filterBacklog(items, { status: "done" }).map((b) => b.id)).toEqual(["b00004"]);
    expect(filterBacklog(items, { kind: "photo-check" }).map((b) => b.id)).toEqual(["b00002"]);
  });

  it("matches an article id against everything inside it", () => {
    const inA0001 = (t: string, a: string) =>
      a === "a0001" && (t.startsWith("a0001") || t === "quiztopia/c001");
    expect(filterBacklog(items, { target: "a0001" }, inA0001).map((b) => b.id)).toEqual([
      "b00002",
      "b00003",
    ]);
    expect(filterBacklog(items, { target: "a0002" }).map((b) => b.id)).toEqual(["b00004"]);
  });
});

const row = (over: Partial<QuizDeskRetiredRow>): QuizDeskRetiredRow => ({
  kind: "fact",
  id: "f00001",
  articleId: "a0001",
  articleTitle: { en: "Anthems", de: "Hymnen" },
  domain: "music-stage",
  question: { en: "Who wrote it?", de: "Wer schrieb es?" },
  answer: { en: "Brecht", de: "Brecht" },
  at: "2026-10-20",
  code: "duplicate",
  reason: "Same as Q2.",
  inRetiredArticle: false,
  ...over,
});

describe("retired filter", () => {
  const rows = [
    row({ id: "f00001", at: "2026-10-20" }),
    row({ id: "f00002", at: "2026-10-22", code: undefined, reason: "Before codes." }),
    row({ id: "a0009", kind: "article", domain: "history", question: null, answer: null }),
  ];

  it("lists newest first", () => {
    expect(filterRetired(rows, {}).map((r) => r.id)).toEqual(["f00002", "a0009", "f00001"]);
  });

  it("filters kind, code (none = no code), domain and text", () => {
    expect(filterRetired(rows, { kind: "article" }).map((r) => r.id)).toEqual(["a0009"]);
    expect(filterRetired(rows, { code: "none" }).map((r) => r.id)).toEqual(["f00002"]);
    expect(filterRetired(rows, { domain: "history" }).map((r) => r.id)).toEqual(["a0009"]);
    expect(filterRetired(rows, { q: "BEFORE" }).map((r) => r.id)).toEqual(["f00002"]);
    expect(filterRetired(rows, { q: "wer schrieb" }).map((r) => r.id)).toEqual([
      "f00002",
      "f00001",
    ]);
  });
});

describe("helpers", () => {
  it("pages with an offset cursor", () => {
    expect(page([1, 2, 3], 2)).toEqual({ slice: [1, 2], nextCursor: "2" });
    expect(page([1, 2, 3], 2, "2")).toEqual({ slice: [3], nextCursor: null });
  });

  it("builds a query string from the set fields", () => {
    expect(queryString({ status: "open", kind: undefined, target: "", limit: 50 })).toBe(
      "?status=open&limit=50",
    );
    expect(queryString({})).toBe("");
  });

  it("picks articles by id or title, an exact id first", () => {
    const list = [
      { id: "a0010", domain: "art", titleEn: "a0001 lookalike", titleDe: "x" },
      { id: "a0001", domain: "art", titleEn: "Anthems", titleDe: "Hymnen" },
      { id: "a0002", domain: "art", titleEn: "Opera", titleDe: "Oper" },
    ];
    expect(pickArticles(list, "a0001").map((a) => a.id)).toEqual(["a0001", "a0010"]);
    expect(pickArticles(list, "hymn").map((a) => a.id)).toEqual(["a0001"]);
    expect(pickArticles(list, "  ")).toEqual([]);
  });

  it("shortens a URL to its host", () => {
    expect(hostOf("https://www.bbc.co.uk/news")).toBe("bbc.co.uk");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
