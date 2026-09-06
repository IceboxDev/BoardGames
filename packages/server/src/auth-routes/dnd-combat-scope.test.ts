// POST /api/dnd/parties/:id/combat takes `characterId` from the request body
// and, when the fight ends, writes that character's persistent state. This
// pins the guard that an id outside the party is rejected up front — a DM
// can only name characters in their own party, never another DM's rows.
//
// Real migration chain, in-memory libsql, the real route module behind a
// stub that supplies the viewer.

import { randomUUID } from "node:crypto";
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

const { dndCampaignRoutes } = await import("./dnd-campaigns.ts");
const { insertCampaign } = await import("../lib/dnd-campaigns-db.ts");
const { insertCharacter } = await import("../lib/dnd-characters-db.ts");
const { insertParty } = await import("../lib/dnd-parties-db.ts");

const OWNER = "dm-owner";
const INTRUDER = "dm-intruder";
const QUIET = { info() {}, warn() {} };

function app(viewerId: string) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: viewerId, role: "user" } as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/dnd", dndCampaignRoutes);
  return a;
}

async function addUser(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
    args: [id, id, `${id}@example.com`],
  });
}

async function seedParty(client: Client, userId: string) {
  const campaignId = randomUUID();
  await insertCampaign({ id: campaignId, userId, sourceFilename: "m.pdf", sourceSizeBytes: 1 });
  const party = await insertParty({ campaignId, userId, name: `${userId}'s party` });
  const characterId = randomUUID();
  await insertCharacter({
    id: characterId,
    campaignId,
    partyId: party.id,
    userId,
    sourceFilename: "c.pdf",
    sourceSizeBytes: 1,
  });
  await client.execute({
    sql: "UPDATE dnd_characters SET status = 'ready' WHERE id = ?",
    args: [characterId],
  });
  return { partyId: party.id, characterId };
}

function startCombat(a: Hono<AppEnv>, partyId: string, characterId: string) {
  return a.request(`/api/dnd/parties/${partyId}/combat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nodeId: "node-1",
      combatants: [
        { name: "Vex", kind: "pc", characterId, count: 1, initiative: 15, maxHp: 20 },
        { name: "Wolf", kind: "enemy", characterId: null, count: 2, initiative: 10, maxHp: 11 },
      ],
    }),
  });
}

describe("POST /api/dnd/parties/:id/combat", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(client, OWNER);
    await addUser(client, INTRUDER);
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("rejects a characterId that belongs to another DM's party", async () => {
    const victim = await seedParty(client, OWNER);
    const attacker = await seedParty(client, INTRUDER);

    const res = await startCombat(app(INTRUDER), attacker.partyId, victim.characterId);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "UNKNOWN_CHARACTER" });

    const { rows } = await client.execute("SELECT COUNT(*) AS n FROM dnd_combats");
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it("accepts a characterId from the caller's own party", async () => {
    const own = await seedParty(client, OWNER);
    const res = await startCombat(app(OWNER), own.partyId, own.characterId);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { combat: { combatants: { characterId: string | null }[] } };
    expect(body.combat.combatants.map((c) => c.characterId)).toEqual([own.characterId, null]);
  });
});
