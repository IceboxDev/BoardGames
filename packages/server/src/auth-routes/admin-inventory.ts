import { randomUUID } from "node:crypto";
import {
  InventoryNewSlugsSchema,
  InventoryWriteResponseSchema,
  OwnableSlugSchema,
  SetInventoryBodySchema,
  SetInventoryNewBodySchema,
  SlugListSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { fetchNewSlugs } from "../lib/new-acquisitions.ts";

export const adminInventoryRoutes = adminApp();

/** Row projection for `SELECT game_slugs_json FROM user_inventory`. */
const InventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(SlugListSchema),
});

async function ownedSlugs(userId: string): Promise<Set<string>> {
  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [userId],
  });
  if (rows.length === 0) return new Set();
  return new Set(parseRow(InventoryRowSchema, rows[0], "user_inventory").game_slugs_json);
}

adminInventoryRoutes.get("/:id/inventory", async (c) => {
  const userId = c.req.param("id");
  return c.json(SlugListSchema.parse([...(await ownedSlugs(userId))]));
});

adminInventoryRoutes.put("/:id/inventory", zJsonBody(SetInventoryBodySchema), async (c) => {
  const userId = c.req.param("id");
  const { slugs } = c.req.valid("json");
  const unique = Array.from(new Set(slugs));

  await getDb().execute({
    sql: `INSERT INTO user_inventory (user_id, game_slugs_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            game_slugs_json = excluded.game_slugs_json,
            updated_at = excluded.updated_at`,
    args: [userId, JSON.stringify(unique)],
  });

  return c.json(InventoryWriteResponseSchema.parse({ ok: true, slugs: unique }));
});

// ── New-in-library marker ───────────────────────────────────────────────
// "New" is derived, not stored (lib/new-acquisition.ts): a dated copy the
// member hasn't played since. The toggle therefore edits the date on the
// member's `collection_items` row — marking dates the copy today (moving an
// older date forward, so a game played since reads as new again), unmarking
// clears it. The owner's own Games Manager shows the same badge.

adminInventoryRoutes.get("/:id/inventory/new", async (c) => {
  const userId = c.req.param("id");
  const newSlugs = await fetchNewSlugs(getDb(), userId, await ownedSlugs(userId));
  return c.json(InventoryNewSlugsSchema.parse({ newSlugs }));
});

adminInventoryRoutes.put(
  "/:id/inventory/:slug/new",
  zJsonBody(SetInventoryNewBodySchema),
  async (c) => {
    const userId = c.req.param("id");
    const slug = OwnableSlugSchema.safeParse(c.req.param("slug"));
    if (!slug.success) return errorResponse(c, 400, "not an ownable game", "BAD_SLUG");
    const owned = await ownedSlugs(userId);
    if (!owned.has(slug.data)) {
      return errorResponse(c, 409, "the member does not own this game", "NOT_OWNED");
    }
    const db = getDb();
    if (c.req.valid("json").new) {
      const today = new Date().toISOString().slice(0, 10);
      await db.execute({
        sql: `INSERT INTO collection_items (id, user_id, slug, acquired_on) VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, slug) WHERE slug IS NOT NULL DO UPDATE SET
                acquired_on = excluded.acquired_on, updated_at = datetime('now')`,
        args: [randomUUID(), userId, slug.data, today],
      });
    } else {
      await db.execute({
        sql: `UPDATE collection_items SET acquired_on = NULL, updated_at = datetime('now')
               WHERE user_id = ? AND slug = ?`,
        args: [userId, slug.data],
      });
    }
    const newSlugs = await fetchNewSlugs(db, userId, owned);
    return c.json(InventoryNewSlugsSchema.parse({ newSlugs }));
  },
);
