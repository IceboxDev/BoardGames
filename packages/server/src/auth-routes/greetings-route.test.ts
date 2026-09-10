// The greeting ladder: announce → arrival → reminder → skill queue, with the
// online-mode gate in front. The arrival is one-shot per member, oldest
// unseen first, inside a freshness window, and carries voters as FACES only.
//
// Real migration chain, in-memory libsql, the real route behind a viewer
// stub. The skill queue is short-circuited to "nothing pending" — its own
// tests live beside lib/greetings.ts.

import { AppGreetingResponseSchema } from "@boardgames/core/protocol";
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
vi.mock("../lib/skill-ratings.ts", () => ({ ensureSkillState: async () => null }));

const { greetingsRoutes } = await import("./greetings.ts");

const ADMIN = "admin-1";
const M1 = "member-1";
const M2 = "member-2";
const QUIET = { info() {}, warn() {} };
const PLACEHOLDER = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4";

type Viewer = { id: string; role?: string; onlineMode: "offline" | "online" | "both" };

function app(viewer: Viewer) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { role: "user", ...viewer } as unknown as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/greetings", greetingsRoutes);
  return a;
}

async function greeting(a: Hono<AppEnv>) {
  const res = await a.request("/api/greetings");
  expect(res.status).toBe(200);
  return AppGreetingResponseSchema.parse(await res.json());
}

function ack(a: Hono<AppEnv>, body: object) {
  return a.request("/api/greetings/ack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/greetings ladder", () => {
  let client: Client;
  let seq = 0;

  async function addUser(id: string, role = "user", accent: string | null = null) {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
      args: [id, `Name ${id}`, `${id}@example.com`, role],
    });
    if (accent) {
      await client.execute({
        sql: "INSERT INTO user_profiles (user_id, accent_hex) VALUES (?, ?)",
        args: [id, accent],
      });
    }
  }

  async function poll(opts: { closed?: boolean } = {}): Promise<number> {
    const { rows } = await client.execute({
      sql: `INSERT INTO purchase_polls (candidate_slugs_json, required_voters, closed_at, winner_slug)
            VALUES ('["azul","catan"]', 5, ?, ?) RETURNING id`,
      args: opts.closed ? ["2026-09-01 10:00:00", "azul"] : [null, null],
    });
    return Number(rows[0]?.id);
  }

  async function vote(pollId: number, userId: string, slug: string) {
    await client.execute({
      sql: "INSERT INTO purchase_poll_votes (poll_id, user_id, slug) VALUES (?, ?, ?)",
      args: [pollId, userId, slug],
    });
  }

  async function arrival(
    pollId: number,
    games: { slug: string; purchaser: string }[],
    publishedAt?: string,
  ): Promise<string> {
    const n = ++seq;
    const id = `arr-${n}`;
    // Distinct, ascending publish times so "oldest first" is deterministic.
    publishedAt ??= `datetime('now', '-${100 - n} minutes')`;
    await client.execute({
      sql: `INSERT INTO purchase_arrivals (id, poll_id, published_at, published_by)
            VALUES (?, ?, ${publishedAt}, ?)`,
      args: [id, pollId, ADMIN],
    });
    for (const [position, g] of games.entries()) {
      await client.execute({
        sql: `INSERT INTO purchase_arrival_games
                (arrival_id, slug, position, purchaser_user_id, photo, photo_placeholder,
                 photo_w, photo_h, photo_bytes)
              VALUES (?, ?, ?, ?, 'data:image/webp;base64,AA==', ?, 1280, 1600, 1)`,
        args: [id, g.slug, position, g.purchaser, PLACEHOLDER],
      });
    }
    return id;
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(ADMIN, "admin");
    await addUser(M1, "user", "#d36830");
    await addUser(M2);
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("serves nothing to an online-only account", async () => {
    await arrival(await poll({ closed: true }), [{ slug: "azul", purchaser: M1 }]);
    expect((await greeting(app({ id: M2, onlineMode: "online" }))).greeting).toBeNull();
  });

  it("is silent when a poll has merely closed — the reveal card is gone", async () => {
    const id = await poll({ closed: true });
    await vote(id, M1, "azul");
    expect((await greeting(app({ id: M2, onlineMode: "both" }))).greeting).toBeNull();
    // The retired ack kind is refused at the boundary.
    const res = await ack(app({ id: M2, onlineMode: "both" }), {
      kind: "purchase-vote-result",
      pollId: id,
      action: "later",
    });
    expect(res.status).toBe(400);
  });

  it("ranks announce first, then the arrival above the reminder, then the reminder", async () => {
    // The vote surfaces look at the LATEST poll, so the open one goes last.
    const closed = await poll({ closed: true });
    const open = await poll();
    await arrival(closed, [{ slug: "azul", purchaser: M1 }]);
    const a = app({ id: M2, onlineMode: "both" });

    const first = await greeting(a);
    expect(first.greeting?.kind).toBe("purchase-vote-announce");
    expect(
      (await ack(a, { kind: "purchase-vote-announce", pollId: open, action: "later" })).status,
    ).toBe(200);

    const second = await greeting(a);
    expect(second.greeting?.kind).toBe("arrival");
    expect(second.players).toEqual({});
    if (second.greeting?.kind !== "arrival") throw new Error("expected arrival");
    expect(
      (await ack(a, { kind: "arrival", arrivalId: second.greeting.arrivalId, action: "cta" }))
        .status,
    ).toBe(200);

    const third = await greeting(a);
    expect(third.greeting?.kind).toBe("purchase-vote-reminder");
    // The arrival was one-shot: acking again is a no-op and it never returns.
    expect((await greeting(a)).greeting?.kind).toBe("purchase-vote-reminder");
  });

  it("skips the reminder for an admin but still serves the arrival", async () => {
    const closed = await poll({ closed: true });
    await poll();
    await arrival(closed, [{ slug: "azul", purchaser: M1 }]);
    const a = app({ id: ADMIN, role: "admin", onlineMode: "both" });
    expect((await greeting(a)).greeting?.kind).toBe("purchase-vote-announce");
    // Announce acked → the arrival, then nothing (no reminder for admins).
    const { rows } = await client.execute("SELECT id FROM purchase_polls WHERE closed_at IS NULL");
    await ack(a, { kind: "purchase-vote-announce", pollId: Number(rows[0]?.id), action: "later" });
    const served = await greeting(a);
    expect(served.greeting?.kind).toBe("arrival");
    if (served.greeting?.kind !== "arrival") throw new Error("expected arrival");
    await ack(a, { kind: "arrival", arrivalId: served.greeting.arrivalId, action: "later" });
    expect((await greeting(a)).greeting).toBeNull();
  });

  it("serves the oldest unseen arrival first, within the freshness window, skipping gameless ones", async () => {
    const closed = await poll({ closed: true });
    const stale = await arrival(
      closed,
      [{ slug: "azul", purchaser: M1 }],
      "datetime('now', '-61 days')",
    );
    const older = await arrival(
      closed,
      [{ slug: "catan", purchaser: M2 }],
      "datetime('now', '-2 days')",
    );
    const newer = await arrival(
      closed,
      [{ slug: "azul", purchaser: M2 }],
      "datetime('now', '-1 days')",
    );
    const gameless = await arrival(closed, [], "datetime('now', '-3 days')");
    const a = app({ id: M1, onlineMode: "both" });

    const first = await greeting(a);
    if (first.greeting?.kind !== "arrival") throw new Error("expected arrival");
    expect(first.greeting.arrivalId).toBe(older);
    await ack(a, { kind: "arrival", arrivalId: older, action: "later" });

    const second = await greeting(a);
    if (second.greeting?.kind !== "arrival") throw new Error("expected arrival");
    expect(second.greeting.arrivalId).toBe(newer);
    await ack(a, { kind: "arrival", arrivalId: newer, action: "later" });

    expect((await greeting(a)).greeting).toBeNull();
    expect([stale, gameless].includes(first.greeting.arrivalId)).toBe(false);
  });

  it("carries purchasers by name and voters as faces only", async () => {
    const closed = await poll({ closed: true });
    await vote(closed, M1, "azul");
    await vote(closed, M2, "azul");
    await vote(closed, M2, "catan");
    await client.execute({
      sql: "UPDATE user SET image = 'data:image/webp;base64,QUJD' WHERE id = ?",
      args: [M2],
    });
    await arrival(closed, [{ slug: "azul", purchaser: M1 }]);

    const served = await greeting(app({ id: M2, onlineMode: "both" }));
    if (served.greeting?.kind !== "arrival") throw new Error("expected arrival");
    const [game] = served.greeting.games;
    expect(game).toMatchObject({
      slug: "azul",
      votes: 2,
      purchaser: { id: M1, name: `Name ${M1}`, image: null, accentHex: "#d36830" },
      width: 1280,
      height: 1600,
    });
    expect(game?.photoUrl).toBe(`/api/arrivals/${served.greeting.arrivalId}/photos/azul`);
    expect(game?.voters).toEqual([
      { image: null, accentHex: "#d36830" },
      { image: "data:image/webp;base64,QUJD", accentHex: null },
    ]);
    for (const voter of game?.voters ?? []) {
      expect(Object.keys(voter).sort()).toEqual(["accentHex", "image"]);
    }
    expect(served.greeting.totals).toEqual({ voterCount: 2, votesCast: 3 });
  });

  it("records the ack in the activity trail with the arrival id", async () => {
    const closed = await poll({ closed: true });
    const id = await arrival(closed, [{ slug: "azul", purchaser: M1 }]);
    const a = app({ id: M2, onlineMode: "both" });
    expect((await ack(a, { kind: "arrival", arrivalId: id, action: "cta" })).status).toBe(200);
    await vi.waitFor(async () => {
      const { rows } = await client.execute(
        "SELECT user_id, meta_json FROM activity_log WHERE type = 'greeting-response'",
      );
      expect(rows).toHaveLength(1);
      expect(JSON.parse(String(rows[0]?.meta_json))).toEqual({
        kind: "arrival",
        action: "cta",
        arrivalId: id,
      });
    });
    // Acking a retracted arrival is a harmless no-op, not an FK error.
    await client.execute({ sql: "DELETE FROM purchase_arrivals WHERE id = ?", args: [id] });
    expect((await ack(a, { kind: "arrival", arrivalId: id, action: "later" })).status).toBe(200);
  });
});
