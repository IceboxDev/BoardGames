// Wire/file shapes of the generated content under `./content/`. The importer
// validates its output against these, the core integrity test re-validates
// the committed files, and the server parses them at boot — so a hand edit
// that breaks the shape fails before it ships.

import { z } from "zod";
import { CARD_ID_RE, QUESTION_ID_RE, QUESTIONS_PER_SET, SET_ID_RE, SETS_PER_CARD } from "./ids.ts";
import {
  compareTimelineDates,
  parseTimelineDate,
  precisionFitsDate,
  TIMELINE_KINDS,
  TIMELINE_PRECISIONS,
} from "./timeline.ts";

export const CardIdSchema = z.string().regex(CARD_ID_RE);
export const SetIdSchema = z.string().regex(SET_ID_RE);
export const QuestionIdSchema = z.string().regex(QUESTION_ID_RE);
export const CategoryNSchema = z.number().int().min(1).max(SETS_PER_CARD);

export const ContentCategorySchema = z.object({
  n: CategoryNSchema,
  en: z.string().min(1),
  de: z.string().min(1),
  band: z.enum(["pink", "blue", "sand"]),
});

export const ContentIndexSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{12}$/),
  generatedAt: z.string(),
  counts: z.object({
    cards: z.number().int().nonnegative(),
    sets: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
  }),
  categories: z.array(ContentCategorySchema).length(SETS_PER_CARD),
  cards: z.array(z.object({ id: CardIdSchema, sourceImage: z.string().min(1) })),
});
export type ContentIndex = z.infer<typeof ContentIndexSchema>;

// ── Timeline + source (per question) ───────────────────────────────────

export const TimelineKindSchema = z.enum(TIMELINE_KINDS);
export const TimelinePrecisionSchema = z.enum(TIMELINE_PRECISIONS);
export const TimelineDateStringSchema = z.string().refine((s) => parseTimelineDate(s) !== null, {
  message: 'Expected "YYYY", "YYYY-MM" or "YYYY-MM-DD" (BC with a leading minus, no year 0)',
});

/**
 * The one dated thing a question is about — a moment, or a span (lifespan,
 * war, reign) when `end` is set or `ongoing` is true. See `timeline.ts`.
 */
export const TimelineEventSchema = z
  .object({
    kind: TimelineKindSchema,
    start: TimelineDateStringSchema,
    end: TimelineDateStringSchema.nullable(),
    precision: TimelinePrecisionSchema,
    approx: z.boolean(),
    ongoing: z.boolean(),
    labelEn: z.string().trim().min(1).max(200),
    labelDe: z.string().trim().min(1).max(200),
  })
  .superRefine((ev, ctx) => {
    if (!precisionFitsDate(ev.start, ev.precision)) {
      ctx.addIssue({
        code: "custom",
        path: ["precision"],
        message: `precision ${ev.precision} does not fit start ${ev.start}`,
      });
    }
    if (ev.ongoing && ev.end !== null) {
      ctx.addIssue({ code: "custom", path: ["ongoing"], message: "ongoing with an end" });
    }
    const start = parseTimelineDate(ev.start);
    const end = ev.end === null ? null : parseTimelineDate(ev.end);
    if (start && end && compareTimelineDates(end, start) <= 0) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "end is not after start" });
    }
  });
export type TimelineEventContent = z.infer<typeof TimelineEventSchema>;

/** One place on the internet that confirms the answer. */
export const SourceSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().trim().min(1).max(300),
  /** ISO 639-1 of the page ("en", "de", "fr" …). */
  lang: z.string().regex(/^[a-z]{2}$/),
});
export type ContentSource = z.infer<typeof SourceSchema>;

export const ContentQuestionSchema = z.object({
  id: QuestionIdSchema,
  en: z.string().min(1),
  de: z.string().min(1),
  answerEn: z.string().min(1),
  answerDe: z.string().min(1),
  /** The one datable thing the question pins to the player's timeline. */
  timeline: TimelineEventSchema,
  /** Where a player can cross-check the answer (any language). */
  source: SourceSchema,
});
export type ContentQuestion = z.infer<typeof ContentQuestionSchema>;

export const ContentSetQuestionsSchema = z.object({
  id: SetIdSchema,
  n: CategoryNSchema,
  /**
   * Player-facing editor's notes (misprints, dated facts, accepted variants),
   * one per language; "" when none. A language-neutral note is in both, a
   * note about one language's wording only in that one.
   */
  notesEn: z.string(),
  notesDe: z.string(),
  questions: z.array(ContentQuestionSchema).length(QUESTIONS_PER_SET),
});
export type ContentSetQuestions = z.infer<typeof ContentSetQuestionsSchema>;

export const CardQuestionsSchema = z.object({
  id: CardIdSchema,
  sourceImage: z.string().min(1),
  sets: z.array(ContentSetQuestionsSchema).length(SETS_PER_CARD),
});
export type CardQuestions = z.infer<typeof CardQuestionsSchema>;

/** `[start, length]` of the answer inside the article, in UTF-16 code units. */
export const AnswerSpanSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().positive(),
]);
export type AnswerSpan = z.infer<typeof AnswerSpanSchema>;

export const ContentSetArticleSchema = z.object({
  id: SetIdSchema,
  titleEn: z.string().min(1),
  articleEn: z.string().min(1),
  titleDe: z.string().min(1),
  articleDe: z.string().min(1),
  answerSpans: z.object({
    en: z.array(AnswerSpanSchema).length(QUESTIONS_PER_SET),
    de: z.array(AnswerSpanSchema).length(QUESTIONS_PER_SET),
  }),
});
export type ContentSetArticle = z.infer<typeof ContentSetArticleSchema>;

export const CardArticlesSchema = z.object({
  id: CardIdSchema,
  sets: z.array(ContentSetArticleSchema).length(SETS_PER_CARD),
});
export type CardArticles = z.infer<typeof CardArticlesSchema>;

/** setId → [titleEn, titleDe]; the wiki's browse index. */
export const TitlesSchema = z.record(z.string(), z.tuple([z.string(), z.string()]));
export type Titles = z.infer<typeof TitlesSchema>;

// ── Timeline index (`content/timeline.json`) ─────────────────────────────

/**
 * Every question's event in one file, so the timeline screen loads all of
 * them as a single lazy chunk. Compact keys: n = category, k = kind,
 * s / e = start / end, p = precision, a / o = approx / ongoing (only when
 * true), en / de = labels.
 */
export const TimelineIndexEntrySchema = z.object({
  n: CategoryNSchema,
  k: TimelineKindSchema,
  s: TimelineDateStringSchema,
  e: TimelineDateStringSchema.optional(),
  p: TimelinePrecisionSchema,
  a: z.literal(1).optional(),
  o: z.literal(1).optional(),
  en: z.string().min(1),
  de: z.string().min(1),
});
export type TimelineIndexEntry = z.infer<typeof TimelineIndexEntrySchema>;

export const TimelineIndexSchema = z.record(QuestionIdSchema, TimelineIndexEntrySchema);
export type TimelineIndex = z.infer<typeof TimelineIndexSchema>;

export function toTimelineIndexEntry(n: number, ev: TimelineEventContent): TimelineIndexEntry {
  return {
    n,
    k: ev.kind,
    s: ev.start,
    ...(ev.end !== null ? { e: ev.end } : {}),
    p: ev.precision,
    ...(ev.approx ? { a: 1 as const } : {}),
    ...(ev.ongoing ? { o: 1 as const } : {}),
    en: ev.labelEn,
    de: ev.labelDe,
  };
}

export function fromTimelineIndexEntry(entry: TimelineIndexEntry): TimelineEventContent {
  return {
    kind: entry.k,
    start: entry.s,
    end: entry.e ?? null,
    precision: entry.p,
    approx: entry.a === 1,
    ongoing: entry.o === 1,
    labelEn: entry.en,
    labelDe: entry.de,
  };
}

/** The timeline index a set of question files implies (questions without an event are absent). */
export function buildTimelineIndex(cards: readonly CardQuestions[]): TimelineIndex {
  const out: TimelineIndex = {};
  for (const card of cards) {
    for (const set of card.sets) {
      for (const q of set.questions) {
        if (q.timeline) out[q.id] = toTimelineIndexEntry(set.n, q.timeline);
      }
    }
  }
  return out;
}
