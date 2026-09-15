// The inactivity clock's "attended a night" signal: the latest locked night a
// recorded match places the member at. A match entered with no night attached
// (a game an admin played with them elsewhere) must not count — it says
// nothing about the member's use of the app.
//
// Real migration chain, in-memory libsql, the real route behind an auth stub.

import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEnv } from "../auth/types.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminMatchHistoryRoutes } = await import("./admin-match-history.ts");

const ADMIN = "admin-1";
const PAUL = "paul";
const ANA = "ana";
const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin/history", adminMatchHistoryRoutes);
  return a;
}

describe("GET /api/admin/history/last-attended", () => {
  let client: Client;

  async function match(dateKey: string | null, playedAt: string, participants: string[]) {
    const r = await client.execute({
      sql: `INSERT INTO match_results
              (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, sort_order)
            VALUES (?, ?, 'catan', 'Catan', '{}', ?, 0)`,
      args: [dateKey, playedAt, ADMIN],
    });
    for (const userId of participants) {
      await client.execute({
        sql: "INSERT INTO match_participants (match_id, user_id) VALUES (?, ?)",
        args: [Number(r.lastInsertRowid), userId],
      });
    }
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const [id, role] of [
      [ADMIN, "admin"],
      [PAUL, "user"],
      [ANA, "user"],
    ] as const) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
        args: [id, id, `${id}@example.com`, role],
      });
    }
    for (const night of ["2026-07-16", "2026-08-20"]) {
      await client.execute({
        sql: "INSERT INTO locked_dates (date_key, locked_by) VALUES (?, ?)",
        args: [night, ADMIN],
      });
    }
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("reports the latest night a match places each member at, ignoring casual matches", async () => {
    await match("2026-07-16", "2026-07-16T16:00:00.000Z", [PAUL, ANA]);
    await match("2026-08-20", "2026-08-20T19:00:00.000Z", [ANA]);
    // A game the admin played with Paul at home, much later — no night attached.
    await match(null, "2026-09-14T22:57:47.132Z", [PAUL, ADMIN]);

    const res = await app().request("/api/admin/history/last-attended");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      lastAttendedNightByUser: { [PAUL]: "2026-07-16", [ANA]: "2026-08-20" },
    });
  });

  it("omits members with no night-attached match at all", async () => {
    await match(null, "2026-09-14T22:57:47.132Z", [PAUL]);
    const res = await app().request("/api/admin/history/last-attended");
    expect(await res.json()).toEqual({ lastAttendedNightByUser: {} });
  });
});
