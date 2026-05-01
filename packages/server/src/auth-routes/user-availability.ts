import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";

export const userAvailabilityRoutes = authedApp();

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidMap(x: unknown): x is Record<string, "can" | "maybe"> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!DATE_KEY_RE.test(k)) return false;
    if (v !== "can" && v !== "maybe") return false;
  }
  return true;
}

userAvailabilityRoutes.get("/availability", async (c) => {
  const user = c.get("user");
  const { rows } = await getDb().execute({
    sql: "SELECT availability_json FROM user_availability WHERE user_id = ?",
    args: [user.id],
  });
  if (rows.length === 0) return c.json({});
  return c.json(JSON.parse(rows[0].availability_json as string));
});

userAvailabilityRoutes.put("/availability", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  if (!isValidMap(body)) return c.json({ error: "invalid availability map" }, 400);
  if (Object.keys(body).length > 200) return c.json({ error: "too many entries" }, 400);

  await getDb().execute({
    sql: `INSERT INTO user_availability (user_id, availability_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            availability_json = excluded.availability_json,
            updated_at = excluded.updated_at`,
    args: [user.id, JSON.stringify(body)],
  });

  return c.json({ ok: true });
});
