import { SlugListSchema } from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

export const userInventoryRoutes = authedApp();

userInventoryRoutes.get("/inventory", async (c) => {
  const user = c.get("user");
  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [user.id],
  });
  if (rows.length === 0) return c.json(SlugListSchema.parse([]));
  const parsed = JSON.parse(rows[0].game_slugs_json as string) as unknown;
  const list = Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  return c.json(SlugListSchema.parse(list));
});
