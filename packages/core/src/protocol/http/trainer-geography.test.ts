import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEO_SETTINGS,
  GeoBulkReviewsBodySchema,
  GeoOverviewResponseSchema,
  GeoResetBodySchema,
  GeoReviewBodySchema,
  GeoSettingsSchema,
} from "./trainer-geography.ts";

const review = {
  clientId: "abcdefgh-1234",
  cardId: "co:DEU:s1",
  grade: "hard",
  localDate: "2026-09-25",
  durationMs: 4200,
  outcome: { verdict: "near", distanceKm: 84.5, confusedWith: null },
};

describe("geography trainer protocol", () => {
  it("parses a review, defaulting the source and hint", () => {
    const r = GeoReviewBodySchema.parse(review);
    expect(r.source).toBe("trainer");
    expect(r.outcome.hint).toBe(false);
  });

  it("rejects a malformed card id, grade or place", () => {
    const bad = (patch: object, path: string) => {
      const res = GeoReviewBodySchema.safeParse({ ...review, ...patch });
      expect(res.success).toBe(false);
      expect(res.error?.issues[0].path.join(".")).toBe(path);
    };
    bad({ cardId: "co:DEU" }, "cardId");
    bad({ cardId: "c001-s01-q0" }, "cardId");
    bad({ grade: "meh" }, "grade");
    bad({ outcome: { verdict: "wrong", confusedWith: "Germany" } }, "outcome.confusedWith");
    bad({ localDate: "25.09.2026" }, "localDate");
  });

  it("caps bulk uploads", () => {
    expect(GeoBulkReviewsBodySchema.safeParse({ reviews: [] }).success).toBe(false);
    const many = Array.from({ length: 201 }, () => review);
    expect(GeoBulkReviewsBodySchema.safeParse({ reviews: many }).success).toBe(false);
  });

  it("fills settings defaults and bounds the daily budget", () => {
    expect(DEFAULT_GEO_SETTINGS).toEqual({
      language: "en",
      newPerDay: 5,
      directions: "both",
      focus: null,
      includeLeeches: false,
    });
    expect(GeoSettingsSchema.safeParse({ newPerDay: 21 }).success).toBe(false);
    expect(GeoSettingsSchema.parse({ focus: "af" }).focus).toBe("af");
  });

  it("parses an overview and requires reset confirmation", () => {
    expect(
      GeoOverviewResponseSchema.parse({
        contentVersion: "v1",
        states: [],
        introducedToday: { places: 0, names: 0 },
        today: { reviews: 0, correct: 0 },
        streak: { current: 0, longest: 0, studiedToday: false },
        retention30: null,
        settings: DEFAULT_GEO_SETTINGS,
      }).states,
    ).toEqual([]);
    expect(GeoResetBodySchema.safeParse({ confirm: false }).success).toBe(false);
  });
});
