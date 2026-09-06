// Every D&D write helper binds the owner in its WHERE clause. These tests
// prove it at the database, not the route: each helper is called with a
// foreign `userId` against a row another DM owns, and must report no match
// and leave the row untouched. The same call with the real owner succeeds.
//
// Real migration chain, in-memory libsql, foreign keys ON.

import { randomUUID } from "node:crypto";
import { CharacterSheetSchema } from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const campaigns = await import("./dnd-campaigns-db.ts");
const characters = await import("./dnd-characters-db.ts");
const files = await import("./dnd-files-db.ts");
const parties = await import("./dnd-parties-db.ts");

const OWNER = "dm-owner";
const INTRUDER = "dm-intruder";
const QUIET = { info() {}, warn() {} };

const SHEET = CharacterSheetSchema.parse({
  name: "Vex",
  race: "Tabaxi",
  class: "Rogue",
  level: 3,
  alignment: null,
  abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 12, cha: 14 },
  maxHp: 24,
  armorClass: 14,
  speed: "30 ft",
  proficiencies: [],
  equipment: [],
  spells: [],
  personality: null,
  backstory: null,
});

async function addUser(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
    args: [id, id, `${id}@example.com`],
  });
}

describe("D&D write helpers are owner-scoped at the statement", () => {
  let client: Client;
  let campaignId: string;
  let characterId: string;
  let fileId: string;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(client, OWNER);
    await addUser(client, INTRUDER);

    campaignId = randomUUID();
    await campaigns.insertCampaign({
      id: campaignId,
      userId: OWNER,
      sourceFilename: "module.pdf",
      sourceSizeBytes: 10,
    });
    const party = await parties.insertParty({ campaignId, userId: OWNER, name: "Party" });
    characterId = randomUUID();
    await characters.insertCharacter({
      id: characterId,
      campaignId,
      partyId: party.id,
      userId: OWNER,
      sourceFilename: "vex.pdf",
      sourceSizeBytes: 10,
    });
    fileId = await files.insertFile({
      userId: OWNER,
      campaignId,
      kind: "module",
      filename: "module.pdf",
      base64: "QUJD",
      sizeBytes: 3,
    });
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  async function characterRow() {
    const { rows } = await client.execute({
      sql: "SELECT status, sheet_json, state_json, actions_json, file_id, error FROM dnd_characters WHERE id = ?",
      args: [characterId],
    });
    return rows[0];
  }

  it("rejects every character write from a foreign owner and leaves the row untouched", async () => {
    const before = await characterRow();
    const foreign = { id: characterId, userId: INTRUDER };

    expect(await characters.setCharacterState(foreign, { hp: 1, notes: "pwned" })).toBe(false);
    expect(await characters.setCharacterReady(foreign, SHEET)).toBe(false);
    expect(await characters.setCharacterActions(foreign, "[]")).toBe(false);
    expect(await characters.setCharacterFile(foreign, fileId)).toBe(false);
    expect(await characters.setCharacterError(foreign, "boom")).toBe(false);
    expect(await characters.getCharacterActions(foreign)).toBeNull();

    expect(await characterRow()).toEqual(before);
  });

  it("accepts the same writes from the real owner", async () => {
    const own = { id: characterId, userId: OWNER };

    expect(await characters.setCharacterReady(own, SHEET)).toBe(true);
    expect(await characters.setCharacterState(own, { hp: 7, notes: "rested" })).toBe(true);
    expect(await characters.setCharacterActions(own, '[{"name":"Sneak"}]')).toBe(true);
    expect(await characters.setCharacterFile(own, fileId)).toBe(true);
    expect(await characters.getCharacterActions(own)).toBe('[{"name":"Sneak"}]');

    const row = await characterRow();
    expect(row?.status).toBe("ready");
    expect(JSON.parse(String(row?.state_json))).toEqual({ hp: 7, notes: "rested" });
    expect(row?.file_id).toBe(fileId);
  });

  it("scopes campaign and file writes the same way", async () => {
    const foreignCampaign = { id: campaignId, userId: INTRUDER };
    const ownCampaign = { id: campaignId, userId: OWNER };
    const extracted = {
      title: "Wound of the Forest",
      tagline: null,
      setting: null,
      levelRange: null,
      kind: "campaign" as const,
      checkpoints: [],
    };

    expect(await campaigns.setCampaignReady(foreignCampaign, extracted)).toBe(false);
    expect(await campaigns.setCampaignFile(foreignCampaign, fileId)).toBe(false);
    expect(await campaigns.setCampaignError(foreignCampaign, "boom")).toBe(false);
    expect(await files.renameFile({ id: fileId, userId: INTRUDER }, "stolen.pdf")).toBe(false);

    const untouched = await campaigns.getCampaign(campaignId, OWNER);
    expect(untouched?.status).toBe("processing");
    expect((await files.getFileMeta(fileId, OWNER))?.filename).toBe("module.pdf");

    expect(await campaigns.setCampaignReady(ownCampaign, extracted)).toBe(true);
    expect(await campaigns.setCampaignFile(ownCampaign, fileId)).toBe(true);
    expect(await files.renameFile({ id: fileId, userId: OWNER }, "renamed.pdf")).toBe(true);
    expect((await campaigns.getCampaign(campaignId, OWNER))?.title).toBe("Wound of the Forest");
    expect((await files.getFileMeta(fileId, OWNER))?.filename).toBe("renamed.pdf");
  });
});
