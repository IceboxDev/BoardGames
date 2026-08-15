// Admin resolution of ownership announcements.
//
//   GET  /api/admin/announcements             → pending queue (userName joined)
//   POST /api/admin/announcements/:id/resolve → approve / approve-custom / dismiss
//
// `approve` appends the (possibly re-mapped) slug to the announcer's
// `user_inventory` in the same batch that closes the announcement, so the
// queue and the inventory can't drift apart. `approve-custom` turns a
// free-text announcement into a `collection_items` row with `slug` NULL —
// visible in the announcer's Games Manager, invisible to catalog machinery.

import { randomUUID } from "node:crypto";
import {
  AdminAnnouncementsResponseSchema,
  ResolveAnnouncementBodySchema,
  ResolveAnnouncementResponseSchema,
} from "@boardgames/core/protocol";
import type { InStatement } from "@libsql/client";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { parseRow, parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { withSlugAdded } from "../lib/inventory-slugs.ts";
import {
  AnnouncementRowSchema,
  fetchInventorySlugs,
  inventoryWriteStatement,
  rowToAnnouncement,
} from "./collection.ts";

export const adminAnnouncementRoutes = adminApp();

const AnnouncementWithNameRowSchema = AnnouncementRowSchema.extend({
  user_name: z.string(),
});

adminAnnouncementRoutes.get("/announcements", async (c) => {
  const { rows } = await getDb().execute(
    `SELECT a.id, a.user_id, a.slug, a.free_text_name, a.note, a.status, a.resolution_slug,
            a.resolved_by, a.resolved_at, a.created_at, u.name AS user_name
       FROM ownership_announcements a
       JOIN "user" u ON u.id = a.user_id
      WHERE a.status = 'pending'
      ORDER BY a.created_at ASC`,
  );
  const announcements = parseRows(
    AnnouncementWithNameRowSchema,
    rows,
    "ownership_announcements",
  ).map((r) => rowToAnnouncement(r, r.user_name));
  return c.json(AdminAnnouncementsResponseSchema.parse({ announcements }));
});

adminAnnouncementRoutes.post(
  "/announcements/:id/resolve",
  zJsonBody(ResolveAnnouncementBodySchema),
  async (c) => {
    const admin = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const db = getDb();

    const { rows } = await db.execute({
      sql: `SELECT id, user_id, slug, free_text_name, note, status, resolution_slug,
                   resolved_by, resolved_at, created_at
              FROM ownership_announcements WHERE id = ? LIMIT 1`,
      args: [id],
    });
    if (rows.length === 0) return errorResponse(c, 404, "announcement not found", "NOT_FOUND");
    const announcement = parseRow(AnnouncementRowSchema, rows[0], "ownership_announcements");
    if (announcement.status !== "pending") {
      return errorResponse(c, 409, "announcement is already resolved", "ALREADY_RESOLVED");
    }

    const closeStatement = (status: "approved" | "dismissed", resolutionSlug: string | null) =>
      ({
        sql: `UPDATE ownership_announcements
                 SET status = ?, resolution_slug = ?, resolved_by = ?, resolved_at = datetime('now')
               WHERE id = ?`,
        args: [status, resolutionSlug, admin.id, id],
      }) satisfies InStatement;

    if (body.action === "approve") {
      const owned = await fetchInventorySlugs(db, announcement.user_id);
      await db.batch(
        [
          closeStatement("approved", body.slug),
          inventoryWriteStatement(announcement.user_id, withSlugAdded(owned, body.slug)),
        ],
        "write",
      );
      logActivity(announcement.user_id, "ownership-resolved", {
        action: "approve",
        slug: body.slug,
      });
    } else if (body.action === "approve-custom") {
      if (announcement.free_text_name === null) {
        return errorResponse(c, 400, "only a free-text announcement can be custom", "BAD_ACTION");
      }
      await db.batch(
        [
          closeStatement("approved", null),
          {
            sql: "INSERT INTO collection_items (id, user_id, custom_title) VALUES (?, ?, ?)",
            args: [randomUUID(), announcement.user_id, announcement.free_text_name],
          },
        ],
        "write",
      );
      logActivity(announcement.user_id, "ownership-resolved", { action: "approve-custom" });
    } else {
      await db.execute(closeStatement("dismissed", null));
      logActivity(announcement.user_id, "ownership-resolved", { action: "dismiss" });
    }

    return c.json(ResolveAnnouncementResponseSchema.parse({ ok: true }));
  },
);
