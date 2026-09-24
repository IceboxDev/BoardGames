// Wire schemas for the Quiztopia trainer, wiki and search: `/api/quiztopia/*`.
// Dates are the CLIENT's local `YYYY-MM-DD` — the server never guesses a
// timezone. Reviews are idempotent on `clientId`.

import { z } from "zod";
import { CARD_ID_RE, QUESTION_ID_RE, SET_ID_RE } from "../../games/quiztopia/ids.ts";
import { DateKeyStringSchema } from "./collection.ts";

export const QuiztopiaLanguageSchema = z.enum(["en", "de", "both"]);
export type QuiztopiaLanguage = z.infer<typeof QuiztopiaLanguageSchema>;

export const SrsGradeSchema = z.enum(["again", "good"]);
export const SrsStateKindSchema = z.enum(["new", "learning", "review", "relearning"]);
export const QuiztopiaQuestionIdSchema = z
  .string()
  .regex(QUESTION_ID_RE, "Expected a question id like c001-s01-q0");
export const QuiztopiaSetIdSchema = z.string().regex(SET_ID_RE, "Expected a set id like c001-s01");
export const QuiztopiaCardIdSchema = z.string().regex(CARD_ID_RE, "Expected a card id like c001");
export const QuiztopiaCategorySchema = z.number().int().min(1).max(12);
const CategoryQuerySchema = z.coerce.number().int().min(1).max(12);

export const SrsStateSchema = z.object({
  questionId: QuiztopiaQuestionIdSchema,
  state: SrsStateKindSchema,
  ease: z.number(),
  intervalDays: z.number().int().nonnegative(),
  dueDate: DateKeyStringSchema,
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  lastReviewedAt: z.string().nullable(),
  leech: z.boolean(),
});
export type SrsStateWire = z.infer<typeof SrsStateSchema>;

// ── Settings ────────────────────────────────────────────────────────────

export const QuiztopiaSettingsSchema = z.object({
  language: QuiztopiaLanguageSchema,
  newPerDay: z.number().int().min(0).max(50),
  newPerDayByCategory: z.record(z.string(), z.number().int().min(0).max(50)).default({}),
  includeLeeches: z.boolean().default(false),
  gameReviewsAffectSrs: z.boolean().default(false),
  /** "sets": new cards arrive a whole set (all five questions) at a time and
   * siblings are studied together; "originals": every original card question
   * first, the invented siblings later and spread apart. */
  newCardOrder: z.enum(["sets", "originals"]).default("sets"),
});
export type QuiztopiaSettings = z.infer<typeof QuiztopiaSettingsSchema>;

export const DEFAULT_QUIZTOPIA_SETTINGS: QuiztopiaSettings = {
  language: "en",
  newPerDay: 10,
  newPerDayByCategory: {},
  includeLeeches: false,
  gameReviewsAffectSrs: false,
  newCardOrder: "sets",
};

// ── Overview ────────────────────────────────────────────────────────────

export const TrainerOverviewQuerySchema = z.object({ today: DateKeyStringSchema });

export const CategoryOverviewSchema = z.object({
  n: QuiztopiaCategorySchema,
  total: z.number().int().nonnegative(),
  seen: z.number().int().nonnegative(),
  due: z.number().int().nonnegative(),
  learningDue: z.number().int().nonnegative(),
  newAvailable: z.number().int().nonnegative(),
  newRemainingToday: z.number().int().nonnegative(),
  known: z.number().int().nonnegative(),
  mature: z.number().int().nonnegative(),
  mastery: z.number().min(0).max(1),
  retention30: z.number().min(0).max(1).nullable(),
  reviews30: z.number().int().nonnegative(),
  leeches: z.number().int().nonnegative(),
});
export type CategoryOverview = z.infer<typeof CategoryOverviewSchema>;

export const TrainerOverviewResponseSchema = z.object({
  contentVersion: z.string(),
  today: DateKeyStringSchema,
  streak: z.object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
    studiedToday: z.boolean(),
  }),
  todayCounts: z.object({
    reviews: z.number().int().nonnegative(),
    good: z.number().int().nonnegative(),
    again: z.number().int().nonnegative(),
    newIntroduced: z.number().int().nonnegative(),
  }),
  categories: z.array(CategoryOverviewSchema).length(12),
  settings: QuiztopiaSettingsSchema,
});
export type TrainerOverview = z.infer<typeof TrainerOverviewResponseSchema>;

// ── Queue ───────────────────────────────────────────────────────────────

export const TrainerQueueQuerySchema = z.object({
  today: DateKeyStringSchema,
  category: CategoryQuerySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  includeLeeches: z.stringbool().default(false),
});

export const QueueTierSchema = z.enum(["learning", "review", "new"]);

export const TrainerQueueItemSchema = z.object({
  questionId: QuiztopiaQuestionIdSchema,
  setId: QuiztopiaSetIdSchema,
  cardId: QuiztopiaCardIdSchema,
  category: QuiztopiaCategorySchema,
  tier: QueueTierSchema,
  state: SrsStateSchema.nullable(),
});
export type TrainerQueueItem = z.infer<typeof TrainerQueueItemSchema>;

export const TrainerQueueResponseSchema = z.object({
  today: DateKeyStringSchema,
  items: z.array(TrainerQueueItemSchema),
  counts: z.object({
    learning: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
  }),
});
export type TrainerQueue = z.infer<typeof TrainerQueueResponseSchema>;

/** States for an explicit list of questions (mini quiz / practise misses). */
export const TrainerStatesQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((s) => s.split(","))
    .pipe(z.array(QuiztopiaQuestionIdSchema).min(1).max(200)),
});
export const TrainerStatesResponseSchema = z.object({ states: z.array(SrsStateSchema) });

// ── Reviews ─────────────────────────────────────────────────────────────

export const ReviewSourceSchema = z.enum(["trainer", "game"]);

export const ReviewBodySchema = z.object({
  clientId: z.string().min(8).max(64),
  questionId: QuiztopiaQuestionIdSchema,
  grade: SrsGradeSchema,
  localDate: DateKeyStringSchema,
  durationMs: z.number().int().min(0).max(600_000).nullable().optional(),
  reviewedAt: z.string().datetime({ offset: true }).optional(),
  source: ReviewSourceSchema.default("trainer"),
  roomCode: z.string().min(1).max(16).optional(),
});
export type ReviewBody = z.input<typeof ReviewBodySchema>;

export const ReviewResponseSchema = z.object({
  ok: z.literal(true),
  existed: z.boolean(),
  applied: z.boolean(),
  state: SrsStateSchema.nullable(),
});
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;

export const MAX_BULK_REVIEWS = 200;
export const BulkReviewsBodySchema = z.object({
  reviews: z.array(ReviewBodySchema).min(1).max(MAX_BULK_REVIEWS),
});
export const BulkReviewsResponseSchema = z.object({
  ok: z.literal(true),
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  states: z.array(SrsStateSchema),
});

// ── History ─────────────────────────────────────────────────────────────

export const TrainerHistoryQuerySchema = z.object({
  today: DateKeyStringSchema,
  days: z.coerce.number().int().min(7).max(365).default(90),
});
export const TrainerHistoryResponseSchema = z.object({
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
export type TrainerHistory = z.infer<typeof TrainerHistoryResponseSchema>;

// ── Search ──────────────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  lang: z.enum(["en", "de"]).default("en"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: CategoryQuerySchema.optional(),
});
export const SearchHitSchema = z.object({
  questionId: QuiztopiaQuestionIdSchema,
  setId: QuiztopiaSetIdSchema,
  cardId: QuiztopiaCardIdSchema,
  category: QuiztopiaCategorySchema,
  question: z.string(),
  answer: z.string(),
  title: z.string(),
  score: z.number(),
});
export const SearchResponseSchema = z.object({ hits: z.array(SearchHitSchema) });
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ── Wiki reads ──────────────────────────────────────────────────────────

export const WikiReadBodySchema = z.object({ setId: QuiztopiaSetIdSchema });
export const WikiReadsResponseSchema = z.object({
  reads: z.array(z.object({ setId: QuiztopiaSetIdSchema, readAt: z.string() })),
});
export type WikiReads = z.infer<typeof WikiReadsResponseSchema>;

// ── Game misses ─────────────────────────────────────────────────────────

export const RecentMissesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const RecentMissesResponseSchema = z.object({
  misses: z.array(
    z.object({
      questionId: QuiztopiaQuestionIdSchema,
      setId: QuiztopiaSetIdSchema,
      cardId: QuiztopiaCardIdSchema,
      category: QuiztopiaCategorySchema,
      reviewedAt: z.string(),
      roomCode: z.string().nullable(),
      missCount: z.number().int().positive(),
    }),
  ),
});
export type RecentMisses = z.infer<typeof RecentMissesResponseSchema>;
