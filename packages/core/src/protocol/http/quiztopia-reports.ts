// Wire schemas for Quiztopia content reports: a member flags a problem with
// a question or an article (`/api/quiztopia/reports*`), an admin reviews the
// queue and resolves it (`/api/admin/quiztopia-reports*`). Reports are
// private: a member sees only their own; admins see everyone's.
//
// The issue vocabulary lives here so the UI and the server validate against
// one list. User-facing copy (labels, hints) is the web's
// (`games/quiztopia/components/report/issues.ts`).

import { z } from "zod";
import {
  QuiztopiaCategorySchema,
  QuiztopiaQuestionIdSchema,
  QuiztopiaSetIdSchema,
} from "./quiztopia.ts";

// ── Vocabulary ──────────────────────────────────────────────────────────

export const REPORT_ISSUES = [
  "wrong-answer",
  "unclear-question",
  "typo",
  "translation",
  "wrong-date",
  "bad-source",
  "factual-error",
  "wrong-highlight",
  "other",
] as const;
export const ReportIssueSchema = z.enum(REPORT_ISSUES);
export type ReportIssue = z.infer<typeof ReportIssueSchema>;

export const ReportTargetKindSchema = z.enum(["question", "article"]);
export type ReportTargetKind = z.infer<typeof ReportTargetKindSchema>;

/** Which issues fit which target, in the order the form offers them. */
export const ISSUES_FOR: Record<ReportTargetKind, readonly ReportIssue[]> = {
  question: [
    "wrong-answer",
    "unclear-question",
    "typo",
    "translation",
    "wrong-date",
    "bad-source",
    "other",
  ],
  article: ["factual-error", "typo", "translation", "wrong-highlight", "other"],
};

/** Issues that can only be described by saying what's wrong. */
export const MESSAGE_REQUIRED: ReadonlySet<ReportIssue> = new Set(["other"]);

/** Issues that presuppose the answer — not offered before a card is revealed. */
export const SPOILS_ANSWER: ReadonlySet<ReportIssue> = new Set([
  "wrong-answer",
  "wrong-date",
  "bad-source",
]);

export const REPORT_MESSAGE_MAX = 1000;

export const ReportLanguageSchema = z.enum(["en", "de", "both"]);
export const ReportSurfaceSchema = z.enum(["trainer", "wiki", "journal", "timeline", "game"]);
export type ReportSurface = z.infer<typeof ReportSurfaceSchema>;
export const ReportStatusSchema = z.enum(["open", "fixed", "declined"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ReportTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("question"), id: QuiztopiaQuestionIdSchema }),
  z.object({ kind: z.literal("article"), id: QuiztopiaSetIdSchema }),
]);
export type ReportTarget = z.infer<typeof ReportTargetSchema>;

/**
 * The content as it stood when it was reported (built by the server from
 * the content store, never by the client) — and, on the admin side, as it
 * stands now, so a fix shows up as a difference.
 */
export const ReportSnapshotSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    en: z.string(),
    de: z.string(),
    answerEn: z.string(),
    answerDe: z.string(),
    timeline: z
      .object({
        start: z.string(),
        end: z.string().nullable(),
        labelEn: z.string(),
        labelDe: z.string(),
      })
      .nullable(),
    source: z.object({ url: z.string(), title: z.string() }).nullable(),
  }),
  z.object({ kind: z.literal("article"), titleEn: z.string(), titleDe: z.string() }),
]);
export type ReportSnapshot = z.infer<typeof ReportSnapshotSchema>;

const MessageSchema = z
  .string()
  .trim()
  .max(REPORT_MESSAGE_MAX)
  .transform((s) => (s === "" ? undefined : s))
  .optional();

// ── Member ──────────────────────────────────────────────────────────────

export const CreateReportBodySchema = z
  .object({
    target: ReportTargetSchema,
    issue: ReportIssueSchema,
    language: ReportLanguageSchema,
    message: MessageSchema,
    surface: ReportSurfaceSchema,
  })
  .superRefine((body, ctx) => {
    if (!ISSUES_FOR[body.target.kind].includes(body.issue)) {
      ctx.addIssue({
        code: "custom",
        path: ["issue"],
        message: `"${body.issue}" is not an issue a ${body.target.kind} can have`,
      });
    }
    if (MESSAGE_REQUIRED.has(body.issue) && !body.message) {
      ctx.addIssue({ code: "custom", path: ["message"], message: "Say what's wrong" });
    }
  });
export type CreateReportBody = z.input<typeof CreateReportBodySchema>;

export const MyReportSchema = z.object({
  id: z.number().int().positive(),
  target: ReportTargetSchema,
  setId: QuiztopiaSetIdSchema,
  category: QuiztopiaCategorySchema,
  issue: ReportIssueSchema,
  language: ReportLanguageSchema,
  message: z.string().nullable(),
  surface: ReportSurfaceSchema,
  status: ReportStatusSchema,
  resolutionNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  /** Resolved and not yet seen by the reporter. */
  unread: z.boolean(),
  snapshot: ReportSnapshotSchema,
});
export type MyReport = z.infer<typeof MyReportSchema>;

export const CreateReportResponseSchema = z.object({
  report: MyReportSchema,
  /** An open report of the same issue existed and was updated instead. */
  updated: z.boolean(),
});

export const MyReportsResponseSchema = z.object({
  reports: z.array(MyReportSchema),
  unread: z.number().int().nonnegative(),
});
export type MyReports = z.infer<typeof MyReportsResponseSchema>;

export const MarkReportsSeenBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

export const ReportIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

// ── Admin ───────────────────────────────────────────────────────────────

export const AdminReportsQuerySchema = z.object({
  status: z.enum(["open", "fixed", "declined", "all"]).default("open"),
});

export const AdminReportSchema = z.object({
  id: z.number().int().positive(),
  reporterId: z.string(),
  reporterName: z.string(),
  issue: ReportIssueSchema,
  language: ReportLanguageSchema,
  message: z.string().nullable(),
  surface: ReportSurfaceSchema,
  status: ReportStatusSchema,
  resolutionNote: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  createdAt: z.string(),
  contentVersion: z.string(),
  snapshot: ReportSnapshotSchema,
});
export type AdminReport = z.infer<typeof AdminReportSchema>;

export const AdminReportGroupSchema = z.object({
  target: ReportTargetSchema,
  setId: QuiztopiaSetIdSchema,
  category: QuiztopiaCategorySchema,
  /** The content now; null when the content no longer has it. */
  current: ReportSnapshotSchema.nullable(),
  /** Some report saw different content than there is now — likely already fixed. */
  changedSinceReport: z.boolean(),
  /** The photographed card the transcription came from (for fixing the source). */
  sourceImage: z.string().nullable(),
  reports: z.array(AdminReportSchema).min(1),
});
export type AdminReportGroup = z.infer<typeof AdminReportGroupSchema>;

export const AdminReportsResponseSchema = z.object({
  groups: z.array(AdminReportGroupSchema),
  counts: z.object({
    open: z.number().int().nonnegative(),
    fixed: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
  }),
});
export type AdminReports = z.infer<typeof AdminReportsResponseSchema>;

export const ResolveReportsBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(["fixed", "declined"]),
  note: MessageSchema,
});
export type ResolveReportsBody = z.input<typeof ResolveReportsBodySchema>;

export const ResolveReportsResponseSchema = z.object({
  /** Reports this request resolved (others were already resolved). */
  resolved: z.number().int().nonnegative(),
});
export const ReopenReportResponseSchema = z.object({ ok: z.literal(true) });
