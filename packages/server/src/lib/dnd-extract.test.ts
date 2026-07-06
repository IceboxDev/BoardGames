import { describe, expect, it } from "vitest";
import {
  normalizeCharacter,
  normalizeExtraction,
  normalizeNode,
  normalizeNpcs,
  normalizeReadAloudBlocks,
} from "./dnd-extract.ts";

const CHECKPOINT = {
  title: "Into the Mists",
  description: "The party arrives.",
  arrival_text: "The fog closes behind you; ahead, the road bends into darkness.",
  kind: "quest",
};

const RAW = {
  title: "Curse of Strahd",
  tagline: "A gothic horror sandbox.",
  setting: "Barovia",
  level_range: "Levels 1–10",
  checkpoints: [CHECKPOINT],
};

describe("normalizeExtraction", () => {
  it("passes a clean extraction through", () => {
    const result = normalizeExtraction(RAW);
    expect(result.title).toBe("Curse of Strahd");
    expect(result.levelRange).toBe("Levels 1–10");
    expect(result.checkpoints).toEqual([
      {
        title: CHECKPOINT.title,
        description: CHECKPOINT.description,
        arrivalText: CHECKPOINT.arrival_text,
        kind: CHECKPOINT.kind,
      },
    ]);
  });

  it("nulls a blank arrival text", () => {
    const result = normalizeExtraction({
      ...RAW,
      checkpoints: [{ ...CHECKPOINT, arrival_text: "   " }],
    });
    expect(result.checkpoints[0]?.arrivalText).toBeNull();
  });

  it("trims and truncates over-long strings", () => {
    const result = normalizeExtraction({
      ...RAW,
      title: `  ${"x".repeat(300)}  `,
      checkpoints: [{ ...CHECKPOINT, description: "y".repeat(900) }],
    });
    expect(result.title.length).toBeLessThanOrEqual(120);
    expect(result.title.endsWith("…")).toBe(true);
    expect(result.checkpoints[0]?.description.length).toBeLessThanOrEqual(500);
  });

  it("coerces an unknown checkpoint kind to quest", () => {
    const result = normalizeExtraction({
      ...RAW,
      checkpoints: [{ ...CHECKPOINT, kind: "puzzle" }],
    });
    expect(result.checkpoints[0]?.kind).toBe("quest");
  });

  it("nulls out blank optional fields", () => {
    const result = normalizeExtraction({ ...RAW, tagline: "   ", setting: null });
    expect(result.tagline).toBeNull();
    expect(result.setting).toBeNull();
  });

  it("throws on a missing title", () => {
    expect(() => normalizeExtraction({ ...RAW, title: "   " })).toThrow(/no campaign title/);
  });

  it("throws on an empty checkpoint list", () => {
    expect(() => normalizeExtraction({ ...RAW, checkpoints: [] })).toThrow(/no checkpoints/);
  });

  it("throws on a malformed payload", () => {
    expect(() => normalizeExtraction({ nope: true })).toThrow();
  });
});

const RAW_CHARACTER = {
  name: "Vex the Bold",
  race: "Half-Elf",
  class: "Paladin",
  level: 5,
  alignment: "Lawful Good",
  abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  max_hp: 44,
  armor_class: 18,
  speed: "30 ft.",
  proficiencies: ["Athletics", "Persuasion"],
  equipment: ["Longsword", "Shield"],
  spells: ["Bless"],
  personality: "Charges first, apologizes later.",
  backstory: "A disgraced knight seeking redemption.",
};

describe("normalizeCharacter", () => {
  it("passes a clean sheet through", () => {
    const sheet = normalizeCharacter(RAW_CHARACTER);
    expect(sheet.name).toBe("Vex the Bold");
    expect(sheet.abilities).toEqual(RAW_CHARACTER.abilities);
    expect(sheet.maxHp).toBe(44);
  });

  it("clamps out-of-range numbers instead of failing", () => {
    const sheet = normalizeCharacter({
      ...RAW_CHARACTER,
      level: 99,
      max_hp: 12_000,
      abilities: { ...RAW_CHARACTER.abilities, str: 160, dex: 0 },
    });
    expect(sheet.level).toBe(20);
    expect(sheet.maxHp).toBe(999);
    expect(sheet.abilities?.str).toBe(30);
    expect(sheet.abilities?.dex).toBe(1);
  });

  it("truncates over-long lists and drops blank items", () => {
    const sheet = normalizeCharacter({
      ...RAW_CHARACTER,
      spells: ["  ", ...Array.from({ length: 60 }, (_, i) => `Spell ${i}`)],
    });
    expect(sheet.spells.length).toBe(40);
    expect(sheet.spells[0]).toBe("Spell 0");
  });

  it("falls back to 'Adventurer' for a blank class", () => {
    expect(normalizeCharacter({ ...RAW_CHARACTER, class: "  " }).class).toBe("Adventurer");
  });

  it("throws on a missing name", () => {
    expect(() => normalizeCharacter({ ...RAW_CHARACTER, name: "  " })).toThrow(/no character name/);
  });
});

const RAW_NPC = {
  name: "Strahd von Zarovich",
  category: "npc",
  role: "Vampire lord — the campaign's antagonist",
  kind: "Undead (vampire)",
  location: "Castle Ravenloft",
  abilities: { str: 18, dex: 18, con: 18, int: 20, wis: 15, cha: 18 },
  max_hp: 144,
  armor_class: 16,
  description: "Charming, patient, and always three moves ahead.",
  secrets: "He believes Ireena is Tatyana reborn.",
};

describe("normalizeNpcs", () => {
  it("passes clean NPCs through", () => {
    const npcs = normalizeNpcs({ npcs: [RAW_NPC] });
    expect(npcs).toHaveLength(1);
    expect(npcs[0]?.name).toBe("Strahd von Zarovich");
    expect(npcs[0]?.maxHp).toBe(144);
  });

  it("drops NPCs missing a name or description instead of failing the batch", () => {
    const npcs = normalizeNpcs({
      npcs: [RAW_NPC, { ...RAW_NPC, name: " " }, { ...RAW_NPC, description: "" }],
    });
    expect(npcs).toHaveLength(1);
  });

  it("accepts a statless NPC and an empty batch", () => {
    const npcs = normalizeNpcs({
      npcs: [{ ...RAW_NPC, abilities: null, max_hp: null, armor_class: null }],
    });
    expect(npcs[0]?.abilities).toBeNull();
    expect(normalizeNpcs({ npcs: [] })).toEqual([]);
  });

  it("clamps out-of-range stats", () => {
    const npcs = normalizeNpcs({
      npcs: [{ ...RAW_NPC, max_hp: 5000, abilities: { ...RAW_NPC.abilities, cha: 99 } }],
    });
    expect(npcs[0]?.maxHp).toBe(999);
    expect(npcs[0]?.abilities?.cha).toBe(30);
  });

  it("keeps monster category and coerces unknown categories to npc", () => {
    const npcs = normalizeNpcs({
      npcs: [
        { ...RAW_NPC, name: "Dead Vine", category: "monster" },
        { ...RAW_NPC, category: "deity" },
      ],
    });
    expect(npcs[0]?.category).toBe("monster");
    expect(npcs[1]?.category).toBe("npc");
  });
});

describe("normalizeNode", () => {
  const RAW_NODE = {
    trigger: "The party inspects the coffin",
    summary: "The lid is ajar; the earth inside is fresh.",
    read_text: "As you lean closer, the smell of turned soil rises to meet you.",
  };

  it("passes a clean node through", () => {
    const node = normalizeNode(RAW_NODE);
    expect(node.trigger).toBe(RAW_NODE.trigger);
    expect(node.readText).toBe(RAW_NODE.read_text);
  });

  it("truncates over-long fields", () => {
    const node = normalizeNode({ ...RAW_NODE, read_text: "x".repeat(5000) });
    expect(node.readText.length).toBeLessThanOrEqual(2000);
  });

  it("throws on an empty trigger or read text", () => {
    expect(() => normalizeNode({ ...RAW_NODE, trigger: " " })).toThrow(/empty node/);
    expect(() => normalizeNode({ ...RAW_NODE, read_text: "" })).toThrow(/empty node/);
  });
});

describe("normalizeReadAloudBlocks", () => {
  const BLOCK = {
    waypoint_index: 1,
    trigger: "The party reaches the forest edge",
    summary: "The treeline looms, unnaturally silent.",
    read_text: "The trees ahead stand shoulder to shoulder, and no birds sing.",
  };

  it("passes clean blocks through", () => {
    const blocks = normalizeReadAloudBlocks({ blocks: [BLOCK] }, 5);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.waypointIndex).toBe(1);
  });

  it("snaps out-of-range waypoint indexes into range", () => {
    const blocks = normalizeReadAloudBlocks(
      {
        blocks: [
          { ...BLOCK, waypoint_index: 99 },
          { ...BLOCK, waypoint_index: -3 },
        ],
      },
      5,
    );
    expect(blocks[0]?.waypointIndex).toBe(4);
    expect(blocks[1]?.waypointIndex).toBe(0);
  });

  it("drops empty blocks and accepts an empty list", () => {
    expect(normalizeReadAloudBlocks({ blocks: [{ ...BLOCK, read_text: " " }] }, 5)).toHaveLength(0);
    expect(normalizeReadAloudBlocks({ blocks: [] }, 5)).toEqual([]);
  });
});
