import type { MiddlewareHandler } from "hono";
import { verifyWsTicket } from "../sessions/ws-ticket.ts";
import { auth } from "./config.ts";
import type { AdminEnv, AdminUser, AppEnv, WsEnv } from "./types.ts";

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

/**
 * Auth gate for the `/ws` upgrade. Prefers the `?ticket=` query param (the
 * cross-origin prod path, where the session cookie can't reach the handshake);
 * falls back to the session cookie when no ticket is present (same-origin dev).
 * On success, exposes the resolved id as `wsUserId`. Returns 401 otherwise —
 * the browser surfaces a non-101 handshake as a generic "WebSocket connection
 * failed".
 */
export const requireWsAuth: MiddlewareHandler<WsEnv> = async (c, next) => {
  const ticket = c.req.query("ticket");
  if (ticket) {
    const userId = verifyWsTicket(ticket);
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    c.set("wsUserId", userId);
    return next();
  }

  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result?.user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("wsUserId", result.user.id);
  await next();
};
