// Wire schemas for the quiz trainer, wiki and search: `/api/trainers/quiz/*`.
// The trainer's unit is a FACT of the quiz bank (`quiz/content-types.ts`) —
// on the wire it is the `questionId`, the id the shared SRS state is keyed
// by. New facts arrive a whole article at a time. Dates are the CLIENT's
// local `YYYY-MM-DD` — the server never guesses a timezone. Reviews are
// idempotent on `clientId`.

import { z } from "zod";
import { RetirementSchema, WordingIdSchema } from "../../quiz/content-types.ts";
import { HistoryEntrySchema } from "../../quiz/history-schema.ts";
import { ARTICLE_ID_RE, FACT_ID_RE } from "../../quiz/ids.ts";
import { SOURCE_IDS } from "../../quiz/sources.ts";
import { DOMAIN_COUNT, DOMAIN_SLUGS } from "../../quiz/taxonomy.ts";
import { DateKeyStringSchema } from "./collection.ts";

/** The Quiztopia table game's question language (EN / DE / both). */
export const QuizLanguageSchema = z.enum(["en", "de", "both"]);
export type QuizLanguage = z.infer<typeof QuizLanguageSchema>;

/** One language of the quiz bank's text. */
export const QuizLangSchema = z.enum(["en", "de", "ru"]);
export type QuizLang = z.infer<typeof QuizLangSchema>;

/**
 * The trainer's languages: everything in `primary`, with an optional
 * `secondary` shown underneath questions and answers. Settings stored before
 * Russian (`"en" | "de" | "both"`) read as en / de / en+de.
 */
export const QuizLanguagesSchema = z.preprocess(
  (raw) =>
    raw === "en" || raw === "de"
      ? { primary: raw, secondary: null }
      : raw === "both"
        ? { primary: "en", secondary: "de" }
        : raw,
  z
    .object({ primary: QuizLangSchema, secondary: QuizLangSchema.nullable() })
    .refine((l) => l.secondary !== l.primary, {
      message: "the second language must differ from the first",
      path: ["secondary"],
    }),
);
export type QuizLanguages = z.infer<typeof QuizLanguagesSchema>;

export const SrsGradeSchema = z.enum(["again", "good"]);
export const SrsStateKindSchema = z.enum(["new", "learning", "review", "relearning"]);
export const QuizFactIdSchema = z.string().regex(FACT_ID_RE, "Expected a fact id like f00001");
export const QuizArticleIdSchema = z
  .string()
  .regex(ARTICLE_ID_RE, "Expected an article id like a0001");
export const QuizDomainSchema = z.enum(DOMAIN_SLUGS);
export type QuizDomainSlug = z.infer<typeof QuizDomainSchema>;
export const QuizSourceSchema = z.enum(SOURCE_IDS);

export const SrsStateSchema = z.object({
  questionId: QuizFactIdSchema,
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

export const QuizSettingsSchema = z.object({
  language: QuizLanguagesSchema,
  /**
   * The day's budget of new facts, across every session. They arrive a
   * whole article at a time (an article holds 1–8 facts): articles are
   * taken while they fit, and the first one even when it alone is bigger.
   */
  newFactsPerDay: z.number().int().min(0).max(60).default(15),
  includeLeeches: z.boolean().default(false),
  gameReviewsAffectSrs: z.boolean().default(false),
  /** Games whose questions are studied; an article joins when one of them prints it. */
  sources: z
    .array(QuizSourceSchema)
    .min(1)
    .default([...SOURCE_IDS]),
  /**
   * The sources that existed when the member last chose `sources`. A game
   * added later joins their sources automatically (`withNewSources`): new
   * games are opt-out, not opt-in.
   */
  sourcesKnown: z.array(QuizSourceSchema).default([...SOURCE_IDS]),
  /** Domains "Study all" leaves out (due and new); a domain's own session still studies them. */
  excludeFromAll: z.array(QuizDomainSchema).max(DOMAIN_COUNT).default([]),
});
export type QuizSettings = z.infer<typeof QuizSettingsSchema>;

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  language: { primary: "en", secondary: null },
  newFactsPerDay: 15,
  includeLeeches: false,
  gameReviewsAffectSrs: false,
  sources: [...SOURCE_IDS],
  sourcesKnown: [...SOURCE_IDS],
  excludeFromAll: [],
};

/** Settings with every source the member hasn't seen yet switched on (and now known). */
export function withNewSources(settings: QuizSettings): QuizSettings {
  const unseen = SOURCE_IDS.filter((s) => !settings.sourcesKnown.includes(s));
  if (unseen.length === 0) return settings;
  return {
    ...settings,
    sources: [...settings.sources, ...unseen.filter((s) => !settings.sources.includes(s))],
    sourcesKnown: [...settings.sourcesKnown, ...unseen],
  };
}

// ── Overview ────────────────────────────────────────────────────────────

export const TrainerOverviewQuerySchema = z.object({ today: DateKeyStringSchema });

export const DomainOverviewSchema = z.object({
  domain: QuizDomainSchema,
  /** Facts in the domain's articles from the member's sources. */
  total: z.number().int().nonnegative(),
  seen: z.number().int().nonnegative(),
  due: z.number().int().nonnegative(),
  learningDue: z.number().int().nonnegative(),
  newAvailable: z.number().int().nonnegative(),
  known: z.number().int().nonnegative(),
  mature: z.number().int().nonnegative(),
  mastery: z.number().min(0).max(1),
  retention30: z.number().min(0).max(1).nullable(),
  reviews30: z.number().int().nonnegative(),
  leeches: z.number().int().nonnegative(),
});
export type DomainOverview = z.infer<typeof DomainOverviewSchema>;

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
  /** New facts the day's budget still allows (whole articles). */
  newRemainingToday: z.number().int().nonnegative(),
  /** Unseen facts of articles already begun — dealt on top of the budget. */
  leftoverToday: z.number().int().nonnegative(),
  domains: z.array(DomainOverviewSchema).length(DOMAIN_COUNT),
  settings: QuizSettingsSchema,
});
export type TrainerOverview = z.infer<typeof TrainerOverviewResponseSchema>;

// ── Queue ───────────────────────────────────────────────────────────────

export const TrainerQueueQuerySchema = z.object({
  today: DateKeyStringSchema,
  domain: QuizDomainSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  includeLeeches: z.stringbool().default(false),
});

export const QueueTierSchema = z.enum(["learning", "review", "new"]);

export const TrainerQueueItemSchema = z.object({
  questionId: QuizFactIdSchema,
  articleId: QuizArticleIdSchema,
  domain: QuizDomainSchema,
  tier: QueueTierSchema,
  state: SrsStateSchema.nullable(),
  /** A new fact whose article was already begun (another of its facts has
   *  been studied): the reading was done then, so the day's intro skips it. */
  articleStarted: z.boolean(),
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
  /** Facts already studied today that are no longer in the queue (the day's progress so far). */
  doneToday: z.number().int().nonnegative(),
});
export type TrainerQueue = z.infer<typeof TrainerQueueResponseSchema>;

/** States for an explicit list of questions (mini quiz / practise misses). */
export const TrainerStatesQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((s) => s.split(","))
    .pipe(z.array(QuizFactIdSchema).min(1).max(200)),
});
export const TrainerStatesResponseSchema = z.object({ states: z.array(SrsStateSchema) });

// ── Timeline pins ───────────────────────────────────────────────────────

/**
 * Every fact the member has studied pins its timeline event to their
 * personal timeline — one SRS row = one pin. The client joins these ids
 * with the content's `timeline.json`.
 */
export const TimelinePinSchema = z.object({
  questionId: QuizFactIdSchema,
  state: SrsStateKindSchema,
  /** Graduated to review — the answer is known, not still being learned. */
  known: z.boolean(),
  lastReviewedAt: z.string().nullable(),
});
export type TimelinePin = z.infer<typeof TimelinePinSchema>;

/** The pins' dated count and the years they span (the hub's one-line teaser). */
export const TimelinePinsSummarySchema = z.object({
  dated: z.number().int().nonnegative(),
  spanYears: z.number().nonnegative(),
});
export type TimelinePinsSummary = z.infer<typeof TimelinePinsSummarySchema>;

export const TimelinePinsResponseSchema = z.object({
  pins: z.array(TimelinePinSchema),
  summary: TimelinePinsSummarySchema,
});
export type TimelinePins = z.infer<typeof TimelinePinsResponseSchema>;

// ── Reviews ─────────────────────────────────────────────────────────────

/** Where a logged review came from. Only "trainer" is accepted on the wire. */
export const ReviewSourceSchema = z.enum(["trainer", "game"]);
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;

/**
 * One trainer grade posted by the client. Table-game answers are NOT posted
 * by clients: the server records them itself at game over from the
 * persisted replay (`server/src/lib/quiz/game-reviews.ts`), so a client
 * can neither skip nor forge them; anything but "trainer" is a 400.
 */
export const ReviewBodySchema = z.object({
  clientId: z.string().min(8).max(64),
  questionId: QuizFactIdSchema,
  grade: SrsGradeSchema,
  localDate: DateKeyStringSchema,
  durationMs: z.number().int().min(0).max(600_000).nullable().optional(),
  /** When the member graded it — a commit or an offline replay may land later. */
  reviewedAt: z.string().datetime({ offset: true }).optional(),
  source: z.literal("trainer").default("trainer"),
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
  lang: QuizLangSchema.default("en"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  domain: QuizDomainSchema.optional(),
});
export const SearchHitSchema = z.object({
  questionId: QuizFactIdSchema,
  articleId: QuizArticleIdSchema,
  domain: QuizDomainSchema,
  question: z.string(),
  answer: z.string(),
  title: z.string(),
  score: z.number(),
});
export const SearchResponseSchema = z.object({ hits: z.array(SearchHitSchema) });
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ── Article history ─────────────────────────────────────────────────────

/** `GET /articles/:id/history` — the path parameter. */
export const ArticleHistoryParamSchema = z.object({ id: QuizArticleIdSchema });

/** A retired fact as the history panel lists it: its answer, its lead question, why it left. */
export const RetiredFactSummarySchema = z.object({
  id: QuizFactIdSchema,
  answerEn: z.string(),
  answerDe: z.string(),
  answerRu: z.string().optional(),
  /** The fact's first wording. */
  questionEn: z.string(),
  questionDe: z.string(),
  questionRu: z.string().optional(),
  /** Every wording id, so their history entries can be grouped under the fact. */
  wordingIds: z.array(WordingIdSchema),
  retired: RetirementSchema,
});
export type RetiredFactSummary = z.infer<typeof RetiredFactSummarySchema>;

/**
 * An article's changelog (`quiz/history.ts`: every entry about the article,
 * its facts — active and retired — and their wordings, oldest first) and
 * its retired facts.
 */
export const ArticleHistoryResponseSchema = z.object({
  articleId: QuizArticleIdSchema,
  entries: z.array(HistoryEntrySchema),
  retired: z.array(RetiredFactSummarySchema),
});
export type ArticleHistoryResponse = z.infer<typeof ArticleHistoryResponseSchema>;
export type ArticleHistoryEntry = ArticleHistoryResponse["entries"][number];

// ── Wiki reads ──────────────────────────────────────────────────────────

export const WikiReadBodySchema = z.object({ articleId: QuizArticleIdSchema });
export const WikiReadsResponseSchema = z.object({
  reads: z.array(z.object({ articleId: QuizArticleIdSchema, readAt: z.string() })),
});
export type WikiReads = z.infer<typeof WikiReadsResponseSchema>;

// ── Journal ─────────────────────────────────────────────────────────────

/**
 * The member's journal, newest day first, paged by ACTIVE days (a day with
 * a review or a read): `before` is exclusive, `days` is how many active
 * days to return. `tz` is the caller's IANA zone, so a read's timestamp
 * lands on the same calendar day the member lived it (reviews already carry
 * the client's local date).
 */
export const JournalQuerySchema = z.object({
  before: DateKeyStringSchema.optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
  tz: z.string().min(1).max(64).default("UTC"),
});

export const JournalQuestionSchema = z.object({
  questionId: QuizFactIdSchema,
  /** A game prints this fact (else it is one we wrote alongside). */
  printed: z.boolean(),
  en: z.string(),
  de: z.string(),
  ru: z.string().optional(),
  answerEn: z.string(),
  answerDe: z.string(),
  answerRu: z.string().optional(),
  /** Every grade that day, in order ("again" then "good" = missed, then got it). */
  grades: z.array(SrsGradeSchema).min(1),
  /** Seen for the first time that day. */
  firstSeen: z.boolean(),
  /** Answered at a table game rather than in the trainer. */
  fromGame: z.boolean(),
});
export type JournalQuestion = z.infer<typeof JournalQuestionSchema>;

export const JournalArticleSchema = z.object({
  articleId: QuizArticleIdSchema,
  domain: QuizDomainSchema,
  titleEn: z.string(),
  titleDe: z.string(),
  titleRu: z.string().optional(),
  /** When the article was read that day (the day's latest read), else null. */
  readAt: z.string().nullable(),
  questions: z.array(JournalQuestionSchema),
});
export type JournalArticle = z.infer<typeof JournalArticleSchema>;

export const JournalDaySchema = z.object({
  date: DateKeyStringSchema,
  /** Grades given that day. */
  reviewed: z.number().int().nonnegative(),
  /** …of which "knew it". */
  knew: z.number().int().nonnegative(),
  /** Facts seen for the first time. */
  newQuestions: z.number().int().nonnegative(),
  articlesRead: z.number().int().nonnegative(),
  articles: z.array(JournalArticleSchema),
});
export type JournalDay = z.infer<typeof JournalDaySchema>;

export const JournalResponseSchema = z.object({
  days: z.array(JournalDaySchema),
  /** Pass as `before` for the next (older) page; null when there is nothing older. */
  nextBefore: DateKeyStringSchema.nullable(),
});
export type Journal = z.infer<typeof JournalResponseSchema>;

// ── Reset ───────────────────────────────────────────────────────────────

/** Wipes the caller's schedule, review history and wiki reads; settings stay. */
export const TrainerResetBodySchema = z.object({ confirm: z.literal(true) });
export const TrainerResetResponseSchema = z.object({
  ok: z.literal(true),
  deleted: z.object({
    states: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
    reads: z.number().int().nonnegative(),
  }),
});
export type TrainerReset = z.infer<typeof TrainerResetResponseSchema>;

// ── Game misses ─────────────────────────────────────────────────────────

export const RecentMissesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export const RecentMissesResponseSchema = z.object({
  misses: z.array(
    z.object({
      questionId: QuizFactIdSchema,
      articleId: QuizArticleIdSchema,
      domain: QuizDomainSchema,
      reviewedAt: z.string(),
      roomCode: z.string().nullable(),
      missCount: z.number().int().positive(),
    }),
  ),
});
export type RecentMisses = z.infer<typeof RecentMissesResponseSchema>;
