// The /games "Owned by" filter's data source: registered members with a
// non-empty derived library. Real migration chain, in-memory libsql.

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

const { userInventoryRoutes } = await import("./user-inventory.ts");

const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: "viewer", role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/user", userInventoryRoutes);
  return a;
}

describe("GET /api/user/inventory/owners", () => {
  let client: Client;

  async function addUser(id: string, name: string, flags: { guest?: number } = {}) {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", guest)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
      args: [id, name, `${id}@example.com`, flags.guest ?? 0],
    });
  }

  async function own(userId: string, slugs: string[]) {
    await client.execute({
      sql: "INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, ?)",
      args: [userId, JSON.stringify(slugs)],
    });
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("lists members who own games, derived and sorted by name, skipping empty and guest libraries", async () => {
    await addUser("b", "bob");
    await addUser("a", "Ada");
    await addUser("e", "Empty");
    await addUser("g", "Guest", { guest: 1 });
    await own("b", ["deck-french-suited"]);
    await own("a", ["wingspan"]);
    await own("e", []);
    await own("g", ["catan"]);

    const res = await app().request("/api/user/inventory/owners");
    expect(res.status).toBe(200);
    const { owners } = (await res.json()) as { owners: { id: string; slugs: string[] }[] };
    expect(owners.map((o) => o.id)).toEqual(["a", "b"]);
    expect(owners[0].slugs).toEqual(["wingspan"]);
    expect(owners[1].slugs).toContain("durak");
    expect(owners[1].slugs).not.toContain("deck-french-suited");
  });
});
