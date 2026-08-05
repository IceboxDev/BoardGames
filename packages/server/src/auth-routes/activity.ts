import {
  type DeviceInfo,
  DeviceInfoSchema,
  OkResponseSchema,
  PageViewBodySchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { zJsonBody } from "../lib/error-response.ts";

export const activityRoutes = authedApp();

// ── POST /api/activity/view ───────────────────────────────────────────
//
// Page-view beacon from the web client (see web/src/lib/page-views.ts).
// The client owns the `page` vocabulary and the per-session dedupe; this
// endpoint just stamps the row. Always 200 — a view beacon has no failure
// mode the client could act on.

activityRoutes.post("/view", zJsonBody(PageViewBodySchema), async (c) => {
  const user = c.get("user");
  const { page, detail } = c.req.valid("json");
  logActivity(user.id, "page-view", { page, ...(detail ? { detail } : {}) });
  return c.json(OkResponseSchema.parse({ ok: true }));
});

// ── POST /api/activity/device ─────────────────────────────────────────
//
// Device/viewport report, upserted by signature so each distinct setup is one
// row (fresh payload wins; hits/last_seen accumulate). The signature buckets
// viewport width to 32px so ordinary window fiddling doesn't mint endless
// "devices", while a genuinely different window size still registers.

export function deviceSignature(info: DeviceInfo): string {
  const vwBucket = Math.round(info.viewportWidth / 32) * 32;
  return [
    info.deviceType,
    `${info.screenWidth}x${info.screenHeight}`,
    `dpr${info.devicePixelRatio}`,
    info.browser ?? "?",
    info.os ?? "?",
    `vw${vwBucket}`,
  ].join("|");
}

activityRoutes.post("/device", zJsonBody(DeviceInfoSchema), async (c) => {
  const user = c.get("user");
  const info = c.req.valid("json");
  await getDb().execute({
    sql: `INSERT INTO user_devices (user_id, signature, device_json)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, signature) DO UPDATE SET
            device_json = excluded.device_json,
            last_seen = datetime('now'),
            hits = hits + 1`,
    args: [user.id, deviceSignature(info), JSON.stringify(info)],
  });
  return c.json(OkResponseSchema.parse({ ok: true }));
});
