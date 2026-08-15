// "Announce new ownership" — the only self-service way to ADD an owned game.
//
//   POST   /api/announcements     → create a pending announcement (own)
//   DELETE /api/announcements/:id → retract an own, still-pending announcement
//
// An announcement names an ownable slug (catalog / EXIT box / deck) or a
// free-text game the site doesn't know yet; admins resolve it in
// `admin-announcements.ts`, which is what actually stamps the inventory.

import { randomUUID } from "node:crypto";
import {
  CollectionOkResponseSchema,
  CreateAnnouncementBodySchema,
  CreateAnnouncementResponseSchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { parseRow } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { AnnouncementRowSchema, fetchInventorySlugs, rowToAnnouncement } from "./collection.ts";

export const announcementRoutes = authedApp();

announcementRoutes.post("/", zJsonBody(CreateAnnouncementBodySchema), async (c) => {
  const user = c.get("user");
  const { slug, freeTextName, note } = c.req.valid("json");
  const db = getDb();

  if (slug !== undefined) {
    const owned = await fetchInventorySlugs(db, user.id);
    if (owned.includes(slug)) {
      return errorResponse(c, 409, "you already own this game", "ALREADY_OWNED");
    }
  }
  const dupe = await db.execute({
    sql: `SELECT 1 FROM ownership_announcements
           WHERE user_id = ? AND status = 'pending'
             AND ((? IS NOT NULL AND slug = ?)
               OR (? IS NOT NULL AND free_text_name = ? COLLATE NOCASE))
           LIMIT 1`,
    args: [user.id, slug ?? null, slug ?? null, freeTextName ?? null, freeTextName ?? null],
  });
  if (dupe.rows.length > 0) {
    return errorResponse(c, 409, "you already announced this game", "DUPLICATE");
  }

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO ownership_announcements (id, user_id, slug, free_text_name, note)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, user.id, slug ?? null, freeTextName ?? null, note ?? null],
  });
  logActivity(user.id, "ownership-announced", {
    ...(slug !== undefined ? { slug } : {}),
    ...(freeTextName !== undefined ? { freeTextName } : {}),
  });

  const { rows } = await db.execute({
    sql: `SELECT id, user_id, slug, free_text_name, note, status, resolution_slug,
                 resolved_by, resolved_at, created_at
            FROM ownership_announcements WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const saved = parseRow(AnnouncementRowSchema, rows[0], "ownership_announcements");
  return c.json(
    CreateAnnouncementResponseSchema.parse({
      ok: true,
      announcement: rowToAnnouncement(saved, null),
    }),
  );
});

announcementRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  // Retract: own + still pending only. A resolved announcement is history.
  const result = await getDb().execute({
    sql: "DELETE FROM ownership_announcements WHERE id = ? AND user_id = ? AND status = 'pending'",
    args: [id, user.id],
  });
  if (result.rowsAffected === 0) {
    return errorResponse(c, 404, "pending announcement not found", "NOT_FOUND");
  }
  return c.json(CollectionOkResponseSchema.parse({ ok: true }));
});
