import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

export const userInventoryRoutes = authedApp();

userInventoryRoutes.get("/inventory", async (c) => {
  const user = c.get("user");
  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [user.id],
  });
  if (rows.length === 0) return c.json([] as string[]);
  const parsed = JSON.parse(rows[0].game_slugs_json as string) as unknown;
  if (!Array.isArray(parsed)) return c.json([] as string[]);
  return c.json(parsed.filter((s) => typeof s === "string"));
});
