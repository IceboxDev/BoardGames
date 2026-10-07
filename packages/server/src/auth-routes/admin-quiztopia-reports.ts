// Admin review of Quiztopia content reports.
//
//   GET  /api/admin/quiztopia-reports?status=open|fixed|declined|all
//        → reports grouped per question / article, with the content as it is
//          now beside what each reporter saw, and the per-status counts
//   POST /api/admin/quiztopia-reports/resolve      { ids, status, note? }
//        → 200 with how many THIS request resolved; 409 when every one of
//          them had already been resolved (another admin got there first)
//   POST /api/admin/quiztopia-reports/:id/reopen
//        → back into the queue; 409 when the reporter has since filed the
//          same issue again (that one is open), 404 when it isn't resolved
//
// Content is never edited here: a fix is a change to the transcription or
// the committed JSON (the queue's "fix brief" says exactly where).

import {
  AdminReportsQuerySchema,
  AdminReportsResponseSchema,
  ReopenReportResponseSchema,
  ReportIdParamSchema,
  ResolveReportsBodySchema,
  ResolveReportsResponseSchema,
} from "@boardgames/core/protocol";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { getContentStore } from "../lib/quiztopia/content-store.ts";
import { adminReports, reopenReport, resolveReports } from "../lib/quiztopia/reports.ts";

export const adminQuiztopiaReportRoutes = adminApp();

adminQuiztopiaReportRoutes.get("/quiztopia-reports", zQuery(AdminReportsQuerySchema), async (c) => {
  const { status } = c.req.valid("query");
  return c.json(
    AdminReportsResponseSchema.parse(await adminReports(getDb(), getContentStore(), status)),
  );
});

adminQuiztopiaReportRoutes.post(
  "/quiztopia-reports/resolve",
  zJsonBody(ResolveReportsBodySchema),
  async (c) => {
    const admin = c.get("user");
    const { ids, status, note } = c.req.valid("json");
    const resolved = await resolveReports(getDb(), ids, status, note, admin.id);
    if (resolved === 0) {
      return errorResponse(c, 409, "These reports were already resolved", "CONFLICT");
    }
    return c.json(ResolveReportsResponseSchema.parse({ resolved }));
  },
);

adminQuiztopiaReportRoutes.post("/quiztopia-reports/:id/reopen", async (c) => {
  const parsed = ReportIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!parsed.success) return errorResponse(c, 400, "bad report id", "BAD_REQUEST");
  const result = await reopenReport(getDb(), parsed.data.id);
  if (result === "not-found") {
    return errorResponse(c, 404, "No resolved report with that id", "NOT_FOUND");
  }
  if (result === "duplicate-open") {
    return errorResponse(
      c,
      409,
      "The reporter has an open report of the same issue already",
      "CONFLICT",
    );
  }
  return c.json(ReopenReportResponseSchema.parse({ ok: true }));
});
