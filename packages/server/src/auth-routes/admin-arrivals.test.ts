// Publishing an arrival is a claim: the purchasers' inventories and the
// arrival row land together or not at all, a duplicate publish of a slug
// changes nothing, and a lost inventory race is retried rather than
// overwritten. Photos go through the real sharp pipeline.
//
// Real migration chain, in-memory libsql, the real route behind an admin stub.

import { AdminArrivalsStateSchema } from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEnv } from "../auth/types.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminArrivalRoutes } = await import("./admin-arrivals.ts");

const ADMIN = "admin-1";
const M1 = "member-1";
const M2 = "member-2";
const GUEST = "guest-1";
const CANDIDATES = ["7-wonders", "aeons-end", "azul", "catan"];
const QUIET = { info() {}, warn() {} };

const PHOTO = `data:image/png;base64,${(
  await sharp({ create: { width: 64, height: 80, channels: 3, background: "#4488ff" } })
    .png()
    .toBuffer()
).toString("base64")}`;

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin/arrivals", adminArrivalRoutes);
  return a;
}

function publish(a: Hono<AdminEnv>, body: object) {
  return a.request("/api/admin/arrivals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const game = (slug: string, purchaserUserId: string, photo = PHOTO) => ({
  slug,
  purchaserUserId,
  photo,
});

describe("/api/admin/arrivals", () => {
  let client: Client;
  let pollId: number;

  async function addUser(id: string, opts: { guest?: boolean; role?: string } = {}) {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", guest, role)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?, ?)`,
      args: [id, id, `${id}@example.com`, opts.guest ? 1 : 0, opts.role ?? "user"],
    });
  }

  async function inventory(userId: string): Promise<string[]> {
    const { rows } = await client.execute({
      sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
      args: [userId],
    });
    return rows[0] ? (JSON.parse(String(rows[0].game_slugs_json)) as string[]) : [];
  }

  async function count(table: string, where = "1", args: (string | number)[] = []) {
    const { rows } = await client.execute({
      sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
      args,
    });
    return Number(rows[0]?.n);
  }

  async function activity(
    type: string,
  ): Promise<{ user: string; meta: Record<string, unknown> }[]> {
    const { rows } = await client.execute({
      sql: "SELECT user_id, meta_json FROM activity_log WHERE type = ? ORDER BY id",
      args: [type],
    });
    return rows.map((r) => ({
      user: String(r.user_id),
      meta: JSON.parse(String(r.meta_json)) as Record<string, unknown>,
    }));
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(ADMIN, { role: "admin" });
    await addUser(M1);
    await addUser(M2);
    await addUser(GUEST, { guest: true });
    const created = await client.execute({
      sql: `INSERT INTO purchase_polls (candidate_slugs_json, required_voters, closed_at, winner_slug)
            VALUES (?, 2, datetime('now'), 'azul') RETURNING id`,
      args: [JSON.stringify(CANDIDATES)],
    });
    pollId = Number(created.rows[0]?.id);
    for (const [user, slug] of [
      [M1, "azul"],
      [M2, "azul"],
      [M2, "catan"],
    ]) {
      await client.execute({
        sql: "INSERT INTO purchase_poll_votes (poll_id, user_id, slug) VALUES (?, ?, ?)",
        args: [pollId, user, slug],
      });
    }
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("publishes games to their purchasers' collections with processed photos", async () => {
    const res = await publish(app(), {
      pollId,
      games: [game("azul", M1), game("catan", M2)],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; arrivalId: string };
    expect(body.ok).toBe(true);

    expect(await inventory(M1)).toEqual(["azul"]);
    expect(await inventory(M2)).toEqual(["catan"]);

    const { rows } = await client.execute({
      sql: `SELECT slug, position, purchaser_user_id, photo, photo_placeholder, photo_w, photo_h
              FROM purchase_arrival_games WHERE arrival_id = ? ORDER BY position`,
      args: [body.arrivalId],
    });
    expect(rows.map((r) => [r.slug, r.position, r.purchaser_user_id])).toEqual([
      ["azul", 0, M1],
      ["catan", 1, M2],
    ]);
    for (const r of rows) {
      expect(String(r.photo).startsWith("data:image/webp;base64,")).toBe(true);
      expect(String(r.photo_placeholder).startsWith("data:image/webp;base64,")).toBe(true);
      expect([r.photo_w, r.photo_h]).toEqual([1280, 1600]);
    }

    await vi.waitFor(async () => {
      expect(await activity("arrival-published")).toHaveLength(1);
      expect(await activity("arrival-received")).toHaveLength(2);
    });
    expect((await activity("arrival-published"))[0]).toMatchObject({
      user: ADMIN,
      meta: {
        pollId,
        games: [
          { slug: "azul", purchaserUserId: M1 },
          { slug: "catan", purchaserUserId: M2 },
        ],
      },
    });
    expect((await activity("arrival-received")).map((a) => a.user)).toEqual([M1, M2]);
  });

  it("keeps an already-owned game deduped and in place", async () => {
    await client.execute({
      sql: "INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, ?)",
      args: [M1, JSON.stringify(["catan", "azul"])],
    });
    expect((await publish(app(), { pollId, games: [game("azul", M1)] })).status).toBe(200);
    expect(await inventory(M1)).toEqual(["catan", "azul"]);
  });

  it("refuses an open or unknown poll, a non-candidate, and a non-member purchaser", async () => {
    const open = await client.execute({
      sql: "INSERT INTO purchase_polls (candidate_slugs_json, required_voters) VALUES (?, 2) RETURNING id",
      args: [JSON.stringify(CANDIDATES)],
    });
    const openId = Number(open.rows[0]?.id);
    const a = app();

    const stillOpen = await publish(a, { pollId: openId, games: [game("azul", M1)] });
    expect(stillOpen.status).toBe(409);
    expect(await stillOpen.json()).toMatchObject({ code: "POLL_OPEN" });

    expect((await publish(a, { pollId: 999, games: [game("azul", M1)] })).status).toBe(404);

    const outsider = await publish(a, { pollId, games: [game("wingspan", M1)] });
    expect(outsider.status).toBe(400);
    expect(await outsider.json()).toMatchObject({ code: "NOT_A_CANDIDATE" });

    const guest = await publish(a, { pollId, games: [game("azul", GUEST)] });
    expect(guest.status).toBe(400);
    expect(await guest.json()).toMatchObject({ code: "PURCHASER_NOT_MEMBER" });

    const nobody = await publish(a, { pollId, games: [game("azul", "ghost")] });
    expect(nobody.status).toBe(400);
    expect(await nobody.json()).toMatchObject({ code: "PURCHASER_NOT_FOUND" });

    expect(await count("purchase_arrivals")).toBe(0);
    expect(await count("user_inventory")).toBe(0);
  });

  it("rejects an upload that is not an image before writing anything", async () => {
    const res = await publish(app(), {
      pollId,
      games: [game("azul", M1, `data:image/png;base64,${Buffer.from("nope").toString("base64")}`)],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "NOT_AN_IMAGE" });
    expect(await count("purchase_arrivals")).toBe(0);
    expect(await count("user_inventory")).toBe(0);
  });

  it("announces a slug for a poll at most once — even under a concurrent double publish", async () => {
    const a = app();
    expect((await publish(a, { pollId, games: [game("azul", M1)] })).status).toBe(200);
    const again = await publish(a, { pollId, games: [game("azul", M2)] });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "ALREADY_ARRIVED" });
    // The refused publish touched no inventory.
    expect(await inventory(M2)).toEqual([]);

    const responses = await Promise.all([
      publish(a, { pollId, games: [game("catan", M1)] }),
      publish(a, { pollId, games: [game("catan", M2)] }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await count("purchase_arrival_games", "slug = 'catan'")).toBe(1);
    // Straggler games from the same poll are allowed later.
    expect(await count("purchase_arrivals")).toBe(2);
  });

  it("retries when a collection changes between the read and the write", async () => {
    // First batch only: an inventory row appears after the route read "no row".
    let injected = false;
    const real = client;
    db.current = new Proxy(real, {
      get(target, prop) {
        if (prop === "batch" && !injected) {
          return async (...args: Parameters<Client["batch"]>) => {
            injected = true;
            await target.execute({
              sql: "INSERT INTO user_inventory (user_id, game_slugs_json) VALUES (?, ?)",
              args: [M1, JSON.stringify(["catan"])],
            });
            return target.batch(...args);
          };
        }
        // The client's methods use private fields, so they must run with the
        // real instance as `this`, never the proxy.
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const res = await publish(app(), { pollId, games: [game("azul", M1)] });
    expect(res.status).toBe(200);
    expect(injected).toBe(true);
    expect(await inventory(M1)).toEqual(["catan", "azul"]);
    expect(await count("purchase_arrivals")).toBe(1);
  });

  it("retracts by hard delete, cascading games and seen-marks but not inventories", async () => {
    const a = app();
    const res = await publish(a, { pollId, games: [game("azul", M1)] });
    const { arrivalId } = (await res.json()) as { arrivalId: string };
    await client.execute({
      sql: "INSERT INTO purchase_arrival_seen (arrival_id, user_id) VALUES (?, ?)",
      args: [arrivalId, M2],
    });

    const gone = await a.request(`/api/admin/arrivals/${arrivalId}`, { method: "DELETE" });
    expect(gone.status).toBe(200);
    expect(await count("purchase_arrivals")).toBe(0);
    expect(await count("purchase_arrival_games")).toBe(0);
    expect(await count("purchase_arrival_seen")).toBe(0);
    expect(await inventory(M1)).toEqual(["azul"]);

    expect((await a.request(`/api/admin/arrivals/${arrivalId}`, { method: "DELETE" })).status).toBe(
      404,
    );
    await vi.waitFor(async () => {
      expect(await activity("arrival-retracted")).toHaveLength(1);
    });
  });

  it("lists closed polls with what has been announced, and the arrivals with their votes", async () => {
    const a = app();
    await publish(a, { pollId, games: [game("azul", M1)] });
    const res = await a.request("/api/admin/arrivals");
    expect(res.status).toBe(200);
    const state = AdminArrivalsStateSchema.parse(await res.json());

    expect(state.polls).toHaveLength(1);
    expect(state.polls[0]).toMatchObject({
      id: pollId,
      winnerSlug: "azul",
      voterCount: 2,
      arrivedSlugs: ["azul"],
    });
    expect(state.polls[0]?.tally[0]).toMatchObject({ slug: "azul", votes: 2, voterIds: [M1, M2] });

    expect(state.arrivals).toHaveLength(1);
    expect(state.arrivals[0]).toMatchObject({ pollId, publishedBy: ADMIN, seenBy: 0 });
    expect(state.arrivals[0]?.games[0]).toMatchObject({
      slug: "azul",
      purchaserUserId: M1,
      votes: 2,
      width: 1280,
      height: 1600,
    });
    expect(state.arrivals[0]?.games[0]?.photoUrl).toMatch(/^\/api\/arrivals\/[^/]+\/photos\/azul$/);
    expect(Object.keys(state.players).sort()).toEqual([ADMIN, M1, M2].sort());
  });
});
