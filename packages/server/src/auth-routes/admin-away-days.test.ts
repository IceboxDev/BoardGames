// The admin's "away" note on another member's calendar: write, read back for
// the drawer, and the everyone-map the users table reads. A note is only
// ever from today on — the write refuses a past day and the reads skip one.
//
// Real migration chain, in-memory libsql, the real routes behind an auth stub.

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

const { adminAvailabilityAllRoutes, adminAvailabilityRoutes } = await import(
  "./admin-availability.ts"
);

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
  a.route("/api/admin/users", adminAvailabilityRoutes);
  a.route("/api/admin", adminAvailabilityAllRoutes);
  return a;
}

const plusDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function setAway(userId: string, dateKey: string, away: boolean) {
  return app().request(`/api/admin/users/${userId}/away`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dateKey, away }),
  });
}

describe("admin away notes", () => {
  let client: Client;

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
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("marks and clears a day, returning the member's remaining notes", async () => {
    const d1 = plusDays(3);
    const d2 = plusDays(10);
    expect((await (await setAway(PAUL, d2, true)).json()) as unknown).toEqual({ days: [d2] });
    expect((await (await setAway(PAUL, d1, true)).json()) as unknown).toEqual({ days: [d1, d2] });
    // Idempotent: noting the same day twice keeps one row.
    expect((await (await setAway(PAUL, d1, true)).json()) as unknown).toEqual({ days: [d1, d2] });
    expect((await (await setAway(PAUL, d1, false)).json()) as unknown).toEqual({ days: [d2] });
    const who = await client.execute("SELECT marked_by FROM admin_away_days");
    expect(who.rows[0]?.marked_by).toBe(ADMIN);
  });

  it("refuses a past day and an unknown member", async () => {
    const past = await setAway(PAUL, "2020-01-01", true);
    expect(past.status).toBe(400);
    expect(((await past.json()) as { code: string }).code).toBe("PAST_DAY");
    expect((await setAway("nobody", plusDays(1), true)).status).toBe(404);
    // The write is guarded by the member check in the same batch, not by the
    // foreign key (which the remote database may not enforce).
    const rows = await client.execute("SELECT count(*) AS n FROM admin_away_days");
    expect(rows.rows[0]?.n).toBe(0);
  });

  it("the everyone-map groups by member and skips past notes", async () => {
    await setAway(PAUL, plusDays(2), true);
    await setAway(ANA, plusDays(5), true);
    await client.execute({
      sql: "INSERT INTO admin_away_days (user_id, date_key, marked_by) VALUES (?, '2020-06-01', ?)",
      args: [PAUL, ADMIN],
    });
    const res = await app().request("/api/admin/availability/away");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      awayByUser: { [PAUL]: [plusDays(2)], [ANA]: [plusDays(5)] },
    });
  });

  it("never leaks into the member's merged availability", async () => {
    await setAway(PAUL, plusDays(2), true);
    const res = await app().request(`/api/admin/users/${PAUL}/availability`);
    expect((await res.json()) as unknown).toEqual({});
  });
});
