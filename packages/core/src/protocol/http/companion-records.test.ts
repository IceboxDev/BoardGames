import { describe, expect, it } from "vitest";
import {
  CompanionRecordListSchema,
  isCompanionRecordSlug,
  SaveCompanionRecordBodySchema,
} from "./companion-records.ts";

const botcPlayers = [
  { seat: 0, name: "Ana", character: "imp", alignment: "evil", alive: true },
  { seat: 1, name: "Ben", character: "poisoner", alignment: "evil", alive: false },
  { seat: 2, name: "Cleo", character: "empath", alignment: "good", alive: true },
  { seat: 3, name: "Dan", character: "monk", alignment: "good", alive: false },
  { seat: 4, name: "Eve", character: "drunk", alignment: "good", alive: true },
];

const botc = {
  game: "blood-on-the-clocktower",
  edition: "trouble-brewing",
  storyteller: "Mantas",
  players: botcPlayers,
  winner: "evil",
  reason: "two players remain",
  days: 3,
  startedAt: "2026-10-10T19:00:00.000Z",
  endedAt: "2026-10-10T20:15:00.000Z",
};

const dnd = {
  game: "dungeons-and-dragons",
  campaignId: "c1",
  campaignTitle: "Lost Mine of Phandelver",
  campaignKind: "campaign",
  partyId: "p1",
  partyName: "The Tuesday Crew",
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
  waypoint: { index: 1, of: 6, title: "Cragmaw Hideout" },
  loggedEntries: 14,
  startedAt: "2026-10-10T18:00:00.000Z",
  endedAt: "2026-10-10T22:00:00.000Z",
};

describe("SaveCompanionRecordBodySchema", () => {
  it("accepts a Clocktower game and a D&D session", () => {
    expect(
      SaveCompanionRecordBodySchema.parse({ clientId: "abcd1234", record: botc }).record,
    ).toEqual(botc);
    expect(
      SaveCompanionRecordBodySchema.parse({
        clientId: "0b6e4b0e-9c1d-4b8e-a2c3-1f2e3d4c5b6a",
        record: dnd,
      }).record.game,
    ).toBe("dungeons-and-dragons");
  });

  it("accepts a Clocktower game begun before start times were kept", () => {
    const r = SaveCompanionRecordBodySchema.safeParse({
      clientId: "abcd1234",
      record: { ...botc, startedAt: null },
    });
    expect(r.success).toBe(true);
  });

  it("refuses an unknown character", () => {
    const r = SaveCompanionRecordBodySchema.safeParse({
      clientId: "abcd1234",
      record: {
        ...botc,
        players: [{ ...botcPlayers[0], character: "nobody" }, ...botcPlayers.slice(1)],
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["record", "players", 0, "character"]);
  });

  it("refuses a table smaller than the game allows", () => {
    const r = SaveCompanionRecordBodySchema.safeParse({
      clientId: "abcd1234",
      record: { ...botc, players: botcPlayers.slice(0, 4) },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["record", "players"]);
  });

  it("refuses a game that ends before it started", () => {
    const r = SaveCompanionRecordBodySchema.safeParse({
      clientId: "abcd1234",
      record: { ...dnd, endedAt: "2026-10-10T17:00:00.000Z" },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["record", "endedAt"]);
  });

  it("refuses a waypoint past the campaign's last checkpoint", () => {
    const r = SaveCompanionRecordBodySchema.safeParse({
      clientId: "abcd1234",
      record: { ...dnd, waypoint: { index: 6, of: 6, title: null } },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["record", "waypoint", "index"]);
  });

  it("refuses a malformed client id and an unknown game", () => {
    expect(SaveCompanionRecordBodySchema.safeParse({ clientId: "x", record: botc }).success).toBe(
      false,
    );
    const r = SaveCompanionRecordBodySchema.safeParse({
      clientId: "abcd1234",
      record: { ...botc, game: "chess" },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["record", "game"]);
  });
});

describe("CompanionRecordListSchema", () => {
  it("parses stored entries", () => {
    const list = CompanionRecordListSchema.parse([
      { id: 1, clientId: "abcd1234", recordedAt: "2026-10-10 20:15:02", record: botc },
    ]);
    expect(list[0]?.record.game).toBe("blood-on-the-clocktower");
  });
});

describe("isCompanionRecordSlug", () => {
  it("knows the two companions and nothing else", () => {
    expect(isCompanionRecordSlug("blood-on-the-clocktower")).toBe(true);
    expect(isCompanionRecordSlug("dungeons-and-dragons")).toBe(true);
    expect(isCompanionRecordSlug("chess")).toBe(false);
  });
});
