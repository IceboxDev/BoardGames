import {
  InventoryWriteResponseSchema,
  SetInventoryBodySchema,
  SlugListSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow } from "../lib/db-rows.ts";
import { zJsonBody } from "../lib/error-response.ts";

export const adminPendingInventoryRoutes = adminApp();

/** Row projection for `SELECT game_slugs_json FROM pending_inventory`. */
const InventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(SlugListSchema),
});

adminPendingInventoryRoutes.get("/pending-inventory", async (c) => {
  const { rows } = await getDb().execute(
    "SELECT game_slugs_json FROM pending_inventory WHERE id = 1",
  );
  if (rows.length === 0) return c.json(SlugListSchema.parse([]));
  const { game_slugs_json } = parseRow(InventoryRowSchema, rows[0], "pending_inventory");
  return c.json(game_slugs_json);
});

adminPendingInventoryRoutes.put(
  "/pending-inventory",
  zJsonBody(SetInventoryBodySchema),
  async (c) => {
    const { slugs } = c.req.valid("json");
    const unique = Array.from(new Set(slugs));

    if (unique.length === 0) {
      await getDb().execute("DELETE FROM pending_inventory WHERE id = 1");
      return c.json(InventoryWriteResponseSchema.parse({ ok: true, slugs: [] }));
    }

    await getDb().execute({
      sql: `INSERT INTO pending_inventory (id, game_slugs_json, updated_at)
            VALUES (1, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              game_slugs_json = excluded.game_slugs_json,
              updated_at = excluded.updated_at`,
      args: [JSON.stringify(unique)],
    });

    return c.json(InventoryWriteResponseSchema.parse({ ok: true, slugs: unique }));
  },
);
