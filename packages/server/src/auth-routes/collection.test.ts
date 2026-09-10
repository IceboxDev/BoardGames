// `isNew` is the one collection field that is derived rather than stored:
// a dated acquisition the owner has not played since. These pin the wiring —
// the play-history join, the "before acquisition doesn't count" edge, and
// that the flag survives the public view while the date itself is hidden.
//
// Real migration chain, in-memory libsql, the real route behind an auth stub.

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

const { collectionRoutes } = await import("./collection.ts");

const OWNER = "owner-1";
const FRIEND = "friend-1";
const QUIET = { info() {}, warn() {} };

function app(viewerId: string) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: viewerId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/collection", collectionRoutes);
  return a;
}

type ItemView = { slug: string | null; acquiredOn: string | null; isNew: boolean };

async function ownerItems(viewerId: string): Promise<ItemView[]> {
  const res = await app(viewerId).request(`/api/collection/users/${OWNER}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: ItemView[] };
  return body.items.map(({ slug, acquiredOn, isNew }) => ({ slug, acquiredOn, isNew }));
}

describe("GET /api/collection/users/:userId — isNew", () => {
  let client: Client;

  async function recordPlay(playedAt: string, participants: string[]) {
    const r = await client.execute({
      sql: `INSERT INTO match_results
              (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, sort_order)
            VALUES (NULL, ?, 'wingspan', 'Wingspan', '{}', ?, 0)`,
      args: [playedAt, OWNER],
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
    for (const id of [OWNER, FRIEND]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
        args: [id, id, `${id}@example.com`],
      });
    }
    await client.execute({
      sql: `INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, '["wingspan"]')`,
      args: [OWNER],
    });
    await client.execute({
      sql: `INSERT INTO collection_items (id, user_id, slug, acquired_on)
            VALUES ('ci-1', ?, 'wingspan', '2026-09-01')`,
      args: [OWNER],
    });
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("flags a dated, unplayed copy as new", async () => {
    expect(await ownerItems(OWNER)).toEqual([
      { slug: "wingspan", acquiredOn: "2026-09-01", isNew: true },
    ]);
  });

  it("clears the flag once the owner has played it since acquiring", async () => {
    await recordPlay("2026-09-05 20:00:00", [OWNER, FRIEND]);
    expect((await ownerItems(OWNER))[0]?.isNew).toBe(false);
  });

  it("ignores plays from before the acquisition", async () => {
    await recordPlay("2026-08-20 20:00:00", [OWNER]);
    expect((await ownerItems(OWNER))[0]?.isNew).toBe(true);
  });

  it("ignores matches the owner did not take part in", async () => {
    await recordPlay("2026-09-05 20:00:00", [FRIEND]);
    expect((await ownerItems(OWNER))[0]?.isNew).toBe(true);
  });

  it("keeps the flag public while hiding the date from other members", async () => {
    expect(await ownerItems(FRIEND)).toEqual([{ slug: "wingspan", acquiredOn: null, isNew: true }]);
  });
});
