import {
  type Campaign,
  CompanionRecordSchema,
  type DndCharacter,
  type DndHistoryEntry,
  type DndParty,
} from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { buildSessionRecord, closeSession, openSession, STALE_SESSION_MS } from "./session-record";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

let n = 0;
const newId = () => `session-${++n}`.padEnd(10, "x");

describe("openSession", () => {
  it("keeps the party's session across visits until it ends or goes stale", () => {
    const store = memoryStore();
    const start = new Date("2026-10-10T18:00:00.000Z");
    const first = openSession("p1", newId, start, store);
    const later = new Date(start.getTime() + 60 * 60 * 1000);
    expect(openSession("p1", newId, later, store)).toEqual(first);
    // Another party has its own session.
    expect(openSession("p2", newId, later, store).clientId).not.toBe(first.clientId);

    const stale = new Date(start.getTime() + STALE_SESSION_MS);
    const next = openSession("p1", newId, stale, store);
    expect(next.clientId).not.toBe(first.clientId);
    expect(next.startedAt).toBe(stale.toISOString());

    closeSession("p1", store);
    expect(openSession("p1", newId, stale, store).clientId).not.toBe(next.clientId);
  });
});

const campaign: Campaign = {
  id: "c1",
  status: "ready",
  kind: "campaign",
  title: "Lost Mine",
  tagline: null,
  setting: null,
  levelRange: null,
  sourceFilename: "lmop.pdf",
  sourceSizeBytes: 1,
  checkpoints: [
    { title: "Goblin Arrows", description: "", arrivalText: null, kind: "quest" },
    { title: "Cragmaw Hideout", description: "", arrivalText: null, kind: "battle" },
  ],
  error: null,
  createdAt: "2026-10-01 10:00:00",
};

const party: DndParty = {
  id: "p1",
  campaignId: "c1",
  name: "Tuesday",
  memberCount: 1,
  createdAt: "2026-10-01 10:00:00",
};

function character(
  id: string,
  sheet: Partial<NonNullable<DndCharacter["sheet"]>> | null,
): DndCharacter {
  return {
    id,
    campaignId: "c1",
    partyId: "p1",
    status: sheet ? "ready" : "processing",
    sheet: sheet
      ? {
          name: null,
          playerName: null,
          race: null,
          class: "",
          level: null,
          alignment: null,
          abilities: null,
          maxHp: null,
          armorClass: null,
          speed: null,
          skills: [],
          armorProficiencies: [],
          weaponProficiencies: [],
          toolProficiencies: [],
          savingThrows: [],
          languages: [],
          attacks: [],
          proficiencies: [],
          equipment: [],
          spells: [],
          personality: null,
          backstory: null,
          ...sheet,
        }
      : null,
    state: null,
    sourceFilename: "sheet.pdf",
    sourceSizeBytes: 1,
    error: null,
    createdAt: "2026-10-01 10:00:00",
  };
}

function entry(createdAt: string): DndHistoryEntry {
  return { id: createdAt, partyId: "p1", nodeId: null, kind: "dm-narration", text: "x", createdAt };
}

describe("buildSessionRecord", () => {
  it("records the party, where the story stands and what was logged this session", () => {
    const record = buildSessionRecord({
      campaign,
      party,
      characters: [
        character("ch1", {
          name: "Thorin",
          playerName: "Ben",
          race: "Dwarf",
          class: "Fighter",
          level: 3,
        }),
        character("ch2", null),
      ],
      history: [
        entry("2026-10-03 20:00:00"),
        entry("2026-10-10 18:30:00"),
        entry("2026-10-10 19:00:00"),
      ],
      waypointIndex: 1,
      session: { clientId: "session-01", startedAt: "2026-10-10T18:00:00.000Z" },
      endedAt: new Date("2026-10-10T21:00:00.000Z"),
    });
    expect(record).toMatchObject({
      campaignTitle: "Lost Mine",
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
      waypoint: { index: 1, of: 2, title: "Cragmaw Hideout" },
      loggedEntries: 2,
      endedAt: "2026-10-10T21:00:00.000Z",
    });
    expect(CompanionRecordSchema.safeParse(record).success).toBe(true);
  });

  it("stays valid for a campaign with no checkpoints", () => {
    const record = buildSessionRecord({
      campaign: { ...campaign, checkpoints: [], title: null },
      party,
      characters: [],
      history: [],
      waypointIndex: 3,
      session: { clientId: "session-01", startedAt: "2026-10-10T18:00:00.000Z" },
      endedAt: new Date("2026-10-10T18:10:00.000Z"),
    });
    expect(record.waypoint).toEqual({ index: 0, of: 0, title: null });
    expect(CompanionRecordSchema.safeParse(record).success).toBe(true);
  });
});
