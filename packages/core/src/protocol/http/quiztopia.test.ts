import { describe, expect, it } from "vitest";
import {
  BulkReviewsBodySchema,
  JournalQuerySchema,
  JournalResponseSchema,
  QuiztopiaSettingsSchema,
  ReviewBodySchema,
  SearchQuerySchema,
  TimelinePinsResponseSchema,
  TrainerQueueQuerySchema,
  TrainerResetBodySchema,
  TrainerResetResponseSchema,
  TrainerStatesQuerySchema,
} from "./quiztopia.ts";

describe("quiztopia protocol", () => {
  it("parses a review body with defaults", () => {
    const parsed = ReviewBodySchema.parse({
      clientId: "0123456789ab",
      questionId: "c001-s01-q0",
      grade: "good",
      localDate: "2026-09-19",
    });
    expect(parsed.source).toBe("trainer");
    expect(parsed.durationMs).toBeUndefined();
  });

  it("rejects a bad grade, a malformed question id and a bad date", () => {
    const base = {
      clientId: "0123456789ab",
      questionId: "c001-s01-q0",
      grade: "good",
      localDate: "2026-09-19",
    };
    expect(ReviewBodySchema.safeParse({ ...base, grade: "hard" }).success).toBe(false);
    const badId = ReviewBodySchema.safeParse({ ...base, questionId: "c001-s13-q0" });
    expect(badId.success).toBe(false);
    if (!badId.success) expect(badId.error.issues[0]?.path).toEqual(["questionId"]);
    expect(ReviewBodySchema.safeParse({ ...base, localDate: "19.09.2026" }).success).toBe(false);
  });

  it("refuses table-game reviews from clients (the server records those itself)", () => {
    const base = {
      clientId: "game:ABCD:3",
      questionId: "c001-s01-q0",
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
      questionId: "c001-s01-q0",
      grade: "again",
      localDate: "2026-09-19",
    };
    expect(BulkReviewsBodySchema.safeParse({ reviews: Array(200).fill(one) }).success).toBe(true);
    expect(BulkReviewsBodySchema.safeParse({ reviews: Array(201).fill(one) }).success).toBe(false);
  });

  it("coerces query params", () => {
    const q = TrainerQueueQuerySchema.parse({
      today: "2026-09-19",
      category: "7",
      limit: "25",
      includeLeeches: "true",
    });
    expect(q).toEqual({ today: "2026-09-19", category: 7, limit: 25, includeLeeches: true });
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
    expect(TrainerStatesQuerySchema.parse({ ids: "c001-s01-q0,c002-s12-q4" }).ids).toEqual([
      "c001-s01-q0",
      "c002-s12-q4",
    ]);
    expect(TrainerStatesQuerySchema.safeParse({ ids: "c001-s01-q0,nope" }).success).toBe(false);
  });

  it("fills settings defaults", () => {
    expect(QuiztopiaSettingsSchema.parse({ language: "de", newPerDay: 5 })).toEqual({
      language: "de",
      newPerDay: 5,
      newPerDayByCategory: {},
      includeLeeches: false,
      gameReviewsAffectSrs: false,
      newCardOrder: "sets",
      newSetsPerDay: 3,
      excludeFromAll: [],
    });
    expect(() =>
      QuiztopiaSettingsSchema.parse({ language: "de", newPerDay: 5, newSetsPerDay: 11 }),
    ).toThrow();
    expect(() =>
      QuiztopiaSettingsSchema.parse({ language: "de", newPerDay: 5, excludeFromAll: [13] }),
    ).toThrow();
    expect(() =>
      QuiztopiaSettingsSchema.parse({ language: "de", newPerDay: 5, newCardOrder: "random" }),
    ).toThrow();
  });

  it("parses timeline pins and rejects a bad id, state or missing flag", () => {
    const pin = {
      questionId: "c001-s01-q3",
      state: "review",
      known: true,
      lastReviewedAt: "2026-09-20T10:00:00.000Z",
    };
    expect(TimelinePinsResponseSchema.parse({ pins: [pin] }).pins[0]).toEqual(pin);
    expect(TimelinePinsResponseSchema.parse({ pins: [] }).pins).toEqual([]);
    const badId = TimelinePinsResponseSchema.safeParse({ pins: [{ ...pin, questionId: "c1" }] });
    expect(badId.success).toBe(false);
    if (!badId.success) expect(badId.error.issues[0]?.path).toEqual(["pins", 0, "questionId"]);
    const badState = TimelinePinsResponseSchema.safeParse({ pins: [{ ...pin, state: "known" }] });
    expect(badState.success).toBe(false);
    if (!badState.success) expect(badState.error.issues[0]?.path).toEqual(["pins", 0, "state"]);
    const { known: _known, ...noKnown } = pin;
    const missing = TimelinePinsResponseSchema.safeParse({ pins: [noKnown] });
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
      questionId: "c001-s01-q0",
      q: 0,
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
          sets: [
            {
              setId: "c001-s01",
              category: 1,
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
    expect(JournalResponseSchema.parse(page).days[0]?.sets[0]?.questions[0]?.grades).toEqual([
      "again",
      "good",
    ]);
    const bad = JournalResponseSchema.safeParse({
      ...page,
      days: [
        {
          ...page.days[0],
          sets: [{ ...page.days[0]?.sets[0], questions: [{ ...question, questionId: "c1" }] }],
        },
      ],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.path).toEqual([
        "days",
        0,
        "sets",
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
            sets: [{ ...page.days[0]?.sets[0], questions: [{ ...question, grades: [] }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
