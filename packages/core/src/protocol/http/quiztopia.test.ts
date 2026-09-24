import { describe, expect, it } from "vitest";
import {
  BulkReviewsBodySchema,
  QuiztopiaSettingsSchema,
  ReviewBodySchema,
  SearchQuerySchema,
  TrainerQueueQuerySchema,
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
    });
    expect(() =>
      QuiztopiaSettingsSchema.parse({ language: "de", newPerDay: 5, newCardOrder: "random" }),
    ).toThrow();
  });
});
