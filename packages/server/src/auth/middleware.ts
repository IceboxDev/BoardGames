import type { MiddlewareHandler } from "hono";
import { auth } from "./config.ts";
import type { AdminEnv, AdminUser, AppEnv } from "./types.ts";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result?.user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
};

export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result?.user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (result.user.role !== "admin") {
    return c.json({ error: "forbidden" }, 403);
  }
  c.set("user", result.user as AdminUser);
  c.set("session", result.session);
  await next();
};
