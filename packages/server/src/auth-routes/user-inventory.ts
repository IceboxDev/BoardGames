import { SlugListSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow } from "../lib/db-rows.ts";

export const userInventoryRoutes = authedApp();

/** Row projection for `SELECT game_slugs_json FROM user_inventory`. */
const InventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(SlugListSchema),
});

userInventoryRoutes.get("/inventory", async (c) => {
  const user = c.get("user");
  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [user.id],
  });
  if (rows.length === 0) return c.json(SlugListSchema.parse([]));
  const { game_slugs_json } = parseRow(InventoryRowSchema, rows[0], "user_inventory");
  return c.json(game_slugs_json);
});
