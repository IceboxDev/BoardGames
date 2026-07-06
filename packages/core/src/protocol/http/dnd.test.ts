import { describe, expect, it } from "vitest";
import {
  BeamerEventSchema,
  BeamerTriggerSchema,
  CAMPAIGN_PDF_DATA_URI_MAX,
  CampaignSchema,
  CreateCampaignRequestSchema,
  CreateCharacterRequestSchema,
  DndCharacterSchema,
  DndFileSchema,
  DndNodeSchema,
  DndNpcSchema,
  GenerateNodeRequestSchema,
} from "./dnd.ts";

const PDF = "data:application/pdf;base64,JVBERi0xLjQ=";

const READY_CAMPAIGN = {
  id: "c1",
  status: "ready",
  title: "Curse of Strahd",
  tagline: "A gothic horror sandbox in the mists of Barovia.",
  setting: "Barovia, the Domains of Dread",
  levelRange: "Levels 1–10",
  sourceFilename: "curse-of-strahd.pdf",
  sourceSizeBytes: 12345,
  checkpoints: [
    { title: "Into the Mists", description: "The party is drawn into Barovia.", kind: "quest" },
    { title: "Death House", description: "A haunted townhouse claims its due.", kind: "location" },
    { title: "The Amber Temple", description: "Dark gifts await.", kind: "revelation" },
    { title: "Castle Ravenloft", description: "The final confrontation.", kind: "finale" },
  ],
  error: null,
  createdAt: "2026-07-06 12:00:00",
};

describe("CreateCampaignRequestSchema", () => {
  it("accepts a valid PDF data URI", () => {
    const r = CreateCampaignRequestSchema.safeParse({ pdf: PDF, filename: "module.pdf" });
    expect(r.success).toBe(true);
  });

  it("rejects a non-PDF data URI", () => {
    const r = CreateCampaignRequestSchema.safeParse({
      pdf: "data:image/png;base64,iVBORw0KGgo=",
      filename: "module.pdf",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["pdf"]);
  });

  it("rejects an oversized PDF", () => {
    const pdf = `data:application/pdf;base64,${"A".repeat(CAMPAIGN_PDF_DATA_URI_MAX)}`;
    const r = CreateCampaignRequestSchema.safeParse({ pdf, filename: "module.pdf" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["pdf"]);
  });

  it("rejects an empty filename", () => {
    const r = CreateCampaignRequestSchema.safeParse({ pdf: PDF, filename: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["filename"]);
  });
});

describe("CampaignSchema", () => {
  it("accepts a ready campaign", () => {
    expect(CampaignSchema.safeParse(READY_CAMPAIGN).success).toBe(true);
  });

  it("accepts a processing campaign with null extracted fields", () => {
    const r = CampaignSchema.safeParse({
      ...READY_CAMPAIGN,
      status: "processing",
      title: null,
      tagline: null,
      setting: null,
      levelRange: null,
      checkpoints: [],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an error campaign", () => {
    const r = CampaignSchema.safeParse({
      ...READY_CAMPAIGN,
      status: "error",
      title: null,
      tagline: null,
      setting: null,
      levelRange: null,
      checkpoints: [],
      error: "Extraction failed: the tome resisted our sages.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = CampaignSchema.safeParse({ ...READY_CAMPAIGN, status: "brewing" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["status"]);
  });

  it("rejects an unknown checkpoint kind", () => {
    const r = CampaignSchema.safeParse({
      ...READY_CAMPAIGN,
      checkpoints: [{ title: "A", description: "", kind: "puzzle" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["checkpoints", 0, "kind"]);
  });
});

const READY_CHARACTER = {
  id: "ch1",
  campaignId: "c1",
  partyId: "p1",
  status: "ready",
  sheet: {
    name: "Vex the Bold",
    race: "Half-Elf",
    class: "Paladin",
    level: 5,
    alignment: "Lawful Good",
    abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
    maxHp: 44,
    armorClass: 18,
    speed: "30 ft.",
    proficiencies: ["Athletics", "Persuasion"],
    equipment: ["Longsword", "Shield", "Chain mail"],
    spells: ["Bless", "Shield of Faith"],
    personality: "Charges first, apologizes later.",
    backstory: "A disgraced knight seeking redemption in Barovia.",
  },
  sourceFilename: "vex.pdf",
  sourceSizeBytes: 240_000,
  error: null,
  createdAt: "2026-07-06 12:30:00",
};

describe("DndCharacterSchema", () => {
  it("accepts a ready character", () => {
    expect(DndCharacterSchema.safeParse(READY_CHARACTER).success).toBe(true);
  });

  it("accepts a processing character with a null sheet", () => {
    const r = DndCharacterSchema.safeParse({
      ...READY_CHARACTER,
      status: "processing",
      sheet: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an out-of-range ability score", () => {
    const r = DndCharacterSchema.safeParse({
      ...READY_CHARACTER,
      sheet: {
        ...READY_CHARACTER.sheet,
        abilities: { ...READY_CHARACTER.sheet.abilities, str: 42 },
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["sheet", "abilities", "str"]);
  });

  it("rejects a sheet without a name", () => {
    const r = DndCharacterSchema.safeParse({
      ...READY_CHARACTER,
      sheet: { ...READY_CHARACTER.sheet, name: "" },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["sheet", "name"]);
  });
});

describe("CreateCharacterRequestSchema", () => {
  it("accepts a valid PDF data URI with a party", () => {
    const r = CreateCharacterRequestSchema.safeParse({
      pdf: PDF,
      filename: "vex.pdf",
      partyId: "p1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-PDF data URI", () => {
    const r = CreateCharacterRequestSchema.safeParse({
      pdf: "data:text/plain;base64,aGk=",
      filename: "vex.pdf",
      partyId: "p1",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["pdf"]);
  });

  it("rejects a missing party", () => {
    const r = CreateCharacterRequestSchema.safeParse({ pdf: PDF, filename: "vex.pdf" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["partyId"]);
  });
});

describe("DndNodeSchema", () => {
  const NODE = {
    id: "n1",
    campaignId: "c1",
    partyId: "p1",
    waypointIndex: 0,
    parentId: null,
    trigger: "The party inspects the coffin",
    summary: "The lid is ajar; the earth inside is fresh.",
    readText: "As you lean closer, the smell of turned soil rises to meet you…",
    createdAt: "2026-07-06 20:00:00",
  };

  it("accepts a root node", () => {
    expect(DndNodeSchema.safeParse(NODE).success).toBe(true);
  });

  it("accepts a child node", () => {
    expect(DndNodeSchema.safeParse({ ...NODE, parentId: "n0" }).success).toBe(true);
  });

  it("rejects an empty trigger or read text", () => {
    expect(DndNodeSchema.safeParse({ ...NODE, trigger: "" }).success).toBe(false);
    expect(DndNodeSchema.safeParse({ ...NODE, readText: "" }).success).toBe(false);
  });
});

describe("GenerateNodeRequestSchema", () => {
  it("accepts a root-generation request", () => {
    const r = GenerateNodeRequestSchema.safeParse({
      waypointIndex: 2,
      parentId: null,
      message: "We kick the door open.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty message and a negative waypoint", () => {
    expect(
      GenerateNodeRequestSchema.safeParse({ waypointIndex: 0, parentId: null, message: "" })
        .success,
    ).toBe(false);
    expect(
      GenerateNodeRequestSchema.safeParse({ waypointIndex: -1, parentId: null, message: "x" })
        .success,
    ).toBe(false);
  });
});

describe("DndFileSchema", () => {
  it("accepts both kinds", () => {
    const base = {
      id: "f1",
      campaignId: "c1",
      filename: "module.pdf",
      sizeBytes: 123,
      createdAt: "2026-07-06 20:00:00",
    };
    expect(DndFileSchema.safeParse({ ...base, kind: "module" }).success).toBe(true);
    expect(DndFileSchema.safeParse({ ...base, kind: "character-sheet" }).success).toBe(true);
    expect(DndFileSchema.safeParse({ ...base, kind: "homework" }).success).toBe(false);
  });
});

describe("DndNpcSchema", () => {
  const NPC = {
    id: "n1",
    campaignId: "c1",
    name: "Strahd von Zarovich",
    role: "Vampire lord — the campaign's antagonist",
    kind: "Undead (vampire)",
    location: "Castle Ravenloft",
    abilities: { str: 18, dex: 18, con: 18, int: 20, wis: 15, cha: 18 },
    maxHp: 144,
    armorClass: 16,
    description: "Charming, patient, and always three moves ahead.",
    secrets: "He believes Ireena is Tatyana reborn.",
  };

  it("accepts a full NPC", () => {
    expect(DndNpcSchema.safeParse(NPC).success).toBe(true);
  });

  it("accepts an NPC without stats", () => {
    const r = DndNpcSchema.safeParse({
      ...NPC,
      abilities: null,
      maxHp: null,
      armorClass: null,
      kind: null,
      location: null,
      secrets: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a nameless NPC", () => {
    const r = DndNpcSchema.safeParse({ ...NPC, name: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["name"]);
  });
});

describe("BeamerEventSchema", () => {
  it("accepts each event type", () => {
    expect(
      BeamerEventSchema.safeParse({ type: "connected", campaignId: "c1", campaignTitle: "X" })
        .success,
    ).toBe(true);
    expect(
      BeamerEventSchema.safeParse({ type: "show-image", url: "https://x.test/map.png" }).success,
    ).toBe(true);
    expect(BeamerEventSchema.safeParse({ type: "clear" }).success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(BeamerEventSchema.safeParse({ type: "explode" }).success).toBe(false);
  });

  it("trigger schema excludes the server-only connected event", () => {
    expect(
      BeamerTriggerSchema.safeParse({ type: "connected", campaignId: "c1", campaignTitle: null })
        .success,
    ).toBe(false);
  });
});
