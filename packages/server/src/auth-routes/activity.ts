import { OkResponseSchema, PageViewBodySchema } from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { logActivity } from "../lib/activity-log.ts";
import { zJsonBody } from "../lib/error-response.ts";

export const activityRoutes = authedApp();

// ── POST /api/activity/view ───────────────────────────────────────────
//
// Page-view beacon from the web client (see web/src/lib/page-views.ts).
// The client owns the `page` vocabulary and the per-session dedupe; this
// endpoint just stamps the row. Always 200 — a view beacon has no failure
// mode the client could act on.

activityRoutes.post("/view", zJsonBody(PageViewBodySchema), async (c) => {
  const user = c.get("user");
  const { page, detail } = c.req.valid("json");
  logActivity(user.id, "page-view", { page, ...(detail ? { detail } : {}) });
  return c.json(OkResponseSchema.parse({ ok: true }));
});
