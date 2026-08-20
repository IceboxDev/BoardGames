// `?limit=` used to be bound straight into `LIMIT ?`.
//
// Four separate bad outcomes came out of `Number(c.req.query("limit") ?? N)`,
// all verified against libsql before this test existed:
//   "abc" → NaN  → libsql throws "Only finite numbers…"  → 500
//   "2.5" → 2.5  → SQLITE_MISMATCH                       → 500
//   ""    → 0    → silently returns nothing
//   "-1"  → -1   → SQLite reads a negative LIMIT as UNLIMITED
// Each is now a 400 from the shared error envelope, before any SQL runs.

import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
// `routes.ts` → `auth/index.ts` → `auth/config.ts` reads the connection config
// at module scope to build better-auth's own Kysely dialect, so the stub has to
// answer that too or the import chain throws before any test runs.
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { persistenceRoutes } = await import("./routes.ts");

/** The real router, behind a stub that supplies an authenticated user. */
function app() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: "u1", role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/games", persistenceRoutes);
  return a;
}

describe("GET /api/games/:slug/results — limit validation", () => {
  beforeEach(async () => {
    db.current = createClient({ url: ":memory:" });
    await db.current.execute(`CREATE TABLE game_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_slug TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      client_id TEXT)`);
    await db.current.batch(
      [1, 2, 3, 4, 5].map((n) => ({
        sql: "INSERT INTO game_results (game_slug, result_json) VALUES ('set', ?)",
        args: [JSON.stringify({ n })],
      })),
      "write",
    );
  });

  afterEach(() => {
    db.current?.close();
  });

  it.each(["abc", "", "-1", "0", "2.5"])("rejects ?limit=%j with 400", async (limit) => {
    const res = await app().request(`/api/games/set/results?limit=${encodeURIComponent(limit)}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts a valid limit and honours it", async () => {
    const res = await app().request("/api/games/set/results?limit=2");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
  });

  it("still serves the Set trainer's ?limit=10000 reconciliation fetch", async () => {
    const res = await app().request("/api/games/set/results?limit=10000");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(5);
  });

  it("defaults to the full page when the param is absent", async () => {
    const res = await app().request("/api/games/set/results");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(5);
  });
});

describe("GET /api/games/:slug/replays — limit validation", () => {
  beforeEach(async () => {
    db.current = createClient({ url: ":memory:" });
    await db.current.execute(`CREATE TABLE session_replays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_slug TEXT NOT NULL,
      ai_engine TEXT,
      replay_json TEXT NOT NULL,
      score_p0 INTEGER, score_p1 INTEGER, winner TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      scores_json TEXT, player_count INTEGER)`);
  });

  afterEach(() => {
    db.current?.close();
  });

  it("rejects a non-numeric limit", async () => {
    const res = await app().request("/api/games/set/replays?limit=abc");
    expect(res.status).toBe(400);
  });

  it("rejects a limit past the ceiling", async () => {
    const res = await app().request("/api/games/set/replays?limit=5000");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/games/:slug/results/bulk — record cap", () => {
  beforeEach(async () => {
    db.current = createClient({ url: ":memory:" });
    await db.current.execute(`CREATE TABLE game_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_slug TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      client_id TEXT)`);
    await db.current.execute(
      "CREATE UNIQUE INDEX idx_game_results_client_id ON game_results(game_slug, client_id)",
    );
  });

  afterEach(() => {
    db.current?.close();
  });

  const post = (records: unknown[]) =>
    app().request("/api/games/set/results/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });

  it("accepts a batch at the cap", async () => {
    const res = await post(Array.from({ length: 500 }, (_, i) => ({ id: `r${i}` })));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ inserted: 500, skipped: 0 });
  });

  it("rejects a batch past the cap rather than opening an unbounded transaction", async () => {
    const res = await post(Array.from({ length: 501 }, (_, i) => ({ id: `r${i}` })));
    expect(res.status).toBe(400);
  });
});
