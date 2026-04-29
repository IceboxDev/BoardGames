import { Hono } from "hono";
import { auth } from "../auth.ts";
import { getDb } from "../db.ts";

export const adminAvailabilityRoutes = new Hono();

adminAvailabilityRoutes.get("/:id/availability", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ error: "unauthorized" }, 401);
  if ((session.user as { role?: string }).role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const userId = c.req.param("id");
  const { rows } = await getDb().execute({
    sql: "SELECT availability_json FROM user_availability WHERE user_id = ?",
    args: [userId],
  });
  if (rows.length === 0) return c.json({});
  const parsed = JSON.parse(rows[0].availability_json as string) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return c.json(parsed);
  }
  return c.json({});
});
