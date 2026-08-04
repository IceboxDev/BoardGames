import { ActivityLogQuerySchema, ActivityLogResponseSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRows } from "../lib/db-rows.ts";
import { zQuery } from "../lib/error-response.ts";

export const adminActivityRoutes = adminApp();

const ActivityRowSchema = z.object({
  id: z.number(),
  type: z.string(),
  meta_json: z.string(),
  created_at: z.string(),
});

// ── GET /api/admin/users/:id/activity ─────────────────────────────────
//
// Keyset-paged (id DESC) trail for one member, straight off the
// (user_id, id DESC) index. `limit + 1` over-fetch decides whether a next
// page exists without a COUNT.

adminActivityRoutes.get("/:id/activity", zQuery(ActivityLogQuerySchema), async (c) => {
  const userId = c.req.param("id");
  const { before, limit } = c.req.valid("query");

  const { rows } = await getDb().execute({
    sql: `SELECT id, type, meta_json, created_at FROM activity_log
          WHERE user_id = ? ${before !== undefined ? "AND id < ?" : ""}
          ORDER BY id DESC LIMIT ?`,
    args: before !== undefined ? [userId, before, limit + 1] : [userId, limit + 1],
  });

  const parsed = parseRows(ActivityRowSchema, rows, "activity_log");
  const page = parsed.slice(0, limit);
  const entries = page.map((r) => {
    // A malformed meta cell degrades that one entry, not the whole page.
    let meta: Record<string, unknown> = {};
    try {
      const raw: unknown = JSON.parse(r.meta_json);
      if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        meta = raw as Record<string, unknown>;
      }
    } catch {
      // fall through with empty meta
    }
    return { id: r.id, type: r.type, meta, createdAt: r.created_at };
  });

  const nextBefore = parsed.length > limit ? (page[page.length - 1]?.id ?? null) : null;
  return c.json(ActivityLogResponseSchema.parse({ entries, nextBefore }));
});
