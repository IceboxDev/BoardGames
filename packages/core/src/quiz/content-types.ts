// File shapes of the quiz content under `./content/`, the platform's one
// question bank. The repo files ARE the source of truth: the ingest pipeline
// edits them, the integrity test (`content.test.ts`) re-validates them, the
// server parses them at boot and the web loads them as lazy chunks.
//
//   meta.json                 version + counts (tiny, eager on the web)
//   index.json                one entry per article (titles, domain, fact ids)
//   articles/aNNNN.json       one topic page: body + its facts and their wordings
//   sources/<source>.json     every printed card of a game, slot by slot
//   timeline.json             every fact's dated event, keyed by fact id
//   tags.json                 the tag facets and values (`tags.ts`)
//   evidence/aNNNN.json       an article's evidence ledger (`evidence-types.ts`)
//   backlog.jsonl             open work on the bank (`backlog-types.ts`)
//   history/aNNNN.json        the changelog (`history.ts`); history/cards/<source>.json
//
// Text is trilingual — English, German, Russian. Russian is optional while
// the bank is being translated (`contentProblems(…, { complete: true })`
// requires it, and at least one image per article, once it is done).
//
// An article is a whole topic page that everyone reads in full. It covers
// 1–8 active facts; a fact is ONE question and its answer (located in every
// body). Its wordings are that same question as each source words it — a
// printed card, or our own — never a different question that happens to
// share the answer (that is a fact of its own, wherever it belongs).
//
// Nothing leaves the bank: a fact taken out of play moves to the article's
// `retired` list with the date and reason, and can be restored. Every change
// to an article, fact or wording is logged in `history/` (`history.ts`).

import { z } from "zod";
import {
  ARTICLE_ID_RE,
  FACT_ID_RE,
  MAX_FACTS_PER_ARTICLE,
  QID_RE,
  SOURCE_CARD_ID_RE,
  TAG_RE,
  WORDING_ID_RE,
} from "./ids.ts";
import { SOURCE_IDS } from "./sources.ts";
import { DOMAIN_SLUGS } from "./taxonomy.ts";
import {
  compareTimelineDates,
  parseTimelineDate,
  precisionFitsDate,
  TIMELINE_KINDS,
  TIMELINE_PRECISIONS,
} from "./timeline.ts";

export const ArticleIdSchema = z.string().regex(ARTICLE_ID_RE);
export const FactIdSchema = z.string().regex(FACT_ID_RE);
export const WordingIdSchema = z.string().regex(WORDING_ID_RE);
export const SourceIdSchema = z.enum(SOURCE_IDS);
export const SourceCardIdSchema = z.string().regex(SOURCE_CARD_ID_RE);
export const DomainSlugSchema = z.enum(DOMAIN_SLUGS);
export type DomainSlug = z.infer<typeof DomainSlugSchema>;
export const SubSlugSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);
/** `YYYY-MM-DD`. */
export const DayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── Tags, entities, retirement codes ─────────────────────────────────────

/** `facet:value` (`tags.ts`; the facets and their values are in `content/tags.json`). */
export const TagSchema = z.string().regex(TAG_RE);
/** Stored tags: unique. Derived ones (`derivedTags`) are never stored. */
export const TagsSchema = z
  .array(TagSchema)
  .refine((t) => new Set(t).size === t.length, { message: "duplicate tag" });

export const ENTITY_ROLES = ["subject", "answer", "mentioned"] as const;
/** A Wikidata item the article or fact is about, answers with, or mentions. */
export const EntityLinkSchema = z.object({
  qid: z.string().regex(QID_RE),
  /** The item's label when it was linked (English), for a reader without a lookup. */
  label: z.string().trim().min(1),
  role: z.enum(ENTITY_ROLES),
});
export type EntityLink = z.infer<typeof EntityLinkSchema>;

/** Why something left play, as a code to filter by; `reason` stays free text. */
export const RETIREMENT_CODES = [
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
] as const;
export const RetirementCodeSchema = z.enum(RETIREMENT_CODES);
export type RetirementCode = z.infer<typeof RetirementCodeSchema>;

// ── Timeline + source (per fact) ─────────────────────────────────────────

export const TimelineKindSchema = z.enum(TIMELINE_KINDS);
export const TimelinePrecisionSchema = z.enum(TIMELINE_PRECISIONS);
export const TimelineDateStringSchema = z.string().refine((s) => parseTimelineDate(s) !== null, {
  message: 'Expected "YYYY", "YYYY-MM" or "YYYY-MM-DD" (BC with a leading minus, no year 0)',
});

/**
 * The one dated thing a fact is about — a moment, or a span (lifespan,
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
    labelRu: z.string().trim().min(1).max(200).optional(),
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
export const SourceLinkSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().trim().min(1).max(300),
  /** ISO 639-1 of the page ("en", "de", "fr" …). */
  lang: z.string().regex(/^[a-z]{2}$/),
});
export type SourceLink = z.infer<typeof SourceLinkSchema>;

// ── Articles ─────────────────────────────────────────────────────────────

/** `[start, length]` of the answer inside a body, in UTF-16 code units. */
export const AnswerSpanSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().positive(),
]);
export type AnswerSpan = z.infer<typeof AnswerSpanSchema>;

/** Where a printed wording sits in its game: which card, which of the game's categories. */
export const PrintedRefSchema = z.object({
  source: SourceIdSchema,
  card: SourceCardIdSchema,
  /** The source's own category, 1-based (`sources.ts`). */
  category: z.number().int().min(1),
});
export type PrintedRef = z.infer<typeof PrintedRefSchema>;

const WordingFieldsSchema = z.object({
  id: WordingIdSchema,
  en: z.string().min(1),
  de: z.string().min(1),
  ru: z.string().min(1).optional(),
  origin: z.enum(["printed", "generated"]),
  printed: PrintedRefSchema.optional(),
  /** The card's own words when the printed question was reworked (a yes/no or choice question made open). */
  cardText: z.string().min(1).optional(),
});
const printedIffOrigin = {
  check: (w: { origin: string; printed?: unknown }) =>
    (w.origin === "printed") === (w.printed !== undefined),
  message: "a printed wording carries `printed`, a generated one doesn't",
};

export const WordingSchema = WordingFieldsSchema.refine(printedIffOrigin.check, {
  message: printedIffOrigin.message,
  path: ["printed"],
});
export type Wording = z.infer<typeof WordingSchema>;

/** Why and when a wording left play (a homebrew question a game now prints). */
export const WordingRetirementSchema = z.object({
  /** `YYYY-MM-DD`. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  code: RetirementCodeSchema.optional(),
  reason: z.string().min(1),
  /** The printed wordings that ask the question now. */
  replacedBy: z.array(WordingIdSchema).optional(),
});

/** A wording out of play: kept for the record and for restoring, never shown. */
export const RetiredWordingSchema = WordingFieldsSchema.extend({
  retired: WordingRetirementSchema,
}).refine(printedIffOrigin.check, { message: printedIffOrigin.message, path: ["printed"] });
export type RetiredWording = z.infer<typeof RetiredWordingSchema>;

export const FactSchema = z.object({
  id: FactIdSchema,
  answerEn: z.string().min(1),
  answerDe: z.string().min(1),
  answerRu: z.string().min(1).optional(),
  /** Where each answer is marked: the occurrence in the sentence that gives it away. */
  spans: z.object({ en: AnswerSpanSchema, de: AnswerSpanSchema, ru: AnswerSpanSchema.optional() }),
  timeline: TimelineEventSchema,
  source: SourceLinkSchema,
  /**
   * The wordings in play. Homebrew (`generated`) is only a stand-in: once any
   * game prints the question, its generated wordings retire.
   */
  wordings: z.array(WordingSchema).min(1),
  /** Wordings taken out of play — kept, never deleted (oldest first). */
  retiredWordings: z.array(RetiredWordingSchema).optional(),
  /** Stored tags of this question (`tags.ts`); derived ones are computed, never stored. */
  tags: TagsSchema.optional(),
  /** Wikidata items the question is about or answers with. */
  entities: z.array(EntityLinkSchema).optional(),
  /** A time-sensitive answer is re-checked by this date (`YYYY-MM-DD`; feeds the backlog). */
  reviewBy: DayKeySchema.optional(),
});
export type Fact = z.infer<typeof FactSchema>;

/** Every wording a fact holds, in play or retired. */
export function allWordings(f: {
  wordings: readonly Wording[];
  retiredWordings?: readonly RetiredWording[];
}): (Wording | RetiredWording)[] {
  return [...f.wordings, ...(f.retiredWordings ?? [])];
}

/** Why and when a fact left the active bank. */
export const RetirementSchema = z.object({
  /** `YYYY-MM-DD`. */
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  code: RetirementCodeSchema.optional(),
  reason: z.string().min(1),
  /** The active facts that cover it now, when it was a duplicate. */
  replacedBy: z.array(FactIdSchema).optional(),
});
export type Retirement = z.infer<typeof RetirementSchema>;

/**
 * A fact out of play: kept whole for the record and for restoring, never
 * studied or dealt. Its answer marks may no longer match the body.
 */
export const RetiredFactSchema = FactSchema.extend({
  spans: FactSchema.shape.spans.partial().optional(),
  retired: RetirementSchema,
});
export type RetiredFact = z.infer<typeof RetiredFactSchema>;

/** A picture that teaches something about the article (a portrait, the work, a diagram, a map). */
export const ArticleImageSchema = z.object({
  /** Hotlinked image file. */
  url: z.url({ protocol: /^https?$/ }),
  /** The page the image was found on. */
  pageUrl: z.url({ protocol: /^https?$/ }),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.object({ en: z.string().min(1), de: z.string().min(1), ru: z.string().min(1) }),
  caption: z.object({ en: z.string().min(1), de: z.string().min(1), ru: z.string().min(1) }),
  credit: z.string().optional(),
});
export type ArticleImage = z.infer<typeof ArticleImageSchema>;

/**
 * A whole article out of play: its file and history stay (and can be
 * restored), but it leaves the index, the timeline, the quotas and the trainer.
 */
export const ArticleRetirementSchema = z.object({
  /** `YYYY-MM-DD`. */
  at: DayKeySchema,
  code: RetirementCodeSchema,
  reason: z.string().min(1),
  /** The active articles that cover it now. */
  replacedBy: z.array(ArticleIdSchema).optional(),
});
export type ArticleRetirement = z.infer<typeof ArticleRetirementSchema>;

export const ArticleSchema = z.object({
  id: ArticleIdSchema,
  domain: DomainSlugSchema,
  sub: SubSlugSchema,
  titleEn: z.string().min(1),
  titleDe: z.string().min(1),
  titleRu: z.string().min(1).optional(),
  bodyEn: z.string().min(1),
  bodyDe: z.string().min(1),
  bodyRu: z.string().min(1).optional(),
  /**
   * Player-facing editor's notes (misprints, dated facts, accepted variants),
   * one per language; "" when none.
   */
  notesEn: z.string(),
  notesDe: z.string(),
  notesRu: z.string().optional(),
  images: z.array(ArticleImageSchema).default([]),
  facts: z.array(FactSchema).min(1).max(MAX_FACTS_PER_ARTICLE),
  /** Facts taken out of play — kept, never deleted (oldest first). */
  retired: z.array(RetiredFactSchema).optional(),
  /** Stored tags of the whole page (`tags.ts`). */
  tags: TagsSchema.optional(),
  /** Wikidata items the page is about or mentions. */
  entities: z.array(EntityLinkSchema).optional(),
  /** Set when the whole article left play (`retired` is its retired FACTS). */
  articleRetired: ArticleRetirementSchema.optional(),
});
export type Article = z.infer<typeof ArticleSchema>;

/** Still in play: not retired as a whole. */
export function isActiveArticle(a: Pick<Article, "articleRetired">): boolean {
  return a.articleRetired === undefined;
}

// ── Index + meta ─────────────────────────────────────────────────────────

export const IndexEntrySchema = z.object({
  id: ArticleIdSchema,
  domain: DomainSlugSchema,
  sub: SubSlugSchema,
  titleEn: z.string().min(1),
  titleDe: z.string().min(1),
  titleRu: z.string().min(1).optional(),
  factIds: z.array(FactIdSchema).min(1),
  /** Sources that print at least one of the article's wordings. */
  sources: z.array(SourceIdSchema),
  /** Stored tags of the article and its active facts ∪ the article's derived tags, sorted. */
  tags: z.array(TagSchema).optional(),
  /** Wikidata ids linked by the article or its active facts, sorted. */
  entities: z.array(z.string().regex(QID_RE)).optional(),
});
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export const ContentIndexSchema = z.object({
  articles: z.array(IndexEntrySchema),
});
export type ContentIndex = z.infer<typeof ContentIndexSchema>;

export const ContentMetaSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{12}$/),
  counts: z.object({
    articles: z.number().int().nonnegative(),
    facts: z.number().int().nonnegative(),
    wordings: z.number().int().nonnegative(),
    /** Retired facts kept in the articles' `retired` lists. */
    retired: z.number().int().nonnegative().optional(),
    /** Retired wordings kept in the facts' `retiredWordings` lists. */
    retiredWordings: z.number().int().nonnegative().optional(),
    /** Whole articles out of play (`articleRetired`); not in `articles`, `facts` or `wordings`. */
    retiredArticles: z.number().int().nonnegative().optional(),
    printed: z.partialRecord(SourceIdSchema, z.number().int().nonnegative()),
  }),
  /**
   * The Merkle root over every history file's head (`history.ts`
   * `historyRoot`) as of the last `quiz-ingest seal`; kept by later rebuilds.
   */
  historyRoot: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});
export type ContentMeta = z.infer<typeof ContentMetaSchema>;

// ── Printed cards ────────────────────────────────────────────────────────

export const SourceCardSchema = z.object({
  id: SourceCardIdSchema,
  /** The photo the card was transcribed from. */
  image: z.string().min(1),
  /** One wording per source category, `slots[i].category === i + 1`. */
  slots: z.array(z.object({ category: z.number().int().min(1), wordingId: WordingIdSchema })),
});
export type SourceCard = z.infer<typeof SourceCardSchema>;

export const SourceCardsSchema = z.object({
  source: SourceIdSchema,
  cards: z.array(SourceCardSchema),
});
export type SourceCards = z.infer<typeof SourceCardsSchema>;

// ── Timeline index (`content/timeline.json`) ─────────────────────────────

/**
 * Every fact's event in one file, so the timeline screen loads them as one
 * lazy chunk. Compact keys: d = domain, k = kind, s / e = start / end,
 * p = precision, a / o = approx / ongoing (only when true), en / de = labels.
 */
export const TimelineIndexEntrySchema = z.object({
  d: DomainSlugSchema,
  k: TimelineKindSchema,
  s: TimelineDateStringSchema,
  e: TimelineDateStringSchema.optional(),
  p: TimelinePrecisionSchema,
  a: z.literal(1).optional(),
  o: z.literal(1).optional(),
  en: z.string().min(1),
  de: z.string().min(1),
  ru: z.string().min(1).optional(),
});
export type TimelineIndexEntry = z.infer<typeof TimelineIndexEntrySchema>;

export const TimelineIndexSchema = z.record(FactIdSchema, TimelineIndexEntrySchema);
export type TimelineIndex = z.infer<typeof TimelineIndexSchema>;

export function toTimelineIndexEntry(
  domain: DomainSlug,
  ev: TimelineEventContent,
): TimelineIndexEntry {
  return {
    d: domain,
    k: ev.kind,
    s: ev.start,
    ...(ev.end !== null ? { e: ev.end } : {}),
    p: ev.precision,
    ...(ev.approx ? { a: 1 as const } : {}),
    ...(ev.ongoing ? { o: 1 as const } : {}),
    en: ev.labelEn,
    de: ev.labelDe,
    ...(ev.labelRu ? { ru: ev.labelRu } : {}),
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
    ...(entry.ru ? { labelRu: entry.ru } : {}),
  };
}
