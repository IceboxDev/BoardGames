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
//
// Resolution is a CLAIM, not a read-then-write. Every statement in the batch
// is guarded on the announcement still being pending, and the close is the
// last statement: its `rowsAffected` says whether THIS request resolved the
// row. Two admins clicking at once therefore produce one custom box and one
// 409, never two boxes. The inventory rewrite is additionally a
// compare-and-set on the JSON it read, so an overlapping inventory change is
// detected and retried instead of silently overwritten.

import { randomUUID } from "node:crypto";
import {
  AdminAnnouncementsResponseSchema,
  ResolveAnnouncementBodySchema,
  ResolveAnnouncementResponseSchema,
} from "@boardgames/core/protocol";
import type { InStatement, InValue } from "@libsql/client";
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
  inventorySlugsJson,
  inventoryWriteStatement,
  rowToAnnouncement,
} from "./collection.ts";

/** Attempts before giving up on an inventory row that keeps changing underneath. */
const APPROVE_ATTEMPTS = 3;

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

    const alreadyResolved = () =>
      errorResponse(c, 409, "announcement is already resolved", "ALREADY_RESOLVED");

    /** The claim. Only a still-pending row can be closed, and only once. */
    const closeStatement = (
      status: "approved" | "dismissed",
      resolutionSlug: string | null,
      extraGuard: { readonly sql: string; readonly args: readonly InValue[] } = {
        sql: "1",
        args: [],
      },
    ) =>
      ({
        sql: `UPDATE ownership_announcements
                 SET status = ?, resolution_slug = ?, resolved_by = ?, resolved_at = datetime('now')
               WHERE id = ? AND status = 'pending' AND (${extraGuard.sql})`,
        args: [status, resolutionSlug, admin.id, id, ...extraGuard.args],
      }) satisfies InStatement;

    /** Runs the batch; true when the close (last statement) claimed the row. */
    const claim = async (statements: InStatement[]): Promise<boolean> => {
      const results = await db.batch(statements, "write");
      return (results.at(-1)?.rowsAffected ?? 0) > 0;
    };

    if (body.action === "approve") {
      for (let attempt = 1; ; attempt++) {
        const owned = await fetchInventorySlugs(db, announcement.user_id);
        const before = inventorySlugsJson(owned);
        const after = inventorySlugsJson(withSlugAdded(owned, body.slug));
        // The inventory CAS lands first; the close then requires the inventory
        // to hold the rewritten list, so the two cannot diverge: a lost
        // inventory race leaves the announcement pending for the retry.
        const claimed = await claim([
          inventoryWriteStatement(announcement.user_id, withSlugAdded(owned, body.slug), {
            expect: before,
          }),
          closeStatement("approved", body.slug, {
            sql: "EXISTS (SELECT 1 FROM user_inventory WHERE user_id = ? AND game_slugs_json = ?)",
            args: [announcement.user_id, after],
          }),
        ]);
        if (claimed) break;
        // Either someone else resolved it, or the inventory moved underneath.
        const { rows: fresh } = await db.execute({
          sql: "SELECT status FROM ownership_announcements WHERE id = ?",
          args: [id],
        });
        if (fresh[0]?.status !== "pending") return alreadyResolved();
        if (attempt >= APPROVE_ATTEMPTS) {
          return errorResponse(
            c,
            409,
            "inventory changed while approving — try again",
            "INVENTORY_CONFLICT",
          );
        }
      }
      logActivity(announcement.user_id, "ownership-resolved", {
        action: "approve",
        slug: body.slug,
      });
    } else if (body.action === "approve-custom") {
      if (announcement.free_text_name === null) {
        return errorResponse(c, 400, "only a free-text announcement can be custom", "BAD_ACTION");
      }
      // The box is copied FROM the pending row, so it exists exactly when the
      // close below succeeds — never for a second resolver.
      const claimed = await claim([
        {
          sql: `INSERT INTO collection_items (id, user_id, custom_title)
                SELECT ?, user_id, free_text_name FROM ownership_announcements
                 WHERE id = ? AND status = 'pending'`,
          args: [randomUUID(), id],
        },
        closeStatement("approved", null),
      ]);
      if (!claimed) return alreadyResolved();
      logActivity(announcement.user_id, "ownership-resolved", { action: "approve-custom" });
    } else {
      const result = await db.execute(closeStatement("dismissed", null));
      if (result.rowsAffected === 0) return alreadyResolved();
      logActivity(announcement.user_id, "ownership-resolved", { action: "dismiss" });
    }

    return c.json(ResolveAnnouncementResponseSchema.parse({ ok: true }));
  },
);
