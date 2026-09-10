// The users-table bubble counts what a member did since THIS admin last
// opened their trail. These pin the marker semantics: a never-opened trail
// counts everything, marking hides up to that id, the marker is per admin,
// and it never moves backwards.
//
// Real migration chain, in-memory libsql, the real route behind an admin stub.

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

const { adminActivityRoutes } = await import("./admin-activity.ts");

const ADMIN_A = "admin-a";
const ADMIN_B = "admin-b";
const MEMBER_1 = "member-1";
const MEMBER_2 = "member-2";
const QUIET = { info() {}, warn() {} };

function app(adminId: string) {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: adminId, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin/users", adminActivityRoutes);
  return a;
}

async function unseen(a: Hono<AdminEnv>): Promise<Record<string, number>> {
  const res = await a.request("/api/admin/users/unseen-activity");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { counts: Record<string, number> };
  return body.counts;
}

function markSeen(a: Hono<AdminEnv>, userId: string, lastSeenId: number) {
  return a.request(`/api/admin/users/${userId}/activity/seen`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lastSeenId }),
  });
}

describe("unseen activity marker", () => {
  let client: Client;

  /** Append `n` rows to a member's trail; returns their ids, oldest first. */
  async function log(userId: string, n: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = await client.execute({
        sql: "INSERT INTO activity_log (user_id, type) VALUES (?, 'page-view')",
        args: [userId],
      });
      ids.push(Number(r.lastInsertRowid));
    }
    return ids;
  }

  function newest(ids: number[]): number {
    const id = ids[ids.length - 1];
    if (id === undefined) throw new Error("no ids");
    return id;
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const [id, role] of [
      [ADMIN_A, "admin"],
      [ADMIN_B, "admin"],
      [MEMBER_1, "user"],
      [MEMBER_2, "user"],
    ]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
        args: [id, id, `${id}@example.com`, role],
      });
    }
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("counts every entry for a member this admin has never opened", async () => {
    await log(MEMBER_1, 20);
    await log(MEMBER_2, 3);
    expect(await unseen(app(ADMIN_A))).toEqual({ [MEMBER_1]: 20, [MEMBER_2]: 3 });
  });

  it("only counts entries newer than the marker once the trail was seen", async () => {
    const ids = await log(MEMBER_1, 5);
    const a = app(ADMIN_A);
    expect((await markSeen(a, MEMBER_1, newest(ids))).status).toBe(200);
    expect(await unseen(a)).toEqual({});

    await log(MEMBER_1, 20);
    expect(await unseen(a)).toEqual({ [MEMBER_1]: 20 });
  });

  it("keeps a separate marker per admin", async () => {
    const ids = await log(MEMBER_1, 4);
    await markSeen(app(ADMIN_A), MEMBER_1, newest(ids));
    expect(await unseen(app(ADMIN_A))).toEqual({});
    expect(await unseen(app(ADMIN_B))).toEqual({ [MEMBER_1]: 4 });
  });

  it("never moves the marker backwards", async () => {
    const ids = await log(MEMBER_1, 6);
    const a = app(ADMIN_A);
    await markSeen(a, MEMBER_1, newest(ids));
    // A second tab that had loaded an older page reports a smaller id.
    await markSeen(a, MEMBER_1, ids[1] ?? 0);
    expect(await unseen(a)).toEqual({});
  });

  it("rejects a marker for a member that does not exist", async () => {
    expect((await markSeen(app(ADMIN_A), "ghost", 1)).status).toBe(404);
  });

  it("rejects a non-positive marker", async () => {
    await log(MEMBER_1, 1);
    expect((await markSeen(app(ADMIN_A), MEMBER_1, 0)).status).toBe(400);
  });
});
