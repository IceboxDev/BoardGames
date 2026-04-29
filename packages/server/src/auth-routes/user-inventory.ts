import { Hono } from "hono";
import { auth } from "../auth.ts";
import { getDb } from "../db.ts";

export const userInventoryRoutes = new Hono();

userInventoryRoutes.get("/inventory", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);

  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [session.user.id],
  });
  if (rows.length === 0) return c.json([] as string[]);
  const parsed = JSON.parse(rows[0].game_slugs_json as string) as unknown;
  if (!Array.isArray(parsed)) return c.json([] as string[]);
  return c.json(parsed.filter((s) => typeof s === "string"));
});
