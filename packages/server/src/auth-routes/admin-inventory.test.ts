// The admin's New-in-library toggle. "New" is derived (lib/new-acquisition.ts),
// so the toggle edits the copy's `acquired_on` date and the read-back reports
// what that date now derives to — including the interplay with a recorded
// match and with ownership (a dated row for a game no longer on the shelf is
// history, not a marker).
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

const { adminInventoryRoutes } = await import("./admin-inventory.ts");

const ADMIN = "admin-1";
const MEMBER = "member-1";
const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin/users", adminInventoryRoutes);
  return a;
}

async function readNew(): Promise<string[]> {
  const res = await app().request(`/api/admin/users/${MEMBER}/inventory/new`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { newSlugs: string[] }).newSlugs;
}

async function setNew(slug: string, value: boolean) {
  return app().request(`/api/admin/users/${MEMBER}/inventory/${slug}/new`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ new: value }),
  });
}

describe("admin New-in-library marker", () => {
  let client: Client;

  async function setInventory(slugs: string[]) {
    const res = await app().request(`/api/admin/users/${MEMBER}/inventory`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slugs }),
    });
    expect(res.status).toBe(200);
  }

  async function acquiredOn(slug: string): Promise<string | null> {
    const { rows } = await client.execute({
      sql: "SELECT acquired_on FROM collection_items WHERE user_id = ? AND slug = ?",
      args: [MEMBER, slug],
    });
    return rows.length === 0 ? null : (rows[0].acquired_on as string | null);
  }

  async function recordPlay(slug: string, playedAt: string) {
    const r = await client.execute({
      sql: `INSERT INTO match_results
              (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, sort_order)
            VALUES (NULL, ?, ?, ?, '{}', ?, 0)`,
      args: [playedAt, slug, slug, ADMIN],
    });
    await client.execute({
      sql: "INSERT INTO match_participants (match_id, user_id) VALUES (?, ?)",
      args: [Number(r.lastInsertRowid), MEMBER],
    });
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const [id, role] of [
      [ADMIN, "admin"],
      [MEMBER, "user"],
    ] as const) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
        args: [id, id, `${id}@example.com`, role],
      });
    }
    await setInventory(["wingspan", "catan"]);
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("starts with nothing new", async () => {
    expect(await readNew()).toEqual([]);
  });

  it("marking dates the copy today and reads back as new", async () => {
    const res = await setNew("wingspan", true);
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ newSlugs: ["wingspan"] });
    expect(await acquiredOn("wingspan")).toBe(new Date().toISOString().slice(0, 10));
    expect(await readNew()).toEqual(["wingspan"]);
  });

  it("unmarking clears the date", async () => {
    await setNew("wingspan", true);
    const res = await setNew("wingspan", false);
    expect((await res.json()) as unknown).toEqual({ newSlugs: [] });
    expect(await acquiredOn("wingspan")).toBeNull();
  });

  it("re-marking a copy played since moves its date past the play", async () => {
    await client.execute({
      sql: `INSERT INTO collection_items (id, user_id, slug, acquired_on)
            VALUES ('ci-1', ?, 'wingspan', '2026-01-10')`,
      args: [MEMBER],
    });
    await recordPlay("wingspan", "2026-02-01 20:00:00");
    expect(await readNew()).toEqual([]); // played after the old date
    await setNew("wingspan", true);
    expect(await readNew()).toEqual(["wingspan"]);
  });

  it("a match recorded after marking clears it without any write", async () => {
    await setNew("catan", true);
    await recordPlay("catan", "2099-01-01 20:00:00");
    expect(await readNew()).toEqual([]);
    expect(await acquiredOn("catan")).not.toBeNull();
  });

  it("only games on the shelf can be marked, and a removed game stops being new", async () => {
    const res = await setNew("azul", true);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_OWNED");

    await setNew("wingspan", true);
    await setInventory(["catan"]);
    expect(await readNew()).toEqual([]);
    expect(await acquiredOn("wingspan")).not.toBeNull(); // the row is history, not deleted
  });

  it("rejects a slug that is not an ownable game", async () => {
    expect((await setNew("exit", true)).status).toBe(400);
    expect((await setNew("Not-A-Slug", true)).status).toBe(400);
  });
});
