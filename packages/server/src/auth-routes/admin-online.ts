import { Hono } from "hono";
import { auth } from "../auth.ts";
import { getDb } from "../db.ts";

export const adminOnlineRoutes = new Hono();

adminOnlineRoutes.post("/:id/online", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if ((session.user as { role?: string }).role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }

  const userId = c.req.param("id");
  const body = (await c.req.json()) as { onlineEnabled?: unknown };
  if (typeof body.onlineEnabled !== "boolean") {
    return c.json({ error: "onlineEnabled must be a boolean" }, 400);
  }

  const result = await getDb().execute({
    sql: "UPDATE user SET onlineEnabled = ? WHERE id = ?",
    args: [body.onlineEnabled ? 1 : 0, userId],
  });

  if (result.rowsAffected === 0) {
    return c.json({ error: "user not found" }, 404);
  }
  return c.json({ ok: true });
});
