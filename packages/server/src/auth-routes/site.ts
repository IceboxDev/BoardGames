// Site hibernation endpoints.
//
//   GET  /api/site/status          public — asleep or awake, the memorial, and
//                                  whether THIS caller may use the online area
//   POST /api/site/seen            the goodbye screen was shown to the caller:
//                                  one "goodbye" page view per member per day
//   GET  /api/admin/site/log       hibernate / wake history
//   GET  /api/admin/site/preview   the memorial hibernating now would freeze
//   POST /api/admin/site/hibernate { confirm: "HIBERNATE" }
//   POST /api/admin/site/wake
//
// State and its rules live in lib/site-state.ts; the request gate in
// auth/hibernation-gate.ts.

import {
  HibernateBodySchema,
  MemorialPreviewResponseSchema,
  OkResponseSchema,
  SiteLogResponseSchema,
  type SiteStatus,
  SiteStatusSchema,
} from "@boardgames/core/protocol";
import type { Context } from "hono";
import { type GateUser, hasOnlineAccess } from "../auth/hibernation-gate.ts";
import { adminApp, publicApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { zJsonBody } from "../lib/error-response.ts";
import {
  computeMemorial,
  getSiteState,
  hibernate,
  type SiteState,
  siteLog,
  todayKey,
  wake,
} from "../lib/site-state.ts";

export function siteStatusFor(state: SiteState, user: GateUser | null): SiteStatus {
  return SiteStatusSchema.parse({
    hibernated: state.hibernatedAt !== null,
    since: state.hibernatedAt,
    memorial: state.hibernatedAt ? state.memorial : null,
    onlineAccess: hasOnlineAccess(user),
    admin: user?.role === "admin",
  });
}

/** Public status, with the caller resolved by the injected session lookup. */
export function siteStatusRoutes(resolveUser: (c: Context) => Promise<GateUser | null>) {
  const routes = publicApp();
  routes.get("/status", async (c) => {
    const [state, user] = await Promise.all([getSiteState(), resolveUser(c)]);
    c.header("Cache-Control", "no-store");
    return c.json(siteStatusFor(state, user));
  });
  // The goodbye screen replaces the whole app, page-view tracker included, and
  // the activity endpoints are closed to offline members while asleep — so
  // the screen reports itself here. Signed-out visitors aren't recorded.
  routes.post("/seen", async (c) => {
    const [state, user] = await Promise.all([getSiteState(), resolveUser(c)]);
    if (state.hibernatedAt && user?.id && (await firstGoodbyeToday(user.id))) {
      logActivity(user.id, "page-view", { page: "goodbye" });
    }
    return c.json(OkResponseSchema.parse({ ok: true }));
  });
  return routes;
}

/** Day each member's goodbye view was last logged (guards rapid repeats). */
const goodbyeLoggedOn = new Map<string, string>();

/** Whether this is the member's first goodbye view today (Europe/Berlin);
 *  claims the day when it is. The DB check keeps it true across restarts. */
export async function firstGoodbyeToday(userId: string, now = new Date()): Promise<boolean> {
  const today = todayKey(now);
  if (goodbyeLoggedOn.get(userId) === today) return false;
  goodbyeLoggedOn.set(userId, today);
  const { rows } = await getDb().execute({
    sql: `SELECT MAX(logged_at_ms) AS last FROM activity_log
           WHERE user_id = ? AND type = 'page-view'
             AND json_extract(meta_json, '$.page') = 'goodbye'
             AND json_extract(meta_json, '$.detail') IS NULL`,
    args: [userId],
  });
  const last = rows[0]?.last;
  return !(typeof last === "number" && todayKey(new Date(last)) === today);
}

/** Forget the in-memory guard (tests). */
export function resetGoodbyeSeen(): void {
  goodbyeLoggedOn.clear();
}

export const adminSiteRoutes = adminApp();

adminSiteRoutes.get("/site/log", async (c) =>
  c.json(SiteLogResponseSchema.parse({ entries: await siteLog() })),
);

adminSiteRoutes.get("/site/preview", async (c) =>
  c.json(MemorialPreviewResponseSchema.parse({ memorial: await computeMemorial() })),
);

adminSiteRoutes.post("/site/hibernate", zJsonBody(HibernateBodySchema), async (c) => {
  const admin = c.get("user");
  const before = await getSiteState();
  const state = await hibernate(admin.id);
  if (!before.hibernatedAt) logActivity(admin.id, "site-hibernated");
  return c.json(siteStatusFor(state, admin));
});

adminSiteRoutes.post("/site/wake", async (c) => {
  const admin = c.get("user");
  const before = await getSiteState();
  const state = await wake(admin.id);
  if (before.hibernatedAt) logActivity(admin.id, "site-woken");
  return c.json(siteStatusFor(state, admin));
});
