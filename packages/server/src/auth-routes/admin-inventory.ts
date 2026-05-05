import {
  InventoryWriteResponseSchema,
  SetInventoryBodySchema,
  SlugListSchema,
} from "@boardgames/core/protocol";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { zJsonBody } from "../lib/error-response.ts";

export const adminInventoryRoutes = adminApp();

adminInventoryRoutes.get("/:id/inventory", async (c) => {
  const userId = c.req.param("id");
  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [userId],
  });
  if (rows.length === 0) return c.json(SlugListSchema.parse([]));
  const parsed = JSON.parse(rows[0].game_slugs_json as string) as unknown;
  const list = Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  return c.json(SlugListSchema.parse(list));
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
