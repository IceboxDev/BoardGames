// Wire schemas for the admin "Quiz desk": `/api/admin/quiz-desk/*`. The desk
// reads the quiz bank's provenance — research grades from the evidence
// ledger, the backlog, the retired database and, per article, every fact's
// evidence, printed card photo and transcription — plus the links from a
// member report to the backlog item / history entry that fixed it.
//
// Everything here is read-only over the committed content except the report
// links (a database column). The content shapes (backlog item, assessment,
// evidence source, retirement, printed ref, tags, entities) are the bank's
// own schemas, reused, never redeclared.
//
// Pagination is an opaque `cursor` (the next offset as a string) plus `limit`;
// a response's `nextCursor` is null on the last page.

import { z } from "zod";
import {
  BACKLOG_KINDS,
  BACKLOG_STATUSES,
  BacklogItemSchema,
  HISTORY_REF_RE,
} from "../../quiz/backlog-types.ts";
import {
  ArticleRetirementSchema,
  EntityLinkSchema,
  PrintedRefSchema,
  RETIREMENT_CODES,
  RetirementCodeSchema,
  RetirementSchema,
  SourceLinkSchema,
  TagSchema,
} from "../../quiz/content-types.ts";
import {
  AssessmentSchema,
  EvidenceSourceIdSchema,
  EvidenceSourceSchema,
} from "../../quiz/evidence-types.ts";
import { GRADES } from "../../quiz/grade.ts";
import { ConfidenceSchema, HISTORY_KINDS, RunIdSchema } from "../../quiz/history-schema.ts";
import { BACKLOG_ID_RE } from "../../quiz/ids.ts";
import {
  ReportIssueSchema,
  ReportStatusSchema,
  ReportTargetSchema,
  ResolveReportsBodySchema,
} from "./quiz-reports.ts";
import { QuizArticleIdSchema, QuizDomainSchema, QuizSourceSchema } from "./trainer-quiz.ts";

// ── Shared pieces ───────────────────────────────────────────────────────

const Count = z.number().int().nonnegative();

/** An English + German text pair (the desk shows both). */
export const QuizDeskTextSchema = z.object({ en: z.string(), de: z.string() });
export type QuizDeskText = z.infer<typeof QuizDeskTextSchema>;

export const QuizGradeSchema = z.enum(GRADES);
export type QuizGrade = z.infer<typeof QuizGradeSchema>;

/** `grade.ts:factGrade`'s result: the grade and the counts behind it. */
export const QuizFactGradeSchema = z.object({
  grade: QuizGradeSchema,
  independentSources: Count,
  verbatim: Count,
  primary: Count,
  contested: z.boolean(),
  latestConfidence: ConfidenceSchema.nullable(),
});
export type QuizFactGrade = z.infer<typeof QuizFactGradeSchema>;

/** Counts per grade, every grade present. */
export const QuizGradeCountsSchema = z.record(QuizGradeSchema, Count);
export type QuizGradeCounts = z.infer<typeof QuizGradeCountsSchema>;

export const BacklogIdSchema = z.string().regex(BACKLOG_ID_RE, "Expected a backlog id like b00001");
/** A history entry ref: `a0042#17` or `cards/quiztopia#3`. */
export const HistoryRefSchema = z
  .string()
  .regex(HISTORY_REF_RE, "Expected a history ref like a0042#17");

const CursorSchema = z.string().regex(/^\d{1,9}$/, "Expected a cursor from a previous page");
const LimitSchema = z.coerce.number().int().min(1).max(200).default(50);

/** A retirement code, or `none` for an item retired before codes existed. */
export const RETIRED_CODE_FILTERS = [...RETIREMENT_CODES, "none"] as const;
export const RetiredCodeFilterSchema = z.enum(RETIRED_CODE_FILTERS);
export type RetiredCodeFilter = z.infer<typeof RetiredCodeFilterSchema>;
/** Counts per retirement code (`none` = no code), every code present. */
export const RetiredCodeCountsSchema = z.record(RetiredCodeFilterSchema, Count);

// ── GET /summary ────────────────────────────────────────────────────────

export const QuizDeskDomainShapeSchema = z.object({
  /** Active articles in the domain. */
  articles: Count,
  /** Active facts in its active articles. */
  facts: Count,
  /** `byFactCount[n]` = active articles with exactly n active facts (0…8). */
  byFactCount: z.array(Count),
});

export const QuizDeskSummarySchema = z.object({
  contentVersion: z.string(),
  /** Per domain (`build.ts:domainShape`). */
  shape: z.record(QuizDomainSchema, QuizDeskDomainShapeSchema),
  /** Per domain, the research grades of its active facts (no ledger = E). */
  grades: z.record(QuizDomainSchema, QuizGradeCountsSchema),
  /** Every active fact. */
  gradeTotals: QuizGradeCountsSchema,
  /** Articles (active or retired) with an evidence ledger file. */
  evidenceArticles: Count,
  backlog: z.object({
    total: Count,
    byStatus: z.record(z.enum(BACKLOG_STATUSES), Count),
    byKind: z.record(z.enum(BACKLOG_KINDS), Count),
  }),
  retired: z.object({
    facts: RetiredCodeCountsSchema,
    wordings: RetiredCodeCountsSchema,
    articles: RetiredCodeCountsSchema,
  }),
});
export type QuizDeskSummary = z.infer<typeof QuizDeskSummarySchema>;

// ── Target labels (backlog items, provenance) ───────────────────────────

export const QUIZ_DESK_TARGET_KINDS = [
  "article",
  "body",
  "fact",
  "wording",
  "card",
  "domain",
  "report",
  "unknown",
] as const;

/** What a backlog target is, in words, and where it lives (to open its provenance). */
export const QuizDeskTargetLabelSchema = z.object({
  kind: z.enum(QUIZ_DESK_TARGET_KINDS),
  /** The article title, the question, "Quiztopia c042", the domain, "Report #12". */
  label: z.string(),
  /** The article to open; null for a domain, a report or an unknown target. */
  articleId: QuizArticleIdSchema.nullable(),
  domain: QuizDomainSchema.nullable(),
  /** The target (or its article) is out of play. */
  retired: z.boolean(),
});
export type QuizDeskTargetLabel = z.infer<typeof QuizDeskTargetLabelSchema>;

// ── GET /backlog ────────────────────────────────────────────────────────

export const QuizDeskBacklogQuerySchema = z.object({
  status: z.enum(BACKLOG_STATUSES).optional(),
  kind: z.enum(BACKLOG_KINDS).optional(),
  /**
   * Exact target; an article id also matches everything inside it (its body,
   * facts, wordings and the cards that print them).
   */
  target: z.string().min(1).max(64).optional(),
  limit: LimitSchema,
  cursor: CursorSchema.optional(),
});
export type QuizDeskBacklogQuery = z.input<typeof QuizDeskBacklogQuerySchema>;

export const QuizDeskBacklogResponseSchema = z.object({
  /** Priority first (1 = most urgent), then newest, then id. */
  items: z.array(BacklogItemSchema),
  /** Every target on this page → its label. */
  targets: z.record(z.string(), QuizDeskTargetLabelSchema),
  /** Items matching the filter, across pages. */
  total: Count,
  nextCursor: CursorSchema.nullable(),
});
export type QuizDeskBacklogResponse = z.infer<typeof QuizDeskBacklogResponseSchema>;

// ── GET /retired ────────────────────────────────────────────────────────

export const QUIZ_DESK_RETIRED_KINDS = ["fact", "wording", "article"] as const;
export const QuizDeskRetiredKindSchema = z.enum(QUIZ_DESK_RETIRED_KINDS);

export const QuizDeskRetiredQuerySchema = z.object({
  /** Omitted: every kind. */
  kind: QuizDeskRetiredKindSchema.optional(),
  code: RetiredCodeFilterSchema.optional(),
  domain: QuizDomainSchema.optional(),
  /** Case-insensitive substring of the id, question, answer, title or reason. */
  q: z.string().trim().max(200).optional(),
  limit: LimitSchema,
  cursor: CursorSchema.optional(),
});
export type QuizDeskRetiredQuery = z.input<typeof QuizDeskRetiredQuerySchema>;

export const QuizDeskRetiredRowSchema = z.object({
  kind: QuizDeskRetiredKindSchema,
  /** The fact, wording or article id. */
  id: z.string(),
  articleId: QuizArticleIdSchema,
  articleTitle: QuizDeskTextSchema,
  domain: QuizDomainSchema,
  /** The question (a fact's lead wording, the wording itself); null for an article. */
  question: QuizDeskTextSchema.nullable(),
  /** The fact's answer; null for an article. */
  answer: QuizDeskTextSchema.nullable(),
  /** `YYYY-MM-DD`. */
  at: z.string(),
  /** Absent on items retired before codes existed. */
  code: RetirementCodeSchema.optional(),
  reason: z.string(),
  /** Facts, wordings or articles that cover it now. */
  replacedBy: z.array(z.string()).optional(),
  /** The card that prints it (a printed wording, a fact's first printed wording). */
  printed: PrintedRefSchema.optional(),
  /** The row sits inside an article that is itself retired. */
  inRetiredArticle: z.boolean(),
});
export type QuizDeskRetiredRow = z.infer<typeof QuizDeskRetiredRowSchema>;

export const QuizDeskRetiredResponseSchema = z.object({
  /** Newest retirement first, then id. */
  rows: z.array(QuizDeskRetiredRowSchema),
  total: Count,
  nextCursor: CursorSchema.nullable(),
});
export type QuizDeskRetiredResponse = z.infer<typeof QuizDeskRetiredResponseSchema>;

// ── GET /articles/:id/provenance ────────────────────────────────────────

export const QuizDeskArticleParamSchema = z.object({ id: QuizArticleIdSchema });

/** The photo's manifest entry (`packages/quiz-archive/manifest/<source>.json`). */
export const QuizDeskPhotoManifestSchema = z.object({
  file: z.string(),
  originalName: z.string(),
  /** Clockwise degrees that turn the photo upright. */
  rotate: z.number().int(),
  takenAt: z.string().nullable(),
  sha256Stored: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** Public URLs of re-photographed copies of the same card. */
  duplicates: z.array(z.string()),
});
export type QuizDeskPhotoManifest = z.infer<typeof QuizDeskPhotoManifestSchema>;

/**
 * The transcription of the card slot (`quiz-archive/transcripts/<source>/<card>.json`),
 * normalised across games: `cardDe` is the German card's own words (Quiztopia,
 * Trivial Pursuit), `cardText` the English card's (Publish or Perish).
 */
export const QuizDeskTranscriptSchema = z.object({
  category: z.number().int().min(1),
  cardDe: z.string().nullable(),
  cardText: z.string().nullable(),
  /** The question as transcribed (made open when `reworked`). */
  question: QuizDeskTextSchema,
  answer: QuizDeskTextSchema,
  /** The transcriber's notes. */
  notes: z.string().nullable(),
  reworked: z.boolean().nullable(),
  /** The card's own field (Publish or Perish). */
  discipline: z.string().nullable(),
  /** The source cited at transcription time. */
  source: SourceLinkSchema.nullable(),
});
export type QuizDeskTranscript = z.infer<typeof QuizDeskTranscriptSchema>;

export const QuizDeskPrintedOnSchema = z.object({
  source: QuizSourceSchema,
  card: z.string(),
  /** The game's own category, 1-based. */
  category: z.number().int().min(1),
  wordingId: z.string(),
  /** The wording is out of play (a printed wording later retired). */
  retiredWording: z.boolean(),
  /** The card photo (GitHub LFS media URL; opened on demand). */
  photoUrl: z.url(),
  /** Null when the archive isn't deployed (production) or has no entry. */
  manifest: QuizDeskPhotoManifestSchema.nullable(),
  /** Null when the archive isn't deployed or has no transcript of the slot. */
  transcript: QuizDeskTranscriptSchema.nullable(),
});
export type QuizDeskPrintedOn = z.infer<typeof QuizDeskPrintedOnSchema>;

export const QuizDeskEvidenceSourceSchema = EvidenceSourceSchema.extend({
  id: EvidenceSourceIdSchema,
});
export type QuizDeskEvidenceSource = z.infer<typeof QuizDeskEvidenceSourceSchema>;

export const QuizDeskFactSchema = z.object({
  id: z.string(),
  /** The lead (first) wording. */
  question: QuizDeskTextSchema,
  answer: QuizDeskTextSchema,
  /** Null for an active fact. */
  retired: RetirementSchema.nullable(),
  /** The source the bank cites for the answer. */
  cited: SourceLinkSchema,
  tags: z.array(TagSchema),
  derivedTags: z.array(TagSchema),
  entities: z.array(EntityLinkSchema),
  reviewBy: z.string().nullable(),
  grade: QuizFactGradeSchema,
  /** The ledger sources the fact's assessments quote. */
  sources: z.array(QuizDeskEvidenceSourceSchema),
  /** The latest assessment per quoted source (and the latest overall), oldest first. */
  assessments: z.array(AssessmentSchema),
  /** Every assessment of the fact, superseded ones included. */
  assessmentCount: Count,
  printedOn: z.array(QuizDeskPrintedOnSchema),
});
export type QuizDeskFact = z.infer<typeof QuizDeskFactSchema>;

/** A member report about the article or one of its facts, with what fixed it. */
export const QuizDeskLinkedReportSchema = z.object({
  id: z.number().int().positive(),
  target: ReportTargetSchema,
  issue: ReportIssueSchema,
  status: ReportStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  backlogId: BacklogIdSchema.nullable(),
  historyRef: HistoryRefSchema.nullable(),
});
export type QuizDeskLinkedReport = z.infer<typeof QuizDeskLinkedReportSchema>;

export const QuizDeskRunSchema = z.object({
  id: RunIdSchema,
  /** `runs/<id>/run.json`'s title; null when the archive isn't deployed. */
  title: z.string().nullable(),
});

export const QuizDeskProvenanceSchema = z.object({
  contentVersion: z.string(),
  article: z.object({
    id: QuizArticleIdSchema,
    domain: QuizDomainSchema,
    sub: z.string(),
    title: QuizDeskTextSchema,
    notes: QuizDeskTextSchema,
    tags: z.array(TagSchema),
    derivedTags: z.array(TagSchema),
    /** Every stored + derived tag → its label. */
    tagLabels: z.record(z.string(), QuizDeskTextSchema),
    entities: z.array(EntityLinkSchema),
    /** Null while the article is in play. */
    retired: ArticleRetirementSchema.nullable(),
    /** The article has an evidence ledger file. */
    hasEvidence: z.boolean(),
  }),
  /** Active facts first (in article order), then retired ones. */
  facts: z.array(QuizDeskFactSchema),
  /** Backlog items about the article, its body, facts, wordings or their cards. */
  backlog: z.array(BacklogItemSchema),
  targets: z.record(z.string(), QuizDeskTargetLabelSchema),
  reports: z.array(QuizDeskLinkedReportSchema),
  history: z.object({
    total: Count,
    byKind: z.partialRecord(z.enum(HISTORY_KINDS), Count),
    /** `YYYY-MM-DD` of the newest entry; null without history. */
    lastAt: z.string().nullable(),
  }),
  /** Runs named by the history, the ledger or the backlog items, sorted. */
  runs: z.array(QuizDeskRunSchema),
});
export type QuizDeskProvenance = z.infer<typeof QuizDeskProvenanceSchema>;

// ── Report links ────────────────────────────────────────────────────────

/**
 * `POST /api/admin/quiz-reports/resolve`'s body with the optional links: the
 * backlog item and/or the history entry that fixed the reports. Accepted by
 * that route in place of `ResolveReportsBodySchema` (a superset).
 */
export const QuizDeskResolveReportsBodySchema = ResolveReportsBodySchema.extend({
  backlogId: BacklogIdSchema.optional(),
  historyRef: HistoryRefSchema.optional(),
});
export type QuizDeskResolveReportsBody = z.input<typeof QuizDeskResolveReportsBodySchema>;

/**
 * `POST /api/admin/quiz-desk/reports/:id/link`: set or clear (null) a
 * report's links, whatever its status; an omitted field is left as it is.
 */
export const QuizDeskLinkReportBodySchema = z
  .object({
    backlogId: BacklogIdSchema.nullable().optional(),
    historyRef: HistoryRefSchema.nullable().optional(),
  })
  .refine((b) => b.backlogId !== undefined || b.historyRef !== undefined, {
    message: "Give backlogId or historyRef",
  });
export type QuizDeskLinkReportBody = z.input<typeof QuizDeskLinkReportBodySchema>;

export const QuizDeskLinkReportResponseSchema = z.object({
  id: z.number().int().positive(),
  backlogId: BacklogIdSchema.nullable(),
  historyRef: HistoryRefSchema.nullable(),
});
export type QuizDeskLinkReportResponse = z.infer<typeof QuizDeskLinkReportResponseSchema>;
