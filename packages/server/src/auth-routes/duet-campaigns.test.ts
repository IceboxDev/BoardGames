// Duet campaigns: members only, progress derived from games, table records
// checked against the map, and a campaign mission's start check + end record
// (`lib/duet-campaign/missions.ts`).
//
// Real migration chain, in-memory libsql, the real routes behind an auth stub.

import {
  CampaignDetailResponseSchema,
  CampaignListResponseSchema,
} from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";
import { activityWritesSettled } from "../lib/activity-log.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { duetCampaignRoutes } = await import("./duet-campaigns.ts");
const { prepareDuetConfig, recordDuetMission } = await import("../lib/duet-campaign/missions.ts");

const ME = "member-1";
const PARTNER = "member-2";
const STRANGER = "member-3";
const QUIET = { info() {}, warn() {} };

function app(userId: string) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/games/codenames-duet/campaigns", duetCampaignRoutes);
  return a;
}

const send = (method: string, path: string, body?: unknown, userId = ME) =>
  app(userId).request(`/api/games/codenames-duet/campaigns${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const detail = async (res: Response) =>
  CampaignDetailResponseSchema.parse(await res.json()).campaign;

async function newCampaign(partner: unknown = { kind: "member", userId: PARTNER }) {
  const res = await send("POST", "", { name: "Night Owls", partner });
  expect(res.status).toBe(201);
  return detail(res);
}

const table = (city: string, won: boolean, clientId = `c-${city}-${won}-${Math.random()}`) => ({
  clientId: clientId.replace(/[^A-Za-z0-9_-]/g, "x").slice(0, 60),
  city,
  won,
});

describe("duet campaign routes", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const id of [ME, PARTNER, STRANGER]) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 'user')`,
        args: [id, id, `${id}@example.com`],
      });
    }
  });

  afterEach(async () => {
    await activityWritesSettled();
    client.close();
    db.current = null;
  });

  it("creates a campaign that belongs to both members and nobody else", async () => {
    const c = await newCampaign();
    expect(c.members.map((m) => m.userId).sort()).toEqual([ME, PARTNER]);
    expect(c).toMatchObject({ cleared: 0, gamesPlayed: 0, partnerKind: "member" });
    const theirs = CampaignListResponseSchema.parse(
      await (await send("GET", "", undefined, PARTNER)).json(),
    );
    expect(theirs.campaigns.map((x) => x.id)).toEqual([c.id]);
    expect((await send("GET", `/${c.id}`, undefined, STRANGER)).status).toBe(404);
    expect(
      (await send("POST", "", { name: "X", partner: { kind: "member", userId: ME } })).status,
    ).toBe(400);
  });

  it("records table games against the map: Prague first, then its neighbours", async () => {
    const c = await newCampaign({ kind: "guest", name: "Ieva" });
    expect((await send("POST", `/${c.id}/games`, table("berlin", true))).status).toBe(400);
    expect((await send("POST", `/${c.id}/games`, table("prague", false))).status).toBe(201);
    const won = await detail(await send("POST", `/${c.id}/games`, table("prague", true)));
    expect(won).toMatchObject({ cleared: 1, gamesPlayed: 2, wins: 1 });
    expect((await send("POST", `/${c.id}/games`, table("berlin", true))).status).toBe(201);
  });

  it("records a retried table game once, and lets only its recorder remove it", async () => {
    const c = await newCampaign();
    const body = table("prague", true, "retry-123456");
    expect((await send("POST", `/${c.id}/games`, body)).status).toBe(201);
    const again = await send("POST", `/${c.id}/games`, body);
    expect(again.status).toBe(200);
    const after = await detail(again);
    expect(after.gamesPlayed).toBe(1);
    const gameId = after.games[0]?.id as string;
    expect((await send("DELETE", `/${c.id}/games/${gameId}`, undefined, PARTNER)).status).toBe(404);
    const removed = await detail(await send("DELETE", `/${c.id}/games/${gameId}`));
    expect(removed.gamesPlayed).toBe(0);
  });

  it("renames and archives; an archived campaign takes no new games", async () => {
    const c = await newCampaign();
    const renamed = await detail(await send("PATCH", `/${c.id}`, { name: "Owls", archived: true }));
    expect(renamed).toMatchObject({ name: "Owls", archived: true });
    expect((await send("POST", `/${c.id}/games`, table("prague", true))).status).toBe(409);
  });

  describe("missions", () => {
    it("start only for members, at an open city, with the map's numbers", async () => {
      const c = await newCampaign();
      const ok = await prepareDuetConfig(
        client,
        { language: "en", timerTokens: 11, mistakes: 9, campaign: { id: c.id, city: "prague" } },
        { humanUserIds: [ME] },
      );
      expect(ok).toMatchObject({
        ok: true,
        config: { language: "en", timerTokens: 9, mistakes: 9, campaign: { city: "prague" } },
      });
      const locked = await prepareDuetConfig(
        client,
        { campaign: { id: c.id, city: "paris" } },
        { humanUserIds: [ME, PARTNER] },
      );
      expect(locked).toMatchObject({ ok: false });
      const stranger = await prepareDuetConfig(
        client,
        { campaign: { id: c.id, city: "prague" } },
        { humanUserIds: [ME, STRANGER] },
      );
      expect(stranger).toMatchObject({
        ok: false,
        reason: expect.stringMatching(/Only the players/),
      });
      const guest = await prepareDuetConfig(
        client,
        { campaign: { id: c.id, city: "prague" } },
        { humanUserIds: [null] },
      );
      expect(guest).toMatchObject({ ok: false });
      const plain = await prepareDuetConfig(client, { timerTokens: 8 }, { humanUserIds: [null] });
      expect(plain).toEqual({ ok: true, config: { timerTokens: 8 } });
    });

    it("a finished mission becomes a game in its campaign, once", async () => {
      const c = await newCampaign();
      const ended = {
        sessionId: "session-abc",
        roomCode: "ROOMAB",
        seatUserIds: [ME, PARTNER],
        replayId: 42,
        endedAt: new Date("2026-11-09T20:00:00.000Z"),
        replayLog: {
          formatVersion: 1,
          seed: 1,
          language: "en",
          ai: [null, null],
          words: Array.from({ length: 25 }, (_, i) => `w${i}`),
          key: Array.from({ length: 25 }, () => ["agent", "agent"]),
          tokensTotal: 9,
          mistakesTotal: 9,
          campaign: { id: c.id, city: "prague" },
          turns: [],
          result: { won: true, reason: "all-found", agentsFound: 15, tokensLeft: 3 },
        },
      };
      await recordDuetMission(client, ended);
      await recordDuetMission(client, ended);
      const after = await detail(await send("GET", `/${c.id}`));
      expect(after.games).toHaveLength(1);
      expect(after.games[0]).toMatchObject({
        city: "prague",
        won: true,
        mode: "online",
        replayId: 42,
        tokensLeft: 3,
      });
      expect(after.cleared).toBe(1);
    });
  });
});
