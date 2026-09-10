// The photo route serves the stored webp bytes with a forever cache header
// — arrivals are immutable, so the path is the cache key.

import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { arrivalRoutes } = await import("./arrivals.ts");

const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: "viewer", role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/arrivals", arrivalRoutes);
  return a;
}

describe("GET /api/arrivals/:id/photos/:slug", () => {
  let client: Client;
  let webp: Buffer;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await client.execute(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('buyer', 'Buyer', 'buyer@example.com', 0, '2020-01-01', '2020-01-01')`,
    );
    const poll = await client.execute(
      `INSERT INTO purchase_polls (candidate_slugs_json, required_voters, closed_at, winner_slug)
       VALUES ('["azul"]', 1, datetime('now'), 'azul') RETURNING id`,
    );
    await client.execute({
      sql: "INSERT INTO purchase_arrivals (id, poll_id, published_by) VALUES ('arr-1', ?, NULL)",
      args: [Number(poll.rows[0]?.id)],
    });
    webp = await sharp({ create: { width: 8, height: 10, channels: 3, background: "#ff8800" } })
      .webp()
      .toBuffer();
    await client.execute({
      sql: `INSERT INTO purchase_arrival_games
              (arrival_id, slug, position, purchaser_user_id, photo, photo_placeholder,
               photo_w, photo_h, photo_bytes)
            VALUES ('arr-1', 'azul', 0, 'buyer', ?, 'data:image/webp;base64,AA==', 8, 10, ?)`,
      args: [`data:image/webp;base64,${webp.toString("base64")}`, webp.byteLength],
    });
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("returns the webp bytes as an immutable, private image", async () => {
    const res = await app().request("/api/arrivals/arr-1/photos/azul");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).equals(webp)).toBe(true);
  });

  it("404s an unknown arrival or slug", async () => {
    const a = app();
    expect((await a.request("/api/arrivals/arr-1/photos/catan")).status).toBe(404);
    expect((await a.request("/api/arrivals/nope/photos/azul")).status).toBe(404);
  });
});
