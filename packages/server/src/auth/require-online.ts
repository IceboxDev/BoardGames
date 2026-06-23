import { OnlineModeSchema } from "@boardgames/core/protocol";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types.ts";

// `onlineMode` is a better-auth additionalField (see auth/config.ts). better-auth
// does not surface it on the inferred session-user type, so we read it through
// the shared schema rather than an unchecked property access. The check fails
// CLOSED: a user object without an explicit online-capable mode is rejected.
const OnlineUserSchema = z.object({ onlineMode: OnlineModeSchema });

/**
 * Gate for online-only features (tournaments today). MUST be mounted AFTER
 * `requireAuth`, which populates `c.get("user")`. Mirrors the web `AuthGuard`
 * `mode="online"` rule: `offline` users get 403; `online` and `both` pass.
 *
 * Lives in its own file (not middleware.ts) so it can be unit-tested without
 * booting better-auth / the database, which `middleware.ts` pulls in at import.
 */
export const requireOnline: MiddlewareHandler<AppEnv> = async (c, next) => {
  const parsed = OnlineUserSchema.safeParse(c.get("user"));
  if (!parsed.success || parsed.data.onlineMode === "offline") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
};
