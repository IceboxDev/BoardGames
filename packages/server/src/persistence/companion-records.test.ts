// Companion records: a finished Clocktower game or an ended D&D session,
// saved by the device that ran it. Idempotent per client id, scoped to the
// member, and strictly validated.

import {
  CompanionRecordListSchema,
  ErrorResponseSchema,
  SaveCompanionRecordResponseSchema,
} from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { companionRecords } from "../migrations/0053-companion-records.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { persistenceRoutes } = await import("./routes.ts");

function app(userId = "u1") {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/games", persistenceRoutes);
  return a;
}

const BOTC = "/api/games/blood-on-the-clocktower/companion-records";
const DND = "/api/games/dungeons-and-dragons/companion-records";

const botc = {
  game: "blood-on-the-clocktower",
  edition: "trouble-brewing",
  storyteller: "Mantas",
  players: ["Ana", "Ben", "Cleo", "Dan", "Eve"].map((name, seat) => ({
    seat,
    name,
    character: seat === 0 ? "imp" : seat === 1 ? "poisoner" : "empath",
    alignment: seat < 2 ? "evil" : "good",
    alive: true,
  })),
  winner: "good",
  reason: "the Demon is dead",
  days: 2,
  startedAt: "2026-10-10T19:00:00.000Z",
  endedAt: "2026-10-10T20:00:00.000Z",
};

const dnd = {
  game: "dungeons-and-dragons",
  campaignId: "c1",
  campaignTitle: "Lost Mine",
  campaignKind: "campaign",
  partyId: "p1",
  partyName: "Tuesday",
  members: [
    {
      characterId: "ch1",
      name: "Thorin",
      playerName: "Ben",
      race: "Dwarf",
      class: "Fighter",
      level: 3,
    },
  ],
  waypoint: { index: 0, of: 4, title: "Goblin Arrows" },
  loggedEntries: 5,
  startedAt: "2026-10-10T18:00:00.000Z",
  endedAt: "2026-10-10T21:30:00.000Z",
};

function post(path: string, body: unknown, userId?: string) {
  return app(userId).request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function list(path: string, userId?: string) {
  const res = await app(userId).request(path);
  expect(res.status).toBe(200);
  return CompanionRecordListSchema.parse(await res.json());
}

async function saved(res: Response) {
  return SaveCompanionRecordResponseSchema.parse(await res.json());
}

async function activityRows() {
  const { rows } = await (db.current as Client).execute(
    "SELECT user_id, type, meta_json FROM activity_log ORDER BY id",
  );
  return rows.map((r) => ({
    user: r.user_id,
    type: r.type,
    meta: JSON.parse(String(r.meta_json)),
  }));
}

describe("companion records", () => {
  beforeEach(async () => {
    db.current = createClient({ url: ":memory:" });
    // The migration's own table, without the FK target (no `user` table here).
    for (const sql of companionRecords.statements) {
      await db.current.execute(sql.replace(/REFERENCES "user"\(id\) ON DELETE CASCADE/, ""));
    }
    await db.current.execute(`CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL, type TEXT NOT NULL, meta_json TEXT NOT NULL, logged_at_ms INTEGER)`);
  });

  afterEach(() => {
    db.current?.close();
  });

  it("records a Clocktower game once and lists it for its Storyteller", async () => {
    const first = await post(BOTC, { clientId: "game-0001", record: botc });
    expect(first.status).toBe(201);
    const result = await saved(first);
    expect(result).toMatchObject({ ok: true, created: true });

    const entries = await list(BOTC);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: result.id, clientId: "game-0001", record: botc });

    await vi.waitFor(async () => expect(await activityRows()).toHaveLength(1));
    expect((await activityRows())[0]).toEqual({
      user: "u1",
      type: "companion-recorded",
      meta: { slug: "blood-on-the-clocktower", winner: "good", players: 5, minutes: 60 },
    });
  });

  it("replaces on a retry or a corrected winner — never a second row", async () => {
    const first = await saved(await post(BOTC, { clientId: "game-0001", record: botc }));
    const again = await post(BOTC, {
      clientId: "game-0001",
      record: { ...botc, winner: "evil", reason: "two players remain" },
    });
    expect(again.status).toBe(200);
    expect(await saved(again)).toEqual({ ok: true, id: first.id, created: false });

    const entries = await list(BOTC);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.record).toMatchObject({ winner: "evil" });
    // Only the first save is an activity.
    await new Promise((r) => setTimeout(r, 20));
    expect(await activityRows()).toHaveLength(1);
  });

  it("records a D&D session and keeps games apart", async () => {
    expect((await post(DND, { clientId: "session-01", record: dnd })).status).toBe(201);
    expect((await post(BOTC, { clientId: "game-0001", record: botc })).status).toBe(201);
    const sessions = await list(DND);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.record).toMatchObject({ partyName: "Tuesday" });
  });

  it("shows a member only their own records", async () => {
    await post(BOTC, { clientId: "game-0001", record: botc }, "u1");
    // The same client id under another account is that account's own record.
    expect((await post(BOTC, { clientId: "game-0001", record: botc }, "u2")).status).toBe(201);
    expect(await list(BOTC, "u3")).toEqual([]);
    expect(await list(BOTC, "u2")).toHaveLength(1);
  });

  it("refuses a record for the wrong game, an unknown game, or a bad body", async () => {
    const wrong = await post(DND, { clientId: "game-0001", record: botc });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "BAD_REQUEST" });

    expect(
      (await post("/api/games/chess/companion-records", { clientId: "game-0001", record: botc }))
        .status,
    ).toBe(404);
    expect((await app().request("/api/games/chess/companion-records")).status).toBe(404);

    const bad = await post(BOTC, { clientId: "game-0001", record: { ...botc, winner: "nobody" } });
    expect(bad.status).toBe(400);
    expect(ErrorResponseSchema.parse(await bad.json()).error).toMatch(/^record\.winner/);
  });

  it("never lets one game's id overwrite another game's record", async () => {
    await post(BOTC, { clientId: "shared-id", record: botc });
    const clash = await post(DND, { clientId: "shared-id", record: dnd });
    expect(clash.status).toBe(409);
    const entries = await list(BOTC);
    expect(entries[0]?.record.game).toBe("blood-on-the-clocktower");
  });

  it("skips a stored row that no longer parses instead of failing the list", async () => {
    await post(BOTC, { clientId: "game-0001", record: botc });
    await (db.current as Client).execute(
      `INSERT INTO companion_records (user_id, game_slug, client_id, record_json, ended_at)
       VALUES ('u1', 'blood-on-the-clocktower', 'broken-01', '{"game":"x"}', '2027-01-01T00:00:00Z')`,
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const entries = await list(BOTC);
    spy.mockRestore();
    expect(entries).toHaveLength(1);
  });
});
