// How the hibernation gate learns who is asking: the session cookie for
// `/api/*`, and the user id `requireWsAuth` resolved (ticket or cookie) for
// `/ws`. Kept apart from the pure gate so that one tests without better-auth.

import type { Context } from "hono";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRow } from "../lib/db-rows.ts";
import { getSiteState } from "../lib/site-state.ts";
import { auth } from "./config.ts";
import { createHibernationGate, type GateUser } from "./hibernation-gate.ts";
import type { WsEnv } from "./types.ts";

export async function sessionGateUser(c: Context): Promise<GateUser | null> {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result?.user) return null;
  const user: { role?: string | null; onlineMode?: unknown } = result.user;
  return {
    id: result.user.id,
    role: user.role ?? null,
    onlineMode: typeof user.onlineMode === "string" ? user.onlineMode : null,
  };
}

const UserRowSchema = z.object({ role: z.string().nullable(), onlineMode: z.string().nullable() });

async function wsGateUser(c: Context<WsEnv>): Promise<GateUser | null> {
  const id = c.get("wsUserId");
  if (!id) return null;
  const { rows } = await getDb().execute({
    sql: `SELECT role, "onlineMode" FROM "user" WHERE id = ?`,
    args: [id],
  });
  return rows[0] ? parseRow(UserRowSchema, rows[0], "user") : null;
}

/** Mounted on `/api/*` right after the trusted-origin check. */
export const hibernationGate = createHibernationGate({
  getState: getSiteState,
  resolveUser: sessionGateUser,
});

/** Mounted on `/ws` after `requireWsAuth`. */
export const wsHibernationGate = createHibernationGate({
  getState: getSiteState,
  resolveUser: (c) => wsGateUser(c as Context<WsEnv>),
});
