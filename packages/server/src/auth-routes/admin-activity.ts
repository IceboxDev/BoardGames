import {
  ActivityLogQuerySchema,
  ActivityLogResponseSchema,
  ActivitySeenBodySchema,
  AdminDevicesResponseSchema,
  DeviceInfoSchema,
  OkResponseSchema,
  UnseenActivityResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";

export const adminActivityRoutes = adminApp();

const ActivityRowSchema = z.object({
  id: z.number(),
  type: z.string(),
  meta_json: z.string(),
  created_at: z.string(),
  sort_ms: z.number(),
});
const MetaObjectSchema = z.record(z.string(), z.unknown());

// ── GET /api/admin/users/:id/activity ─────────────────────────────────
//
// One member's trail, newest first by WHEN IT HAPPENED (`sort_ms`, migration
// 0047), `id` breaking ties inside a legacy one-second stamp. Keyset-paged:
// `before` is the id of the last row the client has, and the page resumes
// after that row's (sort_ms, id) — so the cursor stays a plain id and older
// clients page correctly too. Served by idx_activity_log_user_sort; the
// `limit + 1` over-fetch decides whether a next page exists without a COUNT.

adminActivityRoutes.get("/:id/activity", zQuery(ActivityLogQuerySchema), async (c) => {
  const userId = c.req.param("id");
  const { before, limit } = c.req.valid("query");

  const { rows } = await getDb().execute({
    sql: `SELECT id, type, meta_json, created_at, sort_ms FROM activity_log
          WHERE user_id = ?
          ${
            before !== undefined
              ? `AND (sort_ms, id) < (SELECT sort_ms, id FROM activity_log WHERE id = ? AND user_id = ?)`
              : ""
          }
          ORDER BY sort_ms DESC, id DESC LIMIT ?`,
    args: before !== undefined ? [userId, before, userId, limit + 1] : [userId, limit + 1],
  });

  const parsed = parseRows(ActivityRowSchema, rows, "activity_log");
  const page = parsed.slice(0, limit);
  const entries = page.map((r) => {
    // A malformed meta cell degrades that one entry, not the whole page.
    // Per-type narrowing is the reader's job (`parseActivityMeta`).
    let meta: Record<string, unknown> = {};
    try {
      meta = MetaObjectSchema.safeParse(JSON.parse(r.meta_json)).data ?? {};
    } catch {
      // unparseable JSON — keep the empty meta
    }
    return { id: r.id, type: r.type, meta, createdAt: r.created_at, occurredAtMs: r.sort_ms };
  });

  const nextBefore = parsed.length > limit ? (page[page.length - 1]?.id ?? null) : null;
  return c.json(ActivityLogResponseSchema.parse({ entries, nextBefore }));
});

// ── GET /api/admin/users/:id/devices ──────────────────────────────────
//
// Every distinct device/viewport this member has reported, most recently
// seen first. A row whose stored payload no longer parses (schema drift) is
// dropped rather than failing the drawer.

const DeviceRowSchema = z.object({
  id: z.number(),
  device_json: z.string(),
  first_seen: z.string(),
  last_seen: z.string(),
  hits: z.number(),
});

adminActivityRoutes.get("/:id/devices", async (c) => {
  const userId = c.req.param("id");
  const { rows } = await getDb().execute({
    sql: `SELECT id, device_json, first_seen, last_seen, hits FROM user_devices
          WHERE user_id = ? ORDER BY last_seen DESC, id DESC`,
    args: [userId],
  });
  const devices = parseRows(DeviceRowSchema, rows, "user_devices").flatMap((r) => {
    const parsed = DeviceInfoSchema.safeParse(JSON.parse(r.device_json));
    if (!parsed.success) return [];
    return [
      {
        id: r.id,
        info: parsed.data,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        hits: r.hits,
      },
    ];
  });
  return c.json(AdminDevicesResponseSchema.parse({ devices }));
});

// ── GET /api/admin/users/unseen-activity ──────────────────────────────
//
// Per-member count of activity rows newer than the calling admin's marker
// (migration 0038) — the bubble next to each name in the users table. A
// member this admin has never opened has no marker, so every row counts;
// members with nothing new are simply absent from the map. The caller's own
// trail is left out — it would read as "unseen" forever. A static segment,
// so the `/:id/…` routes above can never shadow it.

const UnseenRowSchema = z.object({ user_id: z.string(), n: z.number() });

adminActivityRoutes.get("/unseen-activity", async (c) => {
  const admin = c.get("user");
  const { rows } = await getDb().execute({
    sql: `SELECT a.user_id, COUNT(*) AS n
          FROM activity_log a
          LEFT JOIN admin_activity_seen s ON s.user_id = a.user_id AND s.admin_id = ?
          WHERE a.user_id <> ? AND a.id > COALESCE(s.last_seen_id, 0)
          GROUP BY a.user_id`,
    args: [admin.id, admin.id],
  });
  const counts: Record<string, number> = {};
  for (const r of parseRows(UnseenRowSchema, rows, "activity_log")) counts[r.user_id] = r.n;
  return c.json(UnseenActivityResponseSchema.parse({ counts }));
});

// ── POST /api/admin/users/:id/activity/seen ───────────────────────────
//
// The drawer reports the newest id it rendered. MAX() keeps the marker
// monotonic: a second tab that loaded an older page can't un-see anything.
// The existence check makes a stale drawer for a deleted member a clean 404
// instead of whatever the connection's foreign-key setting turns it into.

adminActivityRoutes.post("/:id/activity/seen", zJsonBody(ActivitySeenBodySchema), async (c) => {
  const admin = c.get("user");
  const userId = c.req.param("id");
  const { lastSeenId } = c.req.valid("json");

  const db = getDb();
  const exists = await db.execute({ sql: `SELECT 1 FROM "user" WHERE id = ?`, args: [userId] });
  if (exists.rows.length === 0) return errorResponse(c, 404, "User not found");

  await db.execute({
    sql: `INSERT INTO admin_activity_seen (admin_id, user_id, last_seen_id)
          VALUES (?, ?, ?)
          ON CONFLICT(admin_id, user_id) DO UPDATE SET
            last_seen_id = MAX(last_seen_id, excluded.last_seen_id),
            seen_at = datetime('now')`,
    args: [admin.id, userId, lastSeenId],
  });
  return c.json(OkResponseSchema.parse({ ok: true }));
});
