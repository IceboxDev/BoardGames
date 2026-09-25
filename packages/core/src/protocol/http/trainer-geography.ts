// Wire schemas for the World Geography trainer: `/api/trainers/geography/*`.
// Like Quiztopia's trainer, dates are the CLIENT's local `YYYY-MM-DD` and
// reviews are idempotent on `clientId`. The queue is built on the client
// (the whole deck is small) from the states this API returns; the server
// re-applies every grade itself.

import { z } from "zod";
import { CARD_ID_RE, PLACE_ID_RE } from "../../trainers/geography/catalog.ts";
import { ContinentIdSchema } from "../../trainers/geography/content-types.ts";
import { DateKeyStringSchema } from "./collection.ts";
import { SrsStateKindSchema } from "./quiztopia.ts";

export const GeoCardIdSchema = z.string().regex(CARD_ID_RE, "Expected a card id like co:DEU:s1");
export const GeoPlaceIdSchema = z.string().regex(PLACE_ID_RE, "Expected a place id like co:DEU");
export const GeoGradeSchema = z.enum(["again", "hard", "good", "easy"]);

export const GeoSrsStateSchema = z.object({
  /** The card id (the shared scheduler calls every item a question). */
  questionId: GeoCardIdSchema,
  state: SrsStateKindSchema,
  ease: z.number(),
  intervalDays: z.number().int().nonnegative(),
  dueDate: DateKeyStringSchema,
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  lastReviewedAt: z.string().nullable(),
  leech: z.boolean(),
});
export type GeoSrsStateWire = z.infer<typeof GeoSrsStateSchema>;

// ── Settings ────────────────────────────────────────────────────────────

export const GeoSettingsSchema = z.object({
  language: z.enum(["en", "de"]).default("en"),
  /** Unused since new places come a whole group at a time; kept so stored settings parse. */
  newPerDay: z.number().int().min(0).max(20).default(5),
  directions: z.enum(["both", "locate", "name"]).default("both"),
  /** Introduce new countries and cities only on this continent. */
  focus: ContinentIdSchema.nullable().default(null),
  includeLeeches: z.boolean().default(false),
});
export type GeoSettings = z.infer<typeof GeoSettingsSchema>;
export const DEFAULT_GEO_SETTINGS: GeoSettings = GeoSettingsSchema.parse({});

// ── Overview (states + today) ───────────────────────────────────────────

export const GeoOverviewQuerySchema = z.object({ today: DateKeyStringSchema });
export const GeoOverviewResponseSchema = z.object({
  contentVersion: z.string(),
  states: z.array(GeoSrsStateSchema),
  introducedToday: z.object({
    places: z.number().int().nonnegative(),
    names: z.number().int().nonnegative(),
  }),
  today: z.object({
    reviews: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
  }),
  streak: z.object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
    studiedToday: z.boolean(),
  }),
  /** Share of non-"again" answers on review cards over the last 30 days, or null. */
  retention30: z.number().min(0).max(1).nullable(),
  settings: GeoSettingsSchema,
});
export type GeoOverview = z.infer<typeof GeoOverviewResponseSchema>;

// ── Reviews ─────────────────────────────────────────────────────────────

export const GeoOutcomeSchema = z.object({
  verdict: z.enum(["correct", "close", "near", "wrong", "skipped"]),
  hint: z.boolean().default(false),
  typo: z.boolean().optional(),
  /** Locate: km between the click and the target. */
  distanceKm: z.number().nonnegative().max(21_000).optional(),
  /** Name: what was typed. */
  typed: z.string().max(80).optional(),
  /** The place the answer named instead (discrimination follow-ups). */
  confusedWith: GeoPlaceIdSchema.nullable().optional(),
  /** Asked in a placement round ("test what you know"): a pass is not new learning. */
  placement: z.boolean().optional(),
});
export type GeoOutcome = z.input<typeof GeoOutcomeSchema>;

export const GeoReviewBodySchema = z.object({
  clientId: z.string().min(8).max(64),
  cardId: GeoCardIdSchema,
  grade: GeoGradeSchema,
  localDate: DateKeyStringSchema,
  durationMs: z.number().int().min(0).max(600_000).nullable().optional(),
  reviewedAt: z.string().datetime({ offset: true }).optional(),
  /** "drill": free practice — only reschedules a card that is due anyway. */
  source: z.enum(["trainer", "drill"]).default("trainer"),
  outcome: GeoOutcomeSchema,
});
export type GeoReviewBody = z.input<typeof GeoReviewBodySchema>;

export const GeoReviewResponseSchema = z.object({
  ok: z.literal(true),
  existed: z.boolean(),
  applied: z.boolean(),
  state: GeoSrsStateSchema.nullable(),
});
export type GeoReviewResponse = z.infer<typeof GeoReviewResponseSchema>;

export const MAX_GEO_BULK_REVIEWS = 200;
export const GeoBulkReviewsBodySchema = z.object({
  reviews: z.array(GeoReviewBodySchema).min(1).max(MAX_GEO_BULK_REVIEWS),
});
export const GeoBulkReviewsResponseSchema = z.object({
  ok: z.literal(true),
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  states: z.array(GeoSrsStateSchema),
});

// ── History ─────────────────────────────────────────────────────────────

export const GeoHistoryQuerySchema = z.object({
  today: DateKeyStringSchema,
  days: z.coerce.number().int().min(7).max(365).default(90),
});
export const GeoHistoryResponseSchema = z.object({
  days: z.array(
    z.object({
      date: DateKeyStringSchema,
      reviews: z.number().int().nonnegative(),
      good: z.number().int().nonnegative(),
      again: z.number().int().nonnegative(),
      newIntroduced: z.number().int().nonnegative(),
    }),
  ),
});
export type GeoHistory = z.infer<typeof GeoHistoryResponseSchema>;

// ── Reset ───────────────────────────────────────────────────────────────

/** Wipes the caller's geography schedule and review history; settings stay. */
export const GeoResetBodySchema = z.object({ confirm: z.literal(true) });
export const GeoResetResponseSchema = z.object({
  ok: z.literal(true),
  deleted: z.object({
    states: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
  }),
});
