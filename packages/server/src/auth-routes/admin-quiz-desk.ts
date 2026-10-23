// The admin quiz desk: the quiz bank's provenance, read-only, plus the links
// from a member report to what fixed it.
//
//   GET  /api/admin/quiz-desk/summary
//        → per-domain shape and research grades, backlog and retired counts
//   GET  /api/admin/quiz-desk/backlog?status&kind&target&limit&cursor
//        → backlog items (priority first) with their targets in words
//   GET  /api/admin/quiz-desk/retired?kind&code&domain&q&limit&cursor
//        → retired facts / wordings / articles, newest first
//   GET  /api/admin/quiz-desk/articles/:id/provenance
//        → every fact's grade, evidence, card photo + transcription, the
//          article's backlog, linked reports, history counts and runs
//          (retired articles included); 404 for an unknown article
//   POST /api/admin/quiz-desk/reports/:id/link   { backlogId?, historyRef? }
//        → set / clear (null) a report's links; 404 when there's no report
//
// Schemas: `@boardgames/core/protocol/http/quiz-desk`. Every /api/admin/*
// route is behind `requireAdmin` (server.ts); `adminApp` types the user.

import { ReportIdParamSchema } from "@boardgames/core/protocol";
import {
  QuizDeskArticleParamSchema,
  QuizDeskBacklogQuerySchema,
  QuizDeskBacklogResponseSchema,
  QuizDeskLinkReportBodySchema,
  QuizDeskLinkReportResponseSchema,
  QuizDeskProvenanceSchema,
  QuizDeskRetiredQuerySchema,
  QuizDeskRetiredResponseSchema,
  QuizDeskSummarySchema,
} from "@boardgames/core/protocol/http/quiz-desk";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { getArchiveStore } from "../lib/quiz/archive-store.ts";
import { getContentStore } from "../lib/quiz/content-store.ts";
import { deskBacklog, deskProvenance, deskRetired, deskSummary } from "../lib/quiz/desk.ts";
import { linkReport } from "../lib/quiz/reports.ts";

export const adminQuizDeskRoutes = adminApp();

adminQuizDeskRoutes.get("/quiz-desk/summary", async (c) =>
  c.json(QuizDeskSummarySchema.parse(await deskSummary(getContentStore()))),
);

adminQuizDeskRoutes.get("/quiz-desk/backlog", zQuery(QuizDeskBacklogQuerySchema), async (c) =>
  c.json(
    QuizDeskBacklogResponseSchema.parse(await deskBacklog(getContentStore(), c.req.valid("query"))),
  ),
);

adminQuizDeskRoutes.get("/quiz-desk/retired", zQuery(QuizDeskRetiredQuerySchema), (c) =>
  c.json(QuizDeskRetiredResponseSchema.parse(deskRetired(getContentStore(), c.req.valid("query")))),
);

adminQuizDeskRoutes.get("/quiz-desk/articles/:id/provenance", async (c) => {
  const parsed = QuizDeskArticleParamSchema.safeParse({ id: c.req.param("id") });
  if (!parsed.success) return errorResponse(c, 400, "bad article id", "BAD_REQUEST");
  const provenance = await deskProvenance(
    getContentStore(),
    getArchiveStore(),
    getDb(),
    parsed.data.id,
  );
  if (!provenance) return errorResponse(c, 404, "No article with that id", "NOT_FOUND");
  return c.json(QuizDeskProvenanceSchema.parse(provenance));
});

adminQuizDeskRoutes.post(
  "/quiz-desk/reports/:id/link",
  zJsonBody(QuizDeskLinkReportBodySchema),
  async (c) => {
    const parsed = ReportIdParamSchema.safeParse({ id: c.req.param("id") });
    if (!parsed.success) return errorResponse(c, 400, "bad report id", "BAD_REQUEST");
    const linked = await linkReport(getDb(), parsed.data.id, c.req.valid("json"));
    if (!linked) return errorResponse(c, 404, "No report with that id", "NOT_FOUND");
    return c.json(QuizDeskLinkReportResponseSchema.parse(linked));
  },
);
