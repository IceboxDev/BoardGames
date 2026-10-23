import { describe, expect, it } from "vitest";
import { DOMAIN_SLUGS } from "../../quiz/taxonomy.ts";
import {
  QuizDeskBacklogQuerySchema,
  QuizDeskBacklogResponseSchema,
  QuizDeskLinkReportBodySchema,
  QuizDeskProvenanceSchema,
  QuizDeskResolveReportsBodySchema,
  QuizDeskRetiredQuerySchema,
  QuizDeskRetiredResponseSchema,
  QuizDeskSummarySchema,
} from "./quiz-desk.ts";

const grades = { A: 1, B: 0, C: 2, D: 0, E: 5 };
const codes = (n: number) =>
  Object.fromEntries(
    [
      "duplicate",
      "off-topic",
      "giveaway",
      "non-trivia",
      "outdated",
      "wrong",
      "superseded-by-print",
      "quota-trim",
      "distasteful",
      "merged",
      "split",
      "other",
      "none",
    ].map((c) => [c, n]),
  );
const perDomain = <T>(v: T) => Object.fromEntries(DOMAIN_SLUGS.map((d) => [d, v]));

const backlogItem = {
  id: "b00001",
  kind: "photo-check",
  target: "quiztopia/c001",
  priority: 2,
  status: "open",
  created: "2026-10-23",
  by: "coordinator",
  notes: "Check the slot 3 answer against the photo.",
  links: [],
};

describe("QuizDeskSummarySchema", () => {
  const summary = {
    contentVersion: "546480374671",
    shape: perDomain({ articles: 2, facts: 7, byFactCount: [0, 0, 0, 1, 1, 0, 0, 0, 0] }),
    grades: perDomain(grades),
    gradeTotals: grades,
    evidenceArticles: 3,
    backlog: {
      total: 1,
      byStatus: { open: 1, doing: 0, done: 0, wontfix: 0 },
      byKind: {
        verify: 0,
        research: 0,
        "photo-check": 1,
        stale: 0,
        report: 0,
        rework: 0,
        idea: 0,
        candidate: 0,
      },
    },
    retired: { facts: codes(1), wordings: codes(0), articles: codes(0) },
  };

  it("parses a full summary", () => {
    expect(QuizDeskSummarySchema.parse(summary)).toEqual(summary);
  });

  it("requires every domain in the per-domain records", () => {
    const { [DOMAIN_SLUGS[0]]: _gone, ...rest } = summary.grades;
    const r = QuizDeskSummarySchema.safeParse({ ...summary, grades: rest });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path[0]).toBe("grades");
  });

  it("refuses an unknown grade and a negative count", () => {
    const bad = QuizDeskSummarySchema.safeParse({ ...summary, gradeTotals: { ...grades, F: 1 } });
    expect(bad.success).toBe(false);
    const neg = QuizDeskSummarySchema.safeParse({ ...summary, evidenceArticles: -1 });
    expect(neg.success).toBe(false);
    if (!neg.success) expect(neg.error.issues[0]?.path).toEqual(["evidenceArticles"]);
  });
});

describe("QuizDeskBacklogQuerySchema / response", () => {
  it("defaults the limit and coerces it from the query string", () => {
    expect(QuizDeskBacklogQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(QuizDeskBacklogQuerySchema.parse({ status: "open", limit: "10", cursor: "20" })).toEqual(
      { status: "open", limit: 10, cursor: "20" },
    );
  });

  it("refuses an unknown status, a huge limit and a bad cursor", () => {
    const status = QuizDeskBacklogQuerySchema.safeParse({ status: "closed" });
    expect(status.success).toBe(false);
    if (!status.success) expect(status.error.issues[0]?.path).toEqual(["status"]);
    expect(QuizDeskBacklogQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(QuizDeskBacklogQuerySchema.safeParse({ cursor: "abc" }).success).toBe(false);
  });

  it("parses a page with labels; refuses a done item without closedBy", () => {
    const page = {
      items: [backlogItem],
      targets: {
        "quiztopia/c001": {
          kind: "card",
          label: "Quiztopia c001",
          articleId: "a0001",
          domain: "music-stage",
          retired: false,
        },
      },
      total: 1,
      nextCursor: null,
    };
    expect(QuizDeskBacklogResponseSchema.parse(page)).toEqual(page);
    const done = QuizDeskBacklogResponseSchema.safeParse({
      ...page,
      items: [{ ...backlogItem, status: "done" }],
    });
    expect(done.success).toBe(false);
    if (!done.success) expect(done.error.issues[0]?.path).toEqual(["items", 0, "closedBy"]);
  });
});

describe("QuizDeskRetiredQuerySchema / response", () => {
  const row = {
    kind: "fact",
    id: "f00001",
    articleId: "a0001",
    articleTitle: { en: "Kinderhymne", de: "Kinderhymne" },
    domain: "music-stage",
    question: { en: "Who wrote it?", de: "Wer schrieb es?" },
    answer: { en: "Brecht", de: "Brecht" },
    at: "2026-10-21",
    code: "duplicate",
    reason: "Duplicate of f00002.",
    replacedBy: ["f00002"],
    printed: { source: "quiztopia", card: "c001", category: 1 },
    inRetiredArticle: false,
  };

  it("accepts the code filter `none` and trims q", () => {
    expect(QuizDeskRetiredQuerySchema.parse({ kind: "wording", code: "none", q: " x " })).toEqual({
      kind: "wording",
      code: "none",
      q: "x",
      limit: 50,
    });
  });

  it("refuses an unknown kind, code or domain", () => {
    for (const bad of [{ kind: "card" }, { code: "boring" }, { domain: "nowhere" }]) {
      const r = QuizDeskRetiredQuerySchema.safeParse(bad);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.path).toEqual([Object.keys(bad)[0]]);
    }
  });

  it("parses rows, an article row with no question, and refuses a bad article id", () => {
    const article = {
      ...row,
      kind: "article",
      id: "a0001",
      question: null,
      answer: null,
      code: "merged",
      printed: undefined,
    };
    const page = { rows: [row, article], total: 2, nextCursor: "50" };
    expect(QuizDeskRetiredResponseSchema.parse(page).rows).toHaveLength(2);
    const r = QuizDeskRetiredResponseSchema.safeParse({
      ...page,
      rows: [{ ...row, articleId: "x1" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["rows", 0, "articleId"]);
  });
});

describe("QuizDeskProvenanceSchema", () => {
  const fact = {
    id: "f00001",
    question: { en: "Who wrote it?", de: "Wer schrieb es?" },
    answer: { en: "Brecht", de: "Brecht" },
    retired: null,
    cited: { url: "https://de.wikipedia.org/wiki/Kinderhymne", title: "Kinderhymne", lang: "de" },
    tags: ["topic:music"],
    derivedTags: ["printed:yes"],
    entities: [{ qid: "Q38757", label: "Bertolt Brecht", role: "answer" }],
    reviewBy: null,
    grade: {
      grade: "C",
      independentSources: 1,
      verbatim: 1,
      primary: 0,
      contested: false,
      latestConfidence: "high",
    },
    sources: [
      {
        id: "s1",
        url: "https://de.wikipedia.org/wiki/Kinderhymne",
        kind: "encyclopedia",
        lang: "de",
        retrievedAt: "2026-10-23",
      },
    ],
    assessments: [
      {
        id: "e1",
        at: "2026-10-23",
        target: "f00001",
        claim: "answer",
        verdict: "confirmed",
        confidence: "high",
        support: [{ source: "s1", quote: "von Bertolt Brecht", quoteLang: "de", verbatim: true }],
        by: "crawler",
      },
    ],
    assessmentCount: 1,
    printedOn: [
      {
        source: "quiztopia",
        card: "c001",
        category: 1,
        wordingId: "w00001",
        retiredWording: false,
        photoUrl:
          "https://media.githubusercontent.com/media/IceboxDev/BoardGames/master/packages/quiz-archive/photos/quiztopia/c001.jpg",
        manifest: null,
        transcript: null,
      },
    ],
  };
  const provenance = {
    contentVersion: "546480374671",
    article: {
      id: "a0001",
      domain: "music-stage",
      sub: "anthems",
      title: { en: "Kinderhymne", de: "Kinderhymne" },
      notes: { en: "", de: "" },
      tags: [],
      derivedTags: ["printed:yes"],
      tagLabels: { "printed:yes": { en: "Printed", de: "Gedruckt" } },
      entities: [],
      retired: null,
      hasEvidence: true,
    },
    facts: [fact],
    backlog: [backlogItem],
    targets: {},
    reports: [
      {
        id: 3,
        target: { kind: "question", id: "f00001" },
        issue: "wrong-answer",
        status: "fixed",
        createdAt: "2026-10-01T00:00:00.000Z",
        resolvedAt: "2026-10-02T00:00:00.000Z",
        backlogId: "b00001",
        historyRef: "a0001#2",
      },
    ],
    history: { total: 2, byKind: { printed: 1, corrected: 1 }, lastAt: "2026-10-20" },
    runs: [{ id: "tp-221", title: null }],
  };

  it("parses a provenance payload", () => {
    expect(QuizDeskProvenanceSchema.parse(provenance)).toEqual(provenance);
  });

  it("refuses a bad grade, a non-URL photo and an unknown history kind", () => {
    const grade = QuizDeskProvenanceSchema.safeParse({
      ...provenance,
      facts: [{ ...fact, grade: { ...fact.grade, grade: "F" } }],
    });
    expect(grade.success).toBe(false);
    if (!grade.success) expect(grade.error.issues[0]?.path).toEqual(["facts", 0, "grade", "grade"]);
    const photo = QuizDeskProvenanceSchema.safeParse({
      ...provenance,
      facts: [{ ...fact, printedOn: [{ ...fact.printedOn[0], photoUrl: "c001.jpg" }] }],
    });
    expect(photo.success).toBe(false);
    const kind = QuizDeskProvenanceSchema.safeParse({
      ...provenance,
      history: { ...provenance.history, byKind: { vandalised: 1 } },
    });
    expect(kind.success).toBe(false);
  });

  it("refuses a malformed history ref on a linked report", () => {
    const r = QuizDeskProvenanceSchema.safeParse({
      ...provenance,
      reports: [{ ...provenance.reports[0], historyRef: "a0001-2" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["reports", 0, "historyRef"]);
  });
});

describe("report links", () => {
  it("extends the resolve body with optional links", () => {
    expect(
      QuizDeskResolveReportsBodySchema.parse({
        ids: [1],
        status: "fixed",
        backlogId: "b00012",
        historyRef: "cards/quiztopia#3",
      }),
    ).toEqual({ ids: [1], status: "fixed", backlogId: "b00012", historyRef: "cards/quiztopia#3" });
    expect(QuizDeskResolveReportsBodySchema.parse({ ids: [1], status: "declined" })).toEqual({
      ids: [1],
      status: "declined",
    });
  });

  it("refuses malformed links", () => {
    const b = QuizDeskResolveReportsBodySchema.safeParse({
      ids: [1],
      status: "fixed",
      backlogId: "12",
    });
    expect(b.success).toBe(false);
    if (!b.success) expect(b.error.issues[0]?.path).toEqual(["backlogId"]);
    expect(QuizDeskLinkReportBodySchema.safeParse({ historyRef: "a0042#0" }).success).toBe(false);
  });

  it("link body sets or clears, but must name something", () => {
    expect(QuizDeskLinkReportBodySchema.parse({ backlogId: null })).toEqual({ backlogId: null });
    expect(QuizDeskLinkReportBodySchema.safeParse({}).success).toBe(false);
  });
});
