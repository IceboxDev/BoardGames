// A night with its game set in advance (a campaign's next session, migration
// 0067): locked with `fixedGameSlug`, it is sealed at once, its winner is
// that game whatever was hyped, nobody can vote, an edit that leaves the
// field out keeps it and `null` clears it. Plus the history list's `?game=`
// filter the campaign thread reads its sessions' matches from.

import { AvailableGamesSchema, CalendarLocksSchema } from "@boardgames/core/protocol";
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

const { adminCalendarLocksRoutes, calendarLocksRoutes } = await import("./calendar-locks.ts");
const { matchHistoryRoutes } = await import("./match-history.ts");

const ADMIN = "admin-1";
const HOST = "host-1";
const A = "guest-a";
const DATE = "2999-06-06";
const QUIET = { info() {}, warn() {} };

function app(viewer: { id: string; role?: string }) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", {
      role: "user",
      onlineMode: "both",
      ...viewer,
    } as unknown as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/calendar", calendarLocksRoutes);
  a.route("/api/admin/calendar", adminCalendarLocksRoutes);
  a.route("/api/history", matchHistoryRoutes);
  return a;
}
const admin = () => app({ id: ADMIN, role: "admin" });
const as = (id: string) => app({ id });
const post = (a: Hono<AppEnv>, path: string, body: object) =>
  a.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("nights with the game set in advance", () => {
  let client: Client;

  async function addUser(id: string, role = "user") {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role, guest)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?, 0)`,
      args: [id, `Name ${id}`, `${id}@example.com`, role],
    });
  }

  async function lock(over: Record<string, unknown> = {}) {
    const res = await post(admin(), "/api/admin/calendar/lock", {
      date: DATE,
      hostUserId: HOST,
      hostName: "Name host-1",
      eventTime: "18:15",
      ...over,
    });
    return res;
  }

  async function locks() {
    const res = await as(A).request("/api/calendar/locks");
    expect(res.status).toBe(200);
    return CalendarLocksSchema.parse(await res.json());
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(ADMIN, "admin");
    await addUser(HOST);
    await addUser(A);
    await client.execute({
      sql: "INSERT INTO user_availability_days (user_id, date_key, status) VALUES (?, ?, 'can'), (?, ?, 'can')",
      args: [HOST, DATE, A, DATE],
    });
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("seals the night as that game and refuses votes", async () => {
    expect((await lock({ fixedGameSlug: "bomb-busters" })).status).toBe(200);
    const night = (await locks())[DATE];
    expect(night?.fixedGameSlug).toBe("bomb-busters");
    expect(night?.topGameSlug).toBe("bomb-busters");
    expect(night?.picksLockedAt).not.toBeNull();

    const res = await post(as(A), "/api/calendar/games/reaction", {
      date: DATE,
      slug: "azul",
      reaction: "hype",
      on: true,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code?: string }).code).toBe("GAME_FIXED");

    const games = await as(A).request(`/api/calendar/games?date=${DATE}`);
    const body = AvailableGamesSchema.parse(await games.json());
    expect(body.topSlugs).toEqual(["bomb-busters"]);
    expect(body.viewerCanReact).toBe(false);
  });

  it("keeps the game on an edit that leaves it out, clears it with null", async () => {
    await lock({ fixedGameSlug: "bomb-busters" });
    await lock({ eventTime: "19:00" });
    expect((await locks())[DATE]?.fixedGameSlug).toBe("bomb-busters");
    await lock({ fixedGameSlug: null });
    const night = (await locks())[DATE];
    expect(night?.fixedGameSlug).toBeNull();
    // Unsetting the game doesn't unseal a night that was sealed.
    expect(night?.picksLockedAt).not.toBeNull();
  });

  it("refuses a game that isn't in the catalog", async () => {
    const res = await lock({ fixedGameSlug: "not-a-game" });
    expect(res.status).toBe(400);
  });

  it("a plain lock stays a voting night", async () => {
    await lock();
    const night = (await locks())[DATE];
    expect(night?.fixedGameSlug).toBeNull();
    expect(night?.picksLockedAt).toBeNull();
  });

  it("history lists one game's matches with ?game=", async () => {
    const outcome = JSON.stringify({
      kind: "coop",
      participants: [{ userId: A, displayName: "A" }],
      outcome: "win",
    });
    for (const [i, slug] of ["bomb-busters", "azul", "bomb-busters"].entries()) {
      await client.execute({
        sql: `INSERT INTO match_results (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, recorded_at, updated_at, sort_order)
              VALUES (NULL, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0)`,
        args: [`2999-01-0${i + 1}T12:00:00.000Z`, slug, slug, outcome, ADMIN],
      });
    }
    const res = await as(A).request("/api/history?game=bomb-busters");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: { gameSlug: string }[] };
    expect(body.matches.map((m) => m.gameSlug)).toEqual(["bomb-busters", "bomb-busters"]);
  });
});
