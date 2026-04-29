import { Hono } from "hono";
import { auth } from "../auth.ts";
import { getDb } from "../db.ts";

export const adminInventoryRoutes = new Hono();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isValidSlugList(x: unknown): x is string[] {
  if (!Array.isArray(x)) return false;
  if (x.length > 200) return false;
  for (const s of x) {
    if (typeof s !== "string" || !SLUG_RE.test(s)) return false;
  }
  return true;
}

async function requireAdmin(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return { error: "unauthorized" as const, status: 401 as const };
  if ((session.user as { role?: string }).role !== "admin") {
    return { error: "forbidden" as const, status: 403 as const };
  }
  return { session };
}

adminInventoryRoutes.get("/:id/inventory", async (c) => {
  const guard = await requireAdmin(c.req.raw.headers);
  if ("error" in guard) return c.json({ error: guard.error }, guard.status);

  const userId = c.req.param("id");
  const { rows } = await getDb().execute({
    sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
    args: [userId],
  });
  if (rows.length === 0) return c.json([] as string[]);
  const parsed = JSON.parse(rows[0].game_slugs_json as string) as unknown;
  if (!Array.isArray(parsed)) return c.json([] as string[]);
  return c.json(parsed.filter((s) => typeof s === "string"));
});

adminInventoryRoutes.put("/:id/inventory", async (c) => {
  const guard = await requireAdmin(c.req.raw.headers);
  if ("error" in guard) return c.json({ error: guard.error }, guard.status);

  const userId = c.req.param("id");
  const body = (await c.req.json()) as { slugs?: unknown };
  if (!isValidSlugList(body.slugs)) {
    return c.json({ error: "slugs must be an array of kebab-case strings (max 200)" }, 400);
  }

  // Deduplicate while preserving order.
  const unique = Array.from(new Set(body.slugs));

  await getDb().execute({
    sql: `INSERT INTO user_inventory (user_id, game_slugs_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            game_slugs_json = excluded.game_slugs_json,
            updated_at = excluded.updated_at`,
    args: [userId, JSON.stringify(unique)],
  });

  return c.json({ ok: true, slugs: unique });
});
