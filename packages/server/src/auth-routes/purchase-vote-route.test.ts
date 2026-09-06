// PUT /api/purchase-vote/votes replaces the caller's vote set in ONE batch.
// Overlapping submits must leave one complete set, never a mix of two, and
// a submit that lands after the poll sealed must be refused rather than
// recorded on a closed poll.
//
// Real migration chain, in-memory libsql, the real route behind a viewer stub.

import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { purchaseVoteRoutes } = await import("./purchase-vote.ts");

const CANDIDATES = ["7-wonders", "aeons-end", "azul", "catan"];
const QUIET = { info() {}, warn() {} };

function app(viewerId: string) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: viewerId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/purchase-vote", purchaseVoteRoutes);
  return a;
}

function put(a: Hono<AppEnv>, slugs: string[]) {
  return a.request("/api/purchase-vote/votes", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slugs }),
  });
}

describe("PUT /api/purchase-vote/votes", () => {
  let client: Client;
  let pollId: number;

  async function votesOf(userId: string): Promise<string[]> {
    const { rows } = await client.execute({
      sql: "SELECT slug FROM purchase_poll_votes WHERE poll_id = ? AND user_id = ? ORDER BY slug",
      args: [pollId, userId],
    });
    return rows.map((r) => String(r.slug));
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const id of ["u1", "u2"]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
        args: [id, id, `${id}@example.com`],
      });
    }
    const created = await client.execute({
      sql: `INSERT INTO purchase_polls (candidate_slugs_json, required_voters)
            VALUES (?, 2) RETURNING id`,
      args: [JSON.stringify(CANDIDATES)],
    });
    pollId = Number(created.rows[0]?.id);
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("replaces the whole set atomically — overlapping submits never interleave", async () => {
    const a = app("u1");
    const setA = ["7-wonders", "aeons-end", "azul"];
    const setB = ["catan"];
    const responses = await Promise.all([put(a, setA), put(a, setB)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const final = await votesOf("u1");
    expect([setA.slice().sort(), setB]).toContainEqual(final);
  });

  it("clears the set with an empty submit", async () => {
    const a = app("u1");
    expect((await put(a, ["azul"])).status).toBe(200);
    expect((await put(a, [])).status).toBe(200);
    expect(await votesOf("u1")).toEqual([]);
  });

  it("refuses a vote once the poll has sealed", async () => {
    expect((await put(app("u1"), ["azul"])).status).toBe(200);
    // The second distinct voter reaches quorum (required_voters = 2) and seals.
    expect((await put(app("u2"), ["catan"])).status).toBe(200);
    const { rows } = await client.execute({
      sql: "SELECT closed_at, winner_slug FROM purchase_polls WHERE id = ?",
      args: [pollId],
    });
    expect(rows[0]?.closed_at).not.toBeNull();

    expect((await put(app("u1"), ["7-wonders"])).status).toBe(409);
    expect(await votesOf("u1")).toEqual(["azul"]);
  });

  it("rejects a slug outside the candidate list", async () => {
    expect((await put(app("u1"), ["wingspan"])).status).toBe(400);
    expect(await votesOf("u1")).toEqual([]);
  });
});
