import { describe, expect, it } from "vitest";
import {
  ArticleHistoryParamSchema,
  ArticleHistoryResponseSchema,
  BulkReviewsBodySchema,
  JournalQuerySchema,
  JournalResponseSchema,
  QuizSettingsSchema,
  ReviewBodySchema,
  SearchQuerySchema,
  TimelinePinsResponseSchema,
  TrainerQueueQuerySchema,
  TrainerResetBodySchema,
  TrainerResetResponseSchema,
  TrainerStatesQuerySchema,
  withNewSources,
} from "./trainer-quiz.ts";

describe("quiz trainer protocol", () => {
  it("parses a review body with defaults", () => {
    const parsed = ReviewBodySchema.parse({
      clientId: "0123456789ab",
      questionId: "f00001",
      grade: "good",
      localDate: "2026-09-19",
    });
    expect(parsed.source).toBe("trainer");
    expect(parsed.durationMs).toBeUndefined();
  });

  it("rejects a bad grade, a malformed question id and a bad date", () => {
    const base = {
      clientId: "0123456789ab",
      questionId: "f00001",
      grade: "good",
      localDate: "2026-09-19",
    };
    expect(ReviewBodySchema.safeParse({ ...base, grade: "hard" }).success).toBe(false);
    const badId = ReviewBodySchema.safeParse({ ...base, questionId: "q00001" });
    expect(badId.success).toBe(false);
    if (!badId.success) expect(badId.error.issues[0]?.path).toEqual(["questionId"]);
    expect(ReviewBodySchema.safeParse({ ...base, localDate: "19.09.2026" }).success).toBe(false);
  });

  it("refuses table-game reviews from clients (the server records those itself)", () => {
    const base = {
      clientId: "game:ABCD:3",
      questionId: "f00001",
      grade: "again",
      localDate: "2026-09-19",
    };
    const game = ReviewBodySchema.safeParse({ ...base, source: "game", roomCode: "ABCD" });
    expect(game.success).toBe(false);
    if (!game.success) expect(game.error.issues[0]?.path).toEqual(["source"]);
    expect(ReviewBodySchema.parse({ ...base, source: "trainer" }).source).toBe("trainer");
  });

  it("caps bulk reviews at 200", () => {
    const one = {
      clientId: "0123456789ab",
      questionId: "f00001",
      grade: "again",
      localDate: "2026-09-19",
    };
    expect(BulkReviewsBodySchema.safeParse({ reviews: Array(200).fill(one) }).success).toBe(true);
    expect(BulkReviewsBodySchema.safeParse({ reviews: Array(201).fill(one) }).success).toBe(false);
  });

  it("coerces query params", () => {
    const q = TrainerQueueQuerySchema.parse({
      today: "2026-09-19",
      domain: "history",
      limit: "25",
      includeLeeches: "true",
    });
    expect(q).toEqual({ today: "2026-09-19", domain: "history", limit: 25, includeLeeches: true });
    expect(TrainerQueueQuerySchema.safeParse({ today: "2026-09-19", domain: "x" }).success).toBe(
      false,
    );
    expect(
      TrainerQueueQuerySchema.parse({ today: "2026-09-19", includeLeeches: "false" })
        .includeLeeches,
    ).toBe(false);
    expect(TrainerQueueQuerySchema.safeParse({ today: "2026-09-19", limit: "abc" }).success).toBe(
      false,
    );
    expect(SearchQuerySchema.parse({ q: " Brecht " })).toEqual({
      q: "Brecht",
      lang: "en",
      limit: 20,
    });
    expect(SearchQuerySchema.safeParse({ q: "B" }).success).toBe(false);
  });

  it("splits a comma-separated id list", () => {
    expect(TrainerStatesQuerySchema.parse({ ids: "f00001,f00120" }).ids).toEqual([
      "f00001",
      "f00120",
    ]);
    expect(TrainerStatesQuerySchema.safeParse({ ids: "f00001,nope" }).success).toBe(false);
  });

  it("fills settings defaults", () => {
    expect(QuizSettingsSchema.parse({ language: "de" })).toEqual({
      language: { primary: "de", secondary: null },
      newFactsPerDay: 15,
      includeLeeches: false,
      gameReviewsAffectSrs: false,
      sources: ["quiztopia", "trivial-pursuit", "publish-or-perish", "publish-or-perish-mge"],
      sourcesKnown: ["quiztopia", "trivial-pursuit", "publish-or-perish", "publish-or-perish-mge"],
      excludeFromAll: [],
    });
    expect(() => QuizSettingsSchema.parse({ language: "de", newFactsPerDay: 61 })).toThrow();
    expect(() => QuizSettingsSchema.parse({ language: "de", excludeFromAll: ["x"] })).toThrow();
    expect(() => QuizSettingsSchema.parse({ language: "de", sources: [] })).toThrow();
  });

  it("reads the old EN/DE/Both languages and refuses the same language twice", () => {
    expect(QuizSettingsSchema.parse({ language: "both" }).language).toEqual({
      primary: "en",
      secondary: "de",
    });
    expect(
      QuizSettingsSchema.parse({ language: { primary: "ru", secondary: "de" } }).language,
    ).toEqual({ primary: "ru", secondary: "de" });
    expect(() =>
      QuizSettingsSchema.parse({ language: { primary: "ru", secondary: "ru" } }),
    ).toThrow();
  });

  it("parses timeline pins and rejects a bad id, state or missing flag", () => {
    const pin = {
      questionId: "f00004",
      state: "review",
      known: true,
      lastReviewedAt: "2026-09-20T10:00:00.000Z",
    };
    const summary = { dated: 1, spanYears: 0 };
    expect(TimelinePinsResponseSchema.parse({ pins: [pin], summary }).pins[0]).toEqual(pin);
    expect(TimelinePinsResponseSchema.parse({ pins: [], summary }).pins).toEqual([]);
    const badId = TimelinePinsResponseSchema.safeParse({
      pins: [{ ...pin, questionId: "c1" }],
      summary,
    });
    expect(badId.success).toBe(false);
    if (!badId.success) expect(badId.error.issues[0]?.path).toEqual(["pins", 0, "questionId"]);
    const badState = TimelinePinsResponseSchema.safeParse({
      pins: [{ ...pin, state: "known" }],
      summary,
    });
    expect(badState.success).toBe(false);
    if (!badState.success) expect(badState.error.issues[0]?.path).toEqual(["pins", 0, "state"]);
    const { known: _known, ...noKnown } = pin;
    const missing = TimelinePinsResponseSchema.safeParse({ pins: [noKnown], summary });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0]?.path).toEqual(["pins", 0, "known"]);
  });
});

describe("trainer reset", () => {
  it("requires an explicit confirm and reports what was deleted", () => {
    expect(TrainerResetBodySchema.parse({ confirm: true })).toEqual({ confirm: true });
    expect(() => TrainerResetBodySchema.parse({})).toThrow();
    expect(() => TrainerResetBodySchema.parse({ confirm: "yes" })).toThrow();
    const ok = { ok: true, deleted: { states: 3, reviews: 5, reads: 1 } };
    expect(TrainerResetResponseSchema.parse(ok)).toEqual(ok);
    expect(() =>
      TrainerResetResponseSchema.parse({ ok: true, deleted: { states: -1, reviews: 0, reads: 0 } }),
    ).toThrow();
  });

  it("parses a journal query with defaults and rejects bad bounds", () => {
    expect(JournalQuerySchema.parse({})).toEqual({ days: 7, tz: "UTC" });
    expect(
      JournalQuerySchema.parse({ before: "2026-10-07", days: "3", tz: "Europe/Vilnius" }),
    ).toEqual({ before: "2026-10-07", days: 3, tz: "Europe/Vilnius" });
    expect(JournalQuerySchema.safeParse({ days: "0" }).success).toBe(false);
    expect(JournalQuerySchema.safeParse({ days: "31" }).success).toBe(false);
    const badDate = JournalQuerySchema.safeParse({ before: "07.10.2026" });
    expect(badDate.success).toBe(false);
    if (!badDate.success) expect(badDate.error.issues[0]?.path).toEqual(["before"]);
  });

  it("parses a journal page and rejects a malformed question", () => {
    const question = {
      questionId: "f00001",
      printed: true,
      en: "Q",
      de: "F",
      answerEn: "A",
      answerDe: "A",
      grades: ["again", "good"],
      firstSeen: true,
      fromGame: false,
    };
    const page = {
      days: [
        {
          date: "2026-10-06",
          reviewed: 2,
          knew: 1,
          newQuestions: 1,
          articlesRead: 1,
          articles: [
            {
              articleId: "a0001",
              domain: "literature",
              titleEn: "Brecht",
              titleDe: "Brecht",
              readAt: "2026-10-06T18:00:00.000Z",
              questions: [question],
            },
          ],
        },
      ],
      nextBefore: "2026-10-06",
    };
    expect(JournalResponseSchema.parse(page).days[0]?.articles[0]?.questions[0]?.grades).toEqual([
      "again",
      "good",
    ]);
    const bad = JournalResponseSchema.safeParse({
      ...page,
      days: [
        {
          ...page.days[0],
          articles: [
            { ...page.days[0]?.articles[0], questions: [{ ...question, questionId: "c1" }] },
          ],
        },
      ],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.path).toEqual([
        "days",
        0,
        "articles",
        0,
        "questions",
        0,
        "questionId",
      ]);
    }
    expect(
      JournalResponseSchema.safeParse({
        ...page,
        days: [
          {
            ...page.days[0],
            articles: [{ ...page.days[0]?.articles[0], questions: [{ ...question, grades: [] }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("article history", () => {
  const retired = {
    id: "f00007",
    answerEn: "Bonn",
    answerDe: "Bonn",
    questionEn: "Capital?",
    questionDe: "Hauptstadt?",
    wordingIds: ["w00007"],
    retired: { at: "2026-10-21", reason: "Duplicate of f00002.", replacedBy: ["f00002"] },
  };
  const entry = {
    seq: 1,
    at: "2026-10-20",
    kind: "reworded",
    target: { type: "wording", id: "w00002" },
    reason: "A yes/no card made open.",
    by: "owner",
    sources: [{ url: "https://en.wikipedia.org/wiki/Bonn" }],
    changes: [
      { field: "en", old: "Is Bonn the capital?", new: "Which city was the capital?" },
      {
        field: "bodyEn",
        diff: [
          ["=", 3],
          ["-", "old "],
          ["+", "new "],
        ],
      },
    ],
    hash: "0123456789ab",
  };

  it("parses a history with entries and retired facts", () => {
    const parsed = ArticleHistoryResponseSchema.parse({
      articleId: "a0001",
      entries: [entry],
      retired: [retired],
    });
    expect(parsed.entries[0]?.changes?.[1]?.diff?.[2]).toEqual(["+", "new "]);
    expect(parsed.retired[0]?.retired.replacedBy).toEqual(["f00002"]);
    expect(ArticleHistoryParamSchema.parse({ id: "a0042" }).id).toBe("a0042");
  });

  it("rejects an unknown kind, a bad retirement date and a malformed article id", () => {
    const badKind = ArticleHistoryResponseSchema.safeParse({
      articleId: "a0001",
      entries: [{ ...entry, kind: "vandalised" }],
      retired: [],
    });
    expect(badKind.success).toBe(false);
    if (!badKind.success) expect(badKind.error.issues[0]?.path).toEqual(["entries", 0, "kind"]);

    const badDate = ArticleHistoryResponseSchema.safeParse({
      articleId: "a0001",
      entries: [],
      retired: [{ ...retired, retired: { ...retired.retired, at: "21.10.2026" } }],
    });
    expect(badDate.success).toBe(false);
    if (!badDate.success) {
      expect(badDate.error.issues[0]?.path).toEqual(["retired", 0, "retired", "at"]);
    }

    const badId = ArticleHistoryParamSchema.safeParse({ id: "c001" });
    expect(badId.success).toBe(false);
    if (!badId.success) expect(badId.error.issues[0]?.path).toEqual(["id"]);
  });

  it("rejects a change carrying both whole values and a diff", () => {
    const both = ArticleHistoryResponseSchema.safeParse({
      articleId: "a0001",
      entries: [{ ...entry, changes: [{ field: "bodyEn", old: "a", diff: [["=", 1]] }] }],
      retired: [],
    });
    expect(both.success).toBe(false);
  });
});

describe("withNewSources", () => {
  it("switches on a source added after the member last chose", () => {
    const old = QuizSettingsSchema.parse({
      language: { primary: "en", secondary: null },
      sources: ["quiztopia"],
      sourcesKnown: ["quiztopia", "trivial-pursuit"],
    });
    const next = withNewSources(old);
    expect(next.sources).toEqual(["quiztopia", "publish-or-perish", "publish-or-perish-mge"]);
    expect(next.sourcesKnown).toEqual([
      "quiztopia",
      "trivial-pursuit",
      "publish-or-perish",
      "publish-or-perish-mge",
    ]);
    expect(withNewSources(next)).toBe(next);
  });
});
