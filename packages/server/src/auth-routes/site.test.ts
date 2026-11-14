// The goodbye screen reports itself (POST /api/site/seen): one "goodbye" page
// view per member per day while the site sleeps; nothing while it is awake,
// nothing for a signed-out visitor, and the admin's preview doesn't count.
//
// Real migration chain, in-memory libsql, the real route.

import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GateUser } from "../auth/hibernation-gate.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { hibernate, resetSiteStateCache } = await import("../lib/site-state.ts");
const { activityWritesSettled } = await import("../lib/activity-log.ts");
const { firstGoodbyeToday, resetGoodbyeSeen, siteStatusRoutes } = await import("./site.ts");

const ADMIN = "admin-1";
const MEMBER = "member-1";
const QUIET = { info() {}, warn() {} };

describe("POST /api/site/seen", () => {
  let client: Client;
  let caller: GateUser | null;
  const app = new Hono().route(
    "/api/site",
    siteStatusRoutes(async () => caller),
  );

  async function seen(): Promise<void> {
    const res = await app.request("/api/site/seen", { method: "POST" });
    expect(res.status).toBe(200);
    await activityWritesSettled();
  }

  async function goodbyeRows(userId: string): Promise<unknown[]> {
    const { rows } = await client.execute({
      sql: `SELECT meta_json FROM activity_log WHERE user_id = ? AND type = 'page-view' ORDER BY id`,
      args: [userId],
    });
    return rows.map((r) => JSON.parse(String(r.meta_json)));
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    resetSiteStateCache();
    resetGoodbyeSeen();
    for (const [id, role] of [
      [ADMIN, "admin"],
      [MEMBER, "user"],
    ]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), ?)`,
        args: [id, id, `${id}@example.com`, role],
      });
    }
    caller = { id: MEMBER, role: "user", onlineMode: "offline" };
  });

  it("logs nothing while the site is awake", async () => {
    await seen();
    expect(await goodbyeRows(MEMBER)).toEqual([]);
  });

  it("logs one goodbye view per member per day while asleep", async () => {
    await hibernate(ADMIN);
    resetSiteStateCache();
    await seen();
    await seen();
    await seen();
    expect(await goodbyeRows(MEMBER)).toEqual([{ page: "goodbye" }]);

    // A restart forgets the in-memory guard; the stored row still counts…
    resetGoodbyeSeen();
    expect(await firstGoodbyeToday(MEMBER)).toBe(false);
    // …until the next day.
    resetGoodbyeSeen();
    expect(await firstGoodbyeToday(MEMBER, new Date(Date.now() + 36 * 3_600_000))).toBe(true);
  });

  it("ignores a signed-out visitor", async () => {
    await hibernate(ADMIN);
    resetSiteStateCache();
    caller = null;
    await seen();
    const { rows } = await client.execute(
      `SELECT COUNT(*) AS n FROM activity_log WHERE type = 'page-view'`,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it("does not count the admin's preview as having seen it", async () => {
    await client.execute({
      sql: `INSERT INTO activity_log (user_id, type, meta_json, logged_at_ms)
            VALUES (?, 'page-view', ?, ?)`,
      args: [ADMIN, JSON.stringify({ page: "goodbye", detail: "preview" }), Date.now()],
    });
    await hibernate(ADMIN);
    resetSiteStateCache();
    caller = { id: ADMIN, role: "admin", onlineMode: "both" };
    await seen();
    expect(await goodbyeRows(ADMIN)).toEqual([
      { page: "goodbye", detail: "preview" },
      { page: "goodbye" },
    ]);
  });
});
