import { OnlineModeSchema } from "@boardgames/core/protocol";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types.ts";

// Mirror of `require-online.ts` for the profiles feature, which is for players
// who play offline. `online`-only users get 403; `offline` and `both` pass.
// MUST be mounted AFTER `requireAuth` (which populates `c.get("user")`).
// Fails CLOSED: a user object without an explicit online mode is rejected.
const OfflineUserSchema = z.object({ onlineMode: OnlineModeSchema });

export const requireOffline: MiddlewareHandler<AppEnv> = async (c, next) => {
  const parsed = OfflineUserSchema.safeParse(c.get("user"));
  if (!parsed.success || parsed.data.onlineMode === "online") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
};
