// Site hibernation endpoints.
//
//   GET  /api/site/status          public — asleep or awake, the memorial, and
//                                  whether THIS caller may use the online area
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
  SiteLogResponseSchema,
  type SiteStatus,
  SiteStatusSchema,
} from "@boardgames/core/protocol";
import type { Context } from "hono";
import { type GateUser, hasOnlineAccess } from "../auth/hibernation-gate.ts";
import { adminApp, publicApp } from "../auth/index.ts";
import { logActivity } from "../lib/activity-log.ts";
import { zJsonBody } from "../lib/error-response.ts";
import {
  computeMemorial,
  getSiteState,
  hibernate,
  type SiteState,
  siteLog,
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
  return routes;
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
