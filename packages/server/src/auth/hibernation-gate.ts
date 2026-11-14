// The request gate while the site is hibernated (lib/site-state.ts).
//
// Awake, it is a no-op. Asleep, every request is classified by its path:
//
//   open    — always passes: health (Railway's healthcheck), sign-in, the
//             site status the goodbye screen reads, the calendar feed (which
//             itself renders the hibernated form).
//   token   — machine callers with their own bearer tokens (chess farm, BGA
//             ingest, the agent API): unchanged.
//   admin   — `/api/admin/*`, already behind `requireAdmin`: the console is
//             how the site wakes up again.
//   frozen  — the offline surfaces (calendar, RSVPs, availability, history,
//             collection, purchases…): admin only, so nothing changes while
//             the site sleeps.
//   online  — the online area and what it reads (games, rooms, trainers, the
//             member's own profile for their theme): members with online
//             access, and admins.
//
// Everyone else gets 503 with the shared error envelope and code HIBERNATED,
// which the web turns into the goodbye screen.
//
// Pure apart from the two injected lookups, so it is tested without booting
// better-auth or a database.

import { HIBERNATED_CODE, OnlineModeSchema } from "@boardgames/core/protocol";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";
import type { SiteState } from "../lib/site-state.ts";

export type HibernationClass = "open" | "token" | "admin" | "frozen" | "online";

/**
 * Every path prefix the server mounts, classified. Longest prefix wins.
 * `hibernation-gate.test.ts` reads `server.ts` and fails on any mounted prefix
 * missing here, so a new route can't slip through unclassified.
 */
export const HIBERNATION_POLICY: Readonly<Record<string, HibernationClass>> = {
  "/api/health": "open",
  "/api/auth": "open",
  "/api/auth-config": "open",
  "/api/site": "open",
  "/api/ical": "open",

  "/api/bga-ingest": "token",
  "/api/agent": "token",
  "/api/chess-farm": "token",

  "/api/admin": "admin",

  "/api/calendar": "frozen",
  "/api/availability": "frozen",
  "/api/user/availability": "frozen",
  "/api/history": "frozen",
  "/api/skills": "frozen",
  "/api/greetings": "frozen",
  "/api/arrivals": "frozen",
  "/api/purchase-vote": "frozen",
  "/api/collection": "frozen",
  "/api/announcements": "frozen",
  "/api/purchases": "frozen",

  "/api/user": "online",
  "/api/activity": "online",
  "/api/profiles": "online",
  "/api/onboarding": "online",
  "/api/avatars": "online",
  "/api/bgg": "online",
  "/api/dnd": "online",
  "/api/trainers": "online",
  "/api/games": "online",
  "/api/bga": "online",
  "/api/go": "online",
  "/api/ws-ticket": "online",
  "/ws": "online",
};

const PREFIXES = Object.keys(HIBERNATION_POLICY).sort((a, b) => b.length - a.length);

/** The class of a request path. Unlisted paths count as `online`: closed to
 *  offline members and visitors, which is the safe side. */
export function classifyPath(path: string): HibernationClass {
  for (const prefix of PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return HIBERNATION_POLICY[prefix] ?? "online";
    }
  }
  return "online";
}

/** Who is asking, as far as the gate cares. */
export interface GateUser {
  /** Present for a session user; the `/ws` gate does not need it. */
  id?: string;
  role: string | null | undefined;
  onlineMode: string | null | undefined;
}

const ModeSchema = z.object({ onlineMode: OnlineModeSchema });

/** Online access: `online` or `both` mode, read through the shared schema
 *  (fails closed on a missing or unknown mode), or an admin. */
export function hasOnlineAccess(user: GateUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const parsed = ModeSchema.safeParse(user);
  return parsed.success && parsed.data.onlineMode !== "offline";
}

/** Whether a request of this class from this user passes while hibernated. */
export function allowedWhileHibernated(cls: HibernationClass, user: GateUser | null): boolean {
  switch (cls) {
    case "open":
    case "token":
    case "admin":
      return true;
    case "frozen":
      return user?.role === "admin";
    case "online":
      return hasOnlineAccess(user);
  }
}

export function hibernatedResponse(c: Context) {
  return c.json({ error: "The site is hibernating.", code: HIBERNATED_CODE }, 503);
}

/**
 * The gate. `resolveUser` is only called while hibernated and only for paths
 * that depend on who is asking, so an awake site pays one in-memory read.
 */
export function createHibernationGate(deps: {
  getState: () => Promise<SiteState>;
  resolveUser: (c: Context) => Promise<GateUser | null>;
}): MiddlewareHandler {
  return async (c, next) => {
    const state = await deps.getState();
    if (!state.hibernatedAt) return next();
    const cls = classifyPath(c.req.path);
    const needsUser = cls === "frozen" || cls === "online";
    const user = needsUser ? await deps.resolveUser(c) : null;
    if (!allowedWhileHibernated(cls, user)) return hibernatedResponse(c);
    return next();
  };
}
