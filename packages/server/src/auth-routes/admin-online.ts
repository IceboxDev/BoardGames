import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

export const adminOnlineRoutes = adminApp();

adminOnlineRoutes.post("/:id/online", async (c) => {
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
