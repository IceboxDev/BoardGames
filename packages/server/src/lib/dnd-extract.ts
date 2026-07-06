import type {
  CampaignCheckpoint,
  CampaignCheckpointKind,
  CharacterSheet,
  NpcSheet,
} from "@boardgames/core/protocol";
import {
  CHECKPOINT_ARRIVAL_MAX,
  CHECKPOINT_DESCRIPTION_MAX,
  CHECKPOINT_KINDS,
  CHECKPOINT_TITLE_MAX,
} from "@boardgames/core/protocol";
import OpenAI from "openai";
import { z } from "zod";

// Campaign extraction: send an adventure-module PDF to an OpenAI model and get
// back the campaign's title, tagline, setting, level range, and the 5–12 most
// significant story checkpoints. The PDF rides along as an `input_file` data
// URI and never touches disk or the DB; a strict json_schema response format
// keeps the model's output shape honest, and `normalizeExtraction` re-validates
// and clamps it to the protocol's limits before anything is persisted.

/** Thrown when the server isn't configured for extraction (missing key). */
export class DndConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DndConfigError";
  }
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new DndConfigError("Campaign extraction is not configured (OPENAI_API_KEY).");
  }
  return new OpenAI({ apiKey });
}

export interface CampaignExtraction {
  title: string;
  tagline: string | null;
  setting: string | null;
  levelRange: string | null;
  checkpoints: CampaignCheckpoint[];
}

const TAGLINE_MAX = 200;
const SETTING_MAX = 120;
const LEVEL_RANGE_MAX = 40;

// What the model is asked to return (snake_case, per the json_schema below).
// Kinds arrive as free strings so an off-list value degrades instead of
// failing the whole extraction.
const RawExtractionSchema = z.object({
  title: z.string(),
  tagline: z.string().nullable(),
  setting: z.string().nullable(),
  level_range: z.string().nullable(),
  checkpoints: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      arrival_text: z.string(),
      kind: z.string(),
    }),
  ),
});

const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The adventure's official title." },
    tagline: {
      type: ["string", "null"],
      description: "One dramatic sentence pitching the adventure.",
    },
    setting: {
      type: ["string", "null"],
      description: "The primary setting or region, e.g. 'Barovia, the Domains of Dread'.",
    },
    level_range: {
      type: ["string", "null"],
      description: "Short label like 'Levels 1–10', or null if not stated.",
    },
    checkpoints: {
      type: "array",
      minItems: 5,
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, evocative checkpoint name." },
          description: {
            type: "string",
            description: "1–2 sentences for the DM's eyes; spoilers allowed.",
          },
          arrival_text: {
            type: "string",
            description:
              "Boxed-text-style arrival narration read aloud to the players when they reach this stage: second person, atmospheric, 2–4 short paragraphs (max ~1900 chars), NO spoilers or DM-only information, ending just before the players act.",
          },
          kind: { type: "string", enum: [...CHECKPOINT_KINDS] },
        },
        required: ["title", "description", "arrival_text", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "tagline", "setting", "level_range", "checkpoints"],
  additionalProperties: false,
} as const;

const EXTRACTION_PROMPT = `You are assisting a Dungeon Master preparing to run the attached D&D adventure module. Read the document and extract:
1. The adventure's official title.
2. A one-sentence dramatic tagline pitching the adventure.
3. The primary setting or region.
4. The intended character level range as a short label like "Levels 1–10" (null if not stated).
5. The story waypoints. Waypoints MUST follow the module's own structure, in document order: one waypoint per named part/chapter, and one waypoint per enumerated area or location (e.g. "Area 1: …", "Area 2: …") — preserve the module's numbering and order EXACTLY, never reordering, merging, or skipping enumerated areas. For each waypoint provide:
   - a short, evocative title (keep the module's area/part name recognizable);
   - a 1–2 sentence DM-facing description (spoilers expected);
   - arrival_text: the narration the DM reads ALOUD when the party arrives at this stage — second person, atmospheric, 2–4 short paragraphs. Use the module's own boxed read-aloud text for this stage where it exists (verbatim or lightly adapted); otherwise write it in the module's tone, grounded strictly in what the document establishes. Scene-setting only: no spoilers, no DM-only knowledge, and end just before the players would act or speak.
   - the waypoint's kind.
Do not invent content that is not present in the document.`;

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function clampNullable(value: string | null, max: number): string | null {
  if (value === null) return null;
  const clamped = clamp(value, max);
  return clamped.length > 0 ? clamped : null;
}

const KIND_SET = new Set<string>(CHECKPOINT_KINDS);

/**
 * Validate + normalize whatever the model returned into a protocol-shaped
 * extraction: strings trimmed and clamped to the protocol maxes, off-list
 * checkpoint kinds coerced to "quest". Throws on a missing title or an empty
 * checkpoint list — a campaign without those is useless, so the job should
 * land in `error`, never a half-filled `ready`.
 */
export function normalizeExtraction(raw: unknown): CampaignExtraction {
  const parsed = RawExtractionSchema.parse(raw);

  const title = clamp(parsed.title, CHECKPOINT_TITLE_MAX);
  if (!title) throw new Error("the model returned no campaign title");

  const checkpoints = parsed.checkpoints
    .map((cp) => ({
      title: clamp(cp.title, CHECKPOINT_TITLE_MAX),
      description: clamp(cp.description, CHECKPOINT_DESCRIPTION_MAX),
      arrivalText: clampNullable(cp.arrival_text, CHECKPOINT_ARRIVAL_MAX),
      kind: (KIND_SET.has(cp.kind) ? cp.kind : "quest") as CampaignCheckpointKind,
    }))
    .filter((cp) => cp.title.length > 0);
  if (checkpoints.length === 0) throw new Error("the model returned no checkpoints");

  return {
    title,
    tagline: clampNullable(parsed.tagline, TAGLINE_MAX),
    setting: clampNullable(parsed.setting, SETTING_MAX),
    levelRange: clampNullable(parsed.level_range, LEVEL_RANGE_MAX),
    checkpoints,
  };
}

/** One PDF + prompt → the model's raw JSON, shaped by a strict json_schema. */
async function runPdfExtraction(args: {
  prompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  pdfDataUri: string;
  filename: string;
}): Promise<unknown> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";

  const res = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: args.prompt },
          { type: "input_file", filename: args.filename, file_data: args.pdfDataUri },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: args.schemaName,
        strict: true,
        schema: args.jsonSchema,
      },
    },
  });

  return JSON.parse(res.output_text);
}

/** Send the module PDF to OpenAI and return the normalized extraction. */
export async function extractCampaign(
  pdfDataUri: string,
  filename: string,
): Promise<CampaignExtraction> {
  const raw = await runPdfExtraction({
    prompt: EXTRACTION_PROMPT,
    schemaName: "campaign_extraction",
    jsonSchema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
    pdfDataUri,
    filename,
  });
  return normalizeExtraction(raw);
}

// ── Character sheets ───────────────────────────────────────────────────

const NAME_MAX = 80;
const RACE_MAX = 60;
const CLASS_MAX = 80;
const ALIGNMENT_MAX = 40;
const SPEED_MAX = 40;
const LIST_ITEM_MAX = 80;
const PROFICIENCIES_MAX = 24;
const EQUIPMENT_MAX = 24;
const SPELLS_MAX = 40;
const PERSONALITY_MAX = 600;
const BACKSTORY_MAX = 1200;

const RawAbilityScoresSchema = z.object({
  str: z.number(),
  dex: z.number(),
  con: z.number(),
  int: z.number(),
  wis: z.number(),
  cha: z.number(),
});

const RawCharacterSchema = z.object({
  name: z.string(),
  race: z.string().nullable(),
  class: z.string(),
  level: z.number().nullable(),
  alignment: z.string().nullable(),
  abilities: RawAbilityScoresSchema,
  max_hp: z.number().nullable(),
  armor_class: z.number().nullable(),
  speed: z.string().nullable(),
  proficiencies: z.array(z.string()),
  equipment: z.array(z.string()),
  spells: z.array(z.string()),
  personality: z.string().nullable(),
  backstory: z.string().nullable(),
});

const CHARACTER_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "The character's name." },
    race: { type: ["string", "null"], description: "Race / species / lineage." },
    class: {
      type: "string",
      description: "Class, including multiclass splits, e.g. 'Wizard 5 / Rogue 2'.",
    },
    level: { type: ["integer", "null"], description: "Total character level." },
    alignment: { type: ["string", "null"] },
    abilities: {
      type: "object",
      description: "The six ability scores as written on the sheet.",
      properties: {
        str: { type: "integer" },
        dex: { type: "integer" },
        con: { type: "integer" },
        int: { type: "integer" },
        wis: { type: "integer" },
        cha: { type: "integer" },
      },
      required: ["str", "dex", "con", "int", "wis", "cha"],
      additionalProperties: false,
    },
    max_hp: { type: ["integer", "null"], description: "Maximum hit points." },
    armor_class: { type: ["integer", "null"] },
    speed: { type: ["string", "null"], description: "e.g. '30 ft.'" },
    proficiencies: {
      type: "array",
      maxItems: 24,
      items: { type: "string" },
      description: "Skill and tool proficiencies.",
    },
    equipment: {
      type: "array",
      maxItems: 24,
      items: { type: "string" },
      description: "Notable equipment — weapons, armor, magic items. Skip mundane sundries.",
    },
    spells: {
      type: "array",
      maxItems: 40,
      items: { type: "string" },
      description: "Known/prepared spells, empty for non-casters.",
    },
    personality: {
      type: ["string", "null"],
      description: "Personality traits, ideals, bonds, flaws — condensed to a few sentences.",
    },
    backstory: {
      type: ["string", "null"],
      description: "The backstory condensed to a short DM-facing summary.",
    },
  },
  required: [
    "name",
    "race",
    "class",
    "level",
    "alignment",
    "abilities",
    "max_hp",
    "armor_class",
    "speed",
    "proficiencies",
    "equipment",
    "spells",
    "personality",
    "backstory",
  ],
  additionalProperties: false,
} as const;

const CHARACTER_PROMPT = `You are assisting a Dungeon Master. The attached PDF is one player's D&D character sheet (possibly with backstory pages). Extract the character into the requested structure: name, race, class (with multiclass splits), total level, alignment, the six ability scores, max HP, armor class, speed, skill/tool proficiencies, notable equipment, known or prepared spells (empty list for non-casters), a condensed personality summary, and a short DM-facing backstory summary. Use null for anything the sheet doesn't state. Do not invent details that are not in the document.`;

function clampScore(value: number): number {
  return Math.min(30, Math.max(1, Math.round(value)));
}

function clampInt(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampList(items: string[], maxItems: number, maxLen: number): string[] {
  return items
    .map((s) => clamp(s, Math.min(maxLen, LIST_ITEM_MAX)))
    .filter((s) => s.length > 0)
    .slice(0, maxItems);
}

/**
 * Validate + normalize a raw character extraction into the protocol's
 * `CharacterSheet` shape. Ability scores and numeric fields are clamped into
 * their legal ranges rather than rejected — a scanned sheet misread as
 * STR 160 should degrade, not fail the whole upload. Throws only on a
 * missing name (a nameless character card is useless).
 */
export function normalizeCharacter(raw: unknown): CharacterSheet {
  const parsed = RawCharacterSchema.parse(raw);

  const name = clamp(parsed.name, NAME_MAX);
  if (!name) throw new Error("the model returned no character name");

  return {
    name,
    race: clampNullable(parsed.race, RACE_MAX),
    class: clamp(parsed.class, CLASS_MAX) || "Adventurer",
    level: clampInt(parsed.level, 1, 20),
    alignment: clampNullable(parsed.alignment, ALIGNMENT_MAX),
    abilities: {
      str: clampScore(parsed.abilities.str),
      dex: clampScore(parsed.abilities.dex),
      con: clampScore(parsed.abilities.con),
      int: clampScore(parsed.abilities.int),
      wis: clampScore(parsed.abilities.wis),
      cha: clampScore(parsed.abilities.cha),
    },
    maxHp: clampInt(parsed.max_hp, 1, 999),
    armorClass: clampInt(parsed.armor_class, 1, 40),
    speed: clampNullable(parsed.speed, SPEED_MAX),
    proficiencies: clampList(parsed.proficiencies, PROFICIENCIES_MAX, 60),
    equipment: clampList(parsed.equipment, EQUIPMENT_MAX, 80),
    spells: clampList(parsed.spells, SPELLS_MAX, 60),
    personality: clampNullable(parsed.personality, PERSONALITY_MAX),
    backstory: clampNullable(parsed.backstory, BACKSTORY_MAX),
  };
}

/** Send a character-sheet PDF to OpenAI and return the normalized sheet. */
export async function extractCharacter(
  pdfDataUri: string,
  filename: string,
): Promise<CharacterSheet> {
  const raw = await runPdfExtraction({
    prompt: CHARACTER_PROMPT,
    schemaName: "character_extraction",
    jsonSchema: CHARACTER_JSON_SCHEMA as unknown as Record<string, unknown>,
    pdfDataUri,
    filename,
  });
  return normalizeCharacter(raw);
}

// ── NPCs ───────────────────────────────────────────────────────────────

const NPC_ROLE_MAX = 160;
const NPC_KIND_MAX = 60;
const NPC_LOCATION_MAX = 120;
const NPC_DESCRIPTION_MAX = 800;
const NPC_SECRETS_MAX = 600;
const NPCS_MAX = 30;

const RawNpcSchema = z.object({
  name: z.string(),
  category: z.string(),
  role: z.string(),
  kind: z.string().nullable(),
  location: z.string().nullable(),
  abilities: RawAbilityScoresSchema.nullable(),
  max_hp: z.number().nullable(),
  armor_class: z.number().nullable(),
  description: z.string(),
  secrets: z.string().nullable(),
});
const RawNpcsSchema = z.object({ npcs: z.array(RawNpcSchema) });

const NPC_JSON_SCHEMA = {
  type: "object",
  properties: {
    npcs: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: {
            type: "string",
            enum: ["npc", "monster"],
            description:
              "'npc' for a named character; 'monster' for a creature type (its stat block is a species, not a person).",
          },
          role: {
            type: "string",
            description:
              "Story role, e.g. 'Vampire lord — the campaign's antagonist' or 'Corrupted plant horror — the forest's foot soldiers'.",
          },
          kind: {
            type: ["string", "null"],
            description: "Creature kind, e.g. 'Undead (vampire)', 'Plant'.",
          },
          location: { type: ["string", "null"], description: "Where the party meets them." },
          abilities: {
            anyOf: [
              {
                type: "object",
                properties: {
                  str: { type: "integer" },
                  dex: { type: "integer" },
                  con: { type: "integer" },
                  int: { type: "integer" },
                  wis: { type: "integer" },
                  cha: { type: "integer" },
                },
                required: ["str", "dex", "con", "int", "wis", "cha"],
                additionalProperties: false,
              },
              { type: "null" },
            ],
            description: "Ability scores from the stat block, or null if none is given.",
          },
          max_hp: { type: ["integer", "null"] },
          armor_class: { type: ["integer", "null"] },
          description: {
            type: "string",
            description: "DM-facing: who they are, motivations, how to roleplay them.",
          },
          secrets: {
            type: ["string", "null"],
            description: "DM-only twists and hidden agendas the players must not learn early.",
          },
        },
        required: [
          "name",
          "category",
          "role",
          "kind",
          "location",
          "abilities",
          "max_hp",
          "armor_class",
          "description",
          "secrets",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["npcs"],
  additionalProperties: false,
} as const;

// Pass 1 of the two-pass pipeline: enumerate every stat block so pass 2 has
// an explicit checklist — recall of monster-type blocks (e.g. a custom plant
// horror in the appendix) is unreliable when a single pass must both find
// and describe them.
const STAT_BLOCK_ENUM_JSON_SCHEMA = {
  type: "object",
  properties: {
    names: {
      type: "array",
      maxItems: 40,
      items: { type: "string" },
      description: "Stat-block and named-character names, in document order, no duplicates.",
    },
  },
  required: ["names"],
  additionalProperties: false,
} as const;

const RawStatBlockNamesSchema = z.object({ names: z.array(z.string()) });

const STAT_BLOCK_ENUM_PROMPT = `You are indexing the attached D&D adventure module. List the header name of EVERY creature or character stat block in the document — stat blocks are the boxes/sections giving AC, hit points, speed, and the six ability scores, usually collected in an appendix near the end of the book. Include BOTH named characters (NPCs) and monster/creature types unique to this module (custom monsters count even if they are not a person). Additionally include significant named characters discussed in the story text even if they have no stat block of their own. Return only the names, in document order, without duplicates. Do not invent names that are not in the document.`;

function buildNpcPrompt(statBlockNames: string[]): string {
  const checklist =
    statBlockNames.length > 0
      ? `\nAn index pass over this document found these stat blocks and named characters — extract a card for EVERY one of them (plus anything the index missed):\n${statBlockNames.map((n) => `- ${n}`).join("\n")}\n`
      : "";
  return `You are assisting a Dungeon Master preparing to run the attached D&D adventure module. Extract a card for every significant creature and character: the named NPCs the party will interact with AND the monster/creature types that appear in the module's stat-block appendix (custom monsters unique to this module must be included — a stat block for a creature type counts even though it is not a person).${checklist}
For each card: name; category ('npc' for a named character, 'monster' for a creature type); story role; creature kind; the location where the party typically encounters them; ability scores from the stat block (null if none is given); max HP and armor class (null if not stated); a DM-facing description covering who or what they are, their motivations or behavior in combat, and how to run them; and any DM-only secrets (null for most monsters). Do not invent content that is not present in the document.`;
}

const KNOWN_CATEGORIES = new Set(["npc", "monster"]);

/**
 * Validate + normalize the raw NPC extraction. Individual malformed cards are
 * dropped rather than failing the batch; an empty result is legal (some
 * one-shots genuinely have no named NPCs).
 */
export function normalizeNpcs(raw: unknown): NpcSheet[] {
  const parsed = RawNpcsSchema.parse(raw);
  const npcs: NpcSheet[] = [];
  for (const npc of parsed.npcs) {
    const name = clamp(npc.name, NAME_MAX);
    const description = clamp(npc.description, NPC_DESCRIPTION_MAX);
    if (!name || !description) continue;
    npcs.push({
      name,
      category: KNOWN_CATEGORIES.has(npc.category) ? (npc.category as "npc" | "monster") : "npc",
      role: clamp(npc.role, NPC_ROLE_MAX),
      kind: clampNullable(npc.kind, NPC_KIND_MAX),
      location: clampNullable(npc.location, NPC_LOCATION_MAX),
      abilities: npc.abilities
        ? {
            str: clampScore(npc.abilities.str),
            dex: clampScore(npc.abilities.dex),
            con: clampScore(npc.abilities.con),
            int: clampScore(npc.abilities.int),
            wis: clampScore(npc.abilities.wis),
            cha: clampScore(npc.abilities.cha),
          }
        : null,
      maxHp: clampInt(npc.max_hp, 1, 999),
      armorClass: clampInt(npc.armor_class, 1, 40),
      description,
      secrets: clampNullable(npc.secrets, NPC_SECRETS_MAX),
    });
    if (npcs.length >= NPCS_MAX) break;
  }
  return npcs;
}

/**
 * Two-pass extraction: (1) index every stat block in the document, (2)
 * extract a card for each indexed name. The explicit checklist is what makes
 * monster-type blocks (not just named characters) come out reliably. A failed
 * index pass degrades to the single-pass behavior rather than failing.
 */
export async function extractNpcs(pdfDataUri: string, filename: string): Promise<NpcSheet[]> {
  let statBlockNames: string[] = [];
  try {
    const rawIndex = await runPdfExtraction({
      prompt: STAT_BLOCK_ENUM_PROMPT,
      schemaName: "stat_block_index",
      jsonSchema: STAT_BLOCK_ENUM_JSON_SCHEMA as unknown as Record<string, unknown>,
      pdfDataUri,
      filename,
    });
    statBlockNames = RawStatBlockNamesSchema.parse(rawIndex)
      .names.map((n) => n.trim())
      .filter((n) => n.length > 0)
      .slice(0, 40);
  } catch (err) {
    console.error("[dnd] stat-block index pass failed (falling back to single pass)", err);
  }

  const raw = await runPdfExtraction({
    prompt: buildNpcPrompt(statBlockNames),
    schemaName: "npc_extraction",
    jsonSchema: NPC_JSON_SCHEMA as unknown as Record<string, unknown>,
    pdfDataUri,
    filename,
  });
  return normalizeNpcs(raw);
}

// ── Read-aloud templates ───────────────────────────────────────────────
// Modules script their scenes as boxed read-aloud blocks. We chart each
// block as a template story node (per waypoint) so every new party's tree
// starts from the module's own script.

export interface ReadAloudBlock {
  waypointIndex: number;
  trigger: string;
  summary: string;
  readText: string;
}

const READ_ALOUD_MAX = 40;

const RawReadAloudSchema = z.object({
  blocks: z.array(
    z.object({
      waypoint_index: z.number(),
      trigger: z.string(),
      summary: z.string(),
      read_text: z.string(),
    }),
  ),
});

const READ_ALOUD_JSON_SCHEMA = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        properties: {
          waypoint_index: {
            type: "integer",
            description: "0-based index of the waypoint this block belongs to.",
          },
          trigger: {
            type: "string",
            description:
              "When the DM reads it — what the players did/where they arrived (max ~90 chars).",
          },
          summary: {
            type: "string",
            description: "One short sentence describing the scene (max ~150 chars).",
          },
          read_text: {
            type: "string",
            description:
              "The boxed read-aloud text, verbatim or lightly cleaned (max ~1900 chars).",
          },
        },
        required: ["waypoint_index", "trigger", "summary", "read_text"],
        additionalProperties: false,
      },
    },
  },
  required: ["blocks"],
  additionalProperties: false,
} as const;

function buildReadAloudPrompt(checkpoints: { title: string; description: string }[]): string {
  const waypointList = checkpoints
    .map((cp, i) => `${i}: "${cp.title}" — ${cp.description}`)
    .join("\n");
  return `You are assisting a Dungeon Master preparing to run the attached D&D adventure module. The module contains boxed read-aloud text — the passages the DM reads to the players verbatim (often typeset in boxes, italics, or indented blocks). Extract every read-aloud block, in the order it appears. For each block: assign it to the waypoint it belongs to using this 0-based list of the campaign's charted waypoints:
${waypointList}
Also provide: a short trigger describing when the DM reads it (what the players did or where they arrived), a one-sentence summary of the scene, and the read-aloud text itself — verbatim, lightly cleaned of layout artifacts. Do not invent blocks that are not in the document.`;
}

/**
 * Normalize the raw block list: clamp text, snap out-of-range waypoint
 * indexes into range, drop empty blocks. An empty result is legal (not every
 * module uses boxed text).
 */
export function normalizeReadAloudBlocks(raw: unknown, waypointCount: number): ReadAloudBlock[] {
  const parsed = RawReadAloudSchema.parse(raw);
  const blocks: ReadAloudBlock[] = [];
  for (const block of parsed.blocks) {
    const trigger = clamp(block.trigger, NODE_TRIGGER_MAX);
    const readText = clamp(block.read_text, NODE_READ_TEXT_MAX);
    if (!trigger || !readText || waypointCount === 0) continue;
    blocks.push({
      waypointIndex: Math.min(waypointCount - 1, Math.max(0, Math.round(block.waypoint_index))),
      trigger,
      summary: clamp(block.summary, NODE_SUMMARY_MAX),
      readText,
    });
    if (blocks.length >= READ_ALOUD_MAX) break;
  }
  return blocks;
}

/** Send the module PDF to OpenAI and chart its read-aloud blocks. */
export async function extractReadAloudNodes(
  pdfDataUri: string,
  filename: string,
  checkpoints: { title: string; description: string }[],
): Promise<ReadAloudBlock[]> {
  const raw = await runPdfExtraction({
    prompt: buildReadAloudPrompt(checkpoints),
    schemaName: "read_aloud_extraction",
    jsonSchema: READ_ALOUD_JSON_SCHEMA as unknown as Record<string, unknown>,
    pdfDataUri,
    filename,
  });
  return normalizeReadAloudBlocks(raw, checkpoints.length);
}

// ── Story nodes ────────────────────────────────────────────────────────
// The main game screen's chat: the DM types what the players said or did,
// and the model writes the next node of the story tree — grounded in the
// campaign, the current waypoint, the branch walked so far, and the sibling
// branches already generated.

const NODE_TRIGGER_MAX = 100;
const NODE_SUMMARY_MAX = 160;
const NODE_READ_TEXT_MAX = 2000;

export interface StoryNodeContext {
  campaign: { title: string; tagline: string | null; setting: string | null };
  waypoint: { title: string; description: string; index: number; total: number };
  /** Root → parent chain of the branch being extended (empty for a new root). */
  ancestors: { trigger: string; readText: string }[];
  /** Nodes already at this level — avoid duplicating them. */
  siblings: { trigger: string; summary: string }[];
  /** e.g. "Vex the Bold — Half-Elf Paladin 5". */
  party: string[];
  /** What the players said/did, per the DM. */
  message: string;
}

export interface StoryNode {
  trigger: string;
  summary: string;
  readText: string;
}

const RawNodeSchema = z.object({
  trigger: z.string(),
  summary: z.string(),
  read_text: z.string(),
});

const NODE_JSON_SCHEMA = {
  type: "object",
  properties: {
    trigger: {
      type: "string",
      description: "Short label restating what the players did (max ~90 chars).",
    },
    summary: {
      type: "string",
      description: "One short sentence: the immediate reaction/consequence (max ~150 chars).",
    },
    read_text: {
      type: "string",
      description:
        "The narration the DM reads aloud: second person, vivid, 1-3 short paragraphs, ending at a natural decision point (max ~1900 chars).",
    },
  },
  required: ["trigger", "summary", "read_text"],
  additionalProperties: false,
} as const;

function buildNodePrompt(ctx: StoryNodeContext): string {
  const lines: string[] = [];
  lines.push(
    `You are the co-author sitting beside a Dungeon Master running "${ctx.campaign.title}"${
      ctx.campaign.setting ? ` (${ctx.campaign.setting})` : ""
    }.`,
  );
  if (ctx.campaign.tagline) lines.push(`The adventure in one line: ${ctx.campaign.tagline}`);
  lines.push(
    `The party is at waypoint ${ctx.waypoint.index + 1} of ${ctx.waypoint.total}: "${ctx.waypoint.title}" — ${ctx.waypoint.description}`,
  );
  if (ctx.party.length > 0) lines.push(`The party: ${ctx.party.join("; ")}.`);
  if (ctx.ancestors.length > 0) {
    lines.push("What has happened down this branch, in order:");
    ctx.ancestors.forEach((a, i) => {
      lines.push(`${i + 1}. [${a.trigger}] ${a.readText}`);
    });
  } else {
    lines.push("This will start a NEW branch at this waypoint (no prior narration).");
  }
  if (ctx.siblings.length > 0) {
    lines.push(
      `Branches that already exist at this exact point (write something DIFFERENT): ${ctx.siblings
        .map((s) => `[${s.trigger}] ${s.summary}`)
        .join(" | ")}`,
    );
  }
  lines.push(`The players now: ${ctx.message}`);
  lines.push(
    "Write the next story node. `trigger` restates what the players did, short. `summary` is the immediate consequence in one short sentence. `read_text` is what the DM reads aloud: second person, grounded in the module's tone and everything established above, never contradicting it, ending at a natural decision point.",
  );
  return lines.join("\n");
}

export function normalizeNode(raw: unknown): StoryNode {
  const parsed = RawNodeSchema.parse(raw);
  const trigger = clamp(parsed.trigger, NODE_TRIGGER_MAX);
  const readText = clamp(parsed.read_text, NODE_READ_TEXT_MAX);
  if (!trigger || !readText) throw new Error("the model returned an empty node");
  return { trigger, summary: clamp(parsed.summary, NODE_SUMMARY_MAX), readText };
}

/** Text-only generation — no PDF, a few seconds instead of minutes. */
export async function generateStoryNode(ctx: StoryNodeContext): Promise<StoryNode> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";

  const res = await client.responses.create({
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: buildNodePrompt(ctx) }] }],
    text: {
      format: {
        type: "json_schema",
        name: "story_node",
        strict: true,
        schema: NODE_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  return normalizeNode(JSON.parse(res.output_text));
}
