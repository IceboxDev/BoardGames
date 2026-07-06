import { z } from "zod";

// D&D DM tool: campaigns. The DM uploads an adventure-module PDF; the server
// sends it to an OpenAI model that extracts the campaign's title, tagline,
// setting, level range, and the significant story checkpoints. v1 renders a
// display-only quest-progress bar from those checkpoints.
//
// The PDF is never persisted — it lives in memory only for the lifetime of the
// extraction job. The `dnd_campaigns` row IS the job: `status` moves
// processing → ready | error, and the client polls the list endpoint while any
// campaign is processing.

// ── PDF upload ─────────────────────────────────────────────────────────
// OpenAI's PDF input limit (~32 MB) applies to the base64-inflated payload, so
// the practical file cap is lower. 20 MB covers virtually every published
// module; raise CAMPAIGN_PDF_MAX_BYTES once the prod proxy path is verified.
export const CAMPAIGN_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const CAMPAIGN_PDF_DATA_URI_MAX = 28_000_000; // 20 MB × 4/3 + header slack

const PdfDataUriSchema = z
  .string()
  .regex(/^data:application\/pdf;base64,/, "Expected a PDF data URI")
  .max(CAMPAIGN_PDF_DATA_URI_MAX, "PDF is too large (20 MB max)");

// ── Checkpoints ────────────────────────────────────────────────────────
export const CHECKPOINT_KINDS = [
  "quest",
  "battle",
  "revelation",
  "location",
  "treasure",
  "finale",
] as const;
export const CampaignCheckpointKindSchema = z.enum(CHECKPOINT_KINDS);
export type CampaignCheckpointKind = z.infer<typeof CampaignCheckpointKindSchema>;

export const CHECKPOINT_TITLE_MAX = 120;
export const CHECKPOINT_DESCRIPTION_MAX = 500;
export const CHECKPOINT_ARRIVAL_MAX = 2000;

export const CampaignCheckpointSchema = z.object({
  title: z.string().min(1).max(CHECKPOINT_TITLE_MAX),
  /** DM-facing summary (quest-bar detail); spoilers welcome. */
  description: z.string().max(CHECKPOINT_DESCRIPTION_MAX),
  /**
   * Read-aloud arrival narration — the boxed-text-style scene the DM reads
   * when the party reaches this stage. Null for campaigns extracted before
   * the field existed.
   */
  arrivalText: z.string().max(CHECKPOINT_ARRIVAL_MAX).nullable().default(null),
  kind: CampaignCheckpointKindSchema,
});
export type CampaignCheckpoint = z.infer<typeof CampaignCheckpointSchema>;

// ── Campaign ───────────────────────────────────────────────────────────
export const CampaignStatusSchema = z.enum(["processing", "ready", "error"]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CampaignSchema = z.object({
  id: z.string().min(1),
  status: CampaignStatusSchema,
  /** Extracted fields — null until `status === "ready"`. */
  title: z.string().nullable(),
  tagline: z.string().nullable(),
  setting: z.string().nullable(),
  levelRange: z.string().nullable(),
  sourceFilename: z.string(),
  sourceSizeBytes: z.number().int().nonnegative(),
  checkpoints: z.array(CampaignCheckpointSchema),
  /** A human-readable failure reason once `status === "error"`. */
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

// ── Requests / responses ───────────────────────────────────────────────
export const CreateCampaignRequestSchema = z.object({
  pdf: PdfDataUriSchema,
  filename: z.string().min(1).max(200),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

/** Returned immediately with `status: "processing"`; the client polls the list. */
export const CreateCampaignResponseSchema = z.object({
  campaign: CampaignSchema,
});
export type CreateCampaignResponse = z.infer<typeof CreateCampaignResponseSchema>;

export const ListCampaignsResponseSchema = z.object({
  campaigns: z.array(CampaignSchema),
});
export type ListCampaignsResponse = z.infer<typeof ListCampaignsResponseSchema>;

export const DeleteCampaignResponseSchema = z.object({
  ok: z.literal(true),
});
export type DeleteCampaignResponse = z.infer<typeof DeleteCampaignResponseSchema>;

// ── Characters ─────────────────────────────────────────────────────────
// The DM uploads each player's character-sheet PDF during campaign setup;
// the model extracts an internal representation (the "sheet") that the tool
// shows instead of the PDF. Same job pattern as campaigns: the row is the
// job, status moves processing → ready | error.

export const CharacterStatusSchema = z.enum(["processing", "ready", "error"]);
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>;

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const AbilityScoresSchema = z.object({
  str: z.number().int().min(1).max(30),
  dex: z.number().int().min(1).max(30),
  con: z.number().int().min(1).max(30),
  int: z.number().int().min(1).max(30),
  wis: z.number().int().min(1).max(30),
  cha: z.number().int().min(1).max(30),
});
export type AbilityScores = z.infer<typeof AbilityScoresSchema>;

export const CharacterSheetSchema = z.object({
  name: z.string().min(1).max(80),
  race: z.string().max(60).nullable(),
  class: z.string().max(80),
  level: z.number().int().min(1).max(20).nullable(),
  alignment: z.string().max(40).nullable(),
  abilities: AbilityScoresSchema.nullable(),
  maxHp: z.number().int().min(1).max(999).nullable(),
  armorClass: z.number().int().min(1).max(40).nullable(),
  speed: z.string().max(40).nullable(),
  proficiencies: z.array(z.string().min(1).max(60)).max(24),
  equipment: z.array(z.string().min(1).max(80)).max(24),
  spells: z.array(z.string().min(1).max(60)).max(40),
  personality: z.string().max(600).nullable(),
  backstory: z.string().max(1200).nullable(),
});
export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

export const DndCharacterSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  /** Null only for rows created before parties existed. */
  partyId: z.string().nullable(),
  status: CharacterStatusSchema,
  /** The extracted internal representation — null until `status === "ready"`. */
  sheet: CharacterSheetSchema.nullable(),
  sourceFilename: z.string(),
  sourceSizeBytes: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: z.string(),
});
export type DndCharacter = z.infer<typeof DndCharacterSchema>;

export const CreateCharacterRequestSchema = z.object({
  pdf: PdfDataUriSchema,
  filename: z.string().min(1).max(200),
  /** The party this adventurer joins. */
  partyId: z.string().min(1),
});
export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

export const CreateCharacterResponseSchema = z.object({
  character: DndCharacterSchema,
});
export type CreateCharacterResponse = z.infer<typeof CreateCharacterResponseSchema>;

export const ListCharactersResponseSchema = z.object({
  characters: z.array(DndCharacterSchema),
});
export type ListCharactersResponse = z.infer<typeof ListCharactersResponseSchema>;

export const DeleteCharacterResponseSchema = z.object({
  ok: z.literal(true),
});
export type DeleteCharacterResponse = z.infer<typeof DeleteCharacterResponseSchema>;

/** DM edits to the extracted sheet — full replacement, same shape. */
export const UpdateCharacterRequestSchema = z.object({
  sheet: CharacterSheetSchema,
});
export type UpdateCharacterRequest = z.infer<typeof UpdateCharacterRequestSchema>;

export const UpdateCharacterResponseSchema = z.object({
  character: DndCharacterSchema,
});
export type UpdateCharacterResponse = z.infer<typeof UpdateCharacterResponseSchema>;

// ── NPCs & monsters ────────────────────────────────────────────────────
// Extracted alongside the campaign checkpoints from the module's appendix
// of stat blocks: named characters (category "npc") AND creature types
// unique to the module (category "monster", e.g. a custom plant horror).
// No per-row job status: they ride the campaign's extraction job, and a
// failed pass simply yields an empty list.

export const NpcCategorySchema = z.enum(["npc", "monster"]);
export type NpcCategory = z.infer<typeof NpcCategorySchema>;

export const NpcSheetSchema = z.object({
  name: z.string().min(1).max(80),
  /** Named character vs creature type. Defaults for rows stored pre-field. */
  category: NpcCategorySchema.default("npc"),
  /** Story role, e.g. "Vampire lord — the campaign's antagonist". */
  role: z.string().max(160),
  /** Creature kind, e.g. "Undead (vampire)", "Human noble". */
  kind: z.string().max(60).nullable(),
  location: z.string().max(120).nullable(),
  abilities: AbilityScoresSchema.nullable(),
  maxHp: z.number().int().min(1).max(999).nullable(),
  armorClass: z.number().int().min(1).max(40).nullable(),
  /** DM-facing description — who they are, how to play them. */
  description: z.string().max(800),
  /** DM-only twists the players must not see. */
  secrets: z.string().max(600).nullable(),
});
export type NpcSheet = z.infer<typeof NpcSheetSchema>;

export const DndNpcSchema = NpcSheetSchema.extend({
  id: z.string().min(1),
  campaignId: z.string().min(1),
});
export type DndNpc = z.infer<typeof DndNpcSchema>;

export const ListNpcsResponseSchema = z.object({
  npcs: z.array(DndNpcSchema),
});
export type ListNpcsResponse = z.infer<typeof ListNpcsResponseSchema>;

// ── Sessions & the beamer companion ────────────────────────────────────
// A session is the live table: the DM's device creates one when a campaign
// is opened; the beamer/TTS companion (a second device on the same account)
// attaches to it and receives trigger events over SSE. Sessions are
// in-memory on the server — a restart simply drops them and the DM's screen
// re-creates one on next mount.

export const DndSessionSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  campaignTitle: z.string().nullable(),
  createdAt: z.string(),
});
export type DndSession = z.infer<typeof DndSessionSchema>;

export const CreateSessionRequestSchema = z.object({
  campaignId: z.string().min(1),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const CreateSessionResponseSchema = z.object({
  session: DndSessionSchema,
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export const ActiveSessionResponseSchema = z.object({
  session: DndSessionSchema.nullable(),
});
export type ActiveSessionResponse = z.infer<typeof ActiveSessionResponseSchema>;

/** Events the DM's screen can fire at the beamer. */
export const BeamerTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("show-image"), url: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("clear") }),
]);
export type BeamerTrigger = z.infer<typeof BeamerTriggerSchema>;

/** Everything the beamer can receive: triggers plus the server's hello. */
export const BeamerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connected"),
    campaignId: z.string(),
    campaignTitle: z.string().nullable(),
  }),
  ...BeamerTriggerSchema.options,
]);
export type BeamerEvent = z.infer<typeof BeamerEventSchema>;

export const TriggerBeamerRequestSchema = z.object({
  event: BeamerTriggerSchema,
});
export type TriggerBeamerRequest = z.infer<typeof TriggerBeamerRequestSchema>;

export const TriggerBeamerResponseSchema = z.object({
  ok: z.literal(true),
  /** How many beamer screens received the event. */
  delivered: z.number().int().nonnegative(),
});
export type TriggerBeamerResponse = z.infer<typeof TriggerBeamerResponseSchema>;

// ── Parties ────────────────────────────────────────────────────────────
// A campaign can be played by several groups at once; characters and story
// trees belong to a party, not the campaign.

export const PARTY_NAME_MAX = 60;

export const DndPartySchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  name: z.string().min(1).max(PARTY_NAME_MAX),
  /** Ready characters in this party (for the picker's member count). */
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type DndParty = z.infer<typeof DndPartySchema>;

export const CreatePartyRequestSchema = z.object({
  name: z.string().min(1).max(PARTY_NAME_MAX),
});
export type CreatePartyRequest = z.infer<typeof CreatePartyRequestSchema>;

export const CreatePartyResponseSchema = z.object({ party: DndPartySchema });
export type CreatePartyResponse = z.infer<typeof CreatePartyResponseSchema>;

export const ListPartiesResponseSchema = z.object({ parties: z.array(DndPartySchema) });
export type ListPartiesResponse = z.infer<typeof ListPartiesResponseSchema>;

export const DeletePartyResponseSchema = z.object({ ok: z.literal(true) });
export type DeletePartyResponse = z.infer<typeof DeletePartyResponseSchema>;

// ── Story nodes ────────────────────────────────────────────────────────
// The main game screen's structure: each waypoint (checkpoint index) is a
// folder holding trees of nodes. `parentId: null` = a tree root shown in the
// waypoint view. A node records what the players did (trigger), the short
// reaction (summary), and the text the DM reads aloud (readText). Trees are
// per party.

export const NODE_TRIGGER_MAX = 100;
export const NODE_SUMMARY_MAX = 160;
export const NODE_READ_TEXT_MAX = 2000;
export const NODE_MESSAGE_MAX = 1000;

/**
 * `story` — read-aloud narration with further branches.
 * `initiative` — combat begins: the node opens the initiative tracker
 * (enter the players' rolls, roll for NPCs) instead of a conversation.
 */
export const NodeTypeSchema = z.enum(["story", "initiative"]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const DndNodeSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  partyId: z.string().min(1),
  waypointIndex: z.number().int().nonnegative(),
  parentId: z.string().nullable(),
  /** Defaults for rows stored before node types existed. */
  nodeType: NodeTypeSchema.default("story"),
  trigger: z.string().min(1).max(NODE_TRIGGER_MAX),
  summary: z.string().max(NODE_SUMMARY_MAX),
  readText: z.string().min(1).max(NODE_READ_TEXT_MAX),
  createdAt: z.string(),
});
export type DndNode = z.infer<typeof DndNodeSchema>;

export const ListNodesResponseSchema = z.object({ nodes: z.array(DndNodeSchema) });
export type ListNodesResponse = z.infer<typeof ListNodesResponseSchema>;

/** The players said/did something — generate the matching node. */
export const GenerateNodeRequestSchema = z.object({
  waypointIndex: z.number().int().nonnegative(),
  /** Null = generate a new tree root in the waypoint folder. */
  parentId: z.string().nullable(),
  message: z.string().min(1).max(NODE_MESSAGE_MAX),
});
export type GenerateNodeRequest = z.infer<typeof GenerateNodeRequestSchema>;

export const GenerateNodeResponseSchema = z.object({ node: DndNodeSchema });
export type GenerateNodeResponse = z.infer<typeof GenerateNodeResponseSchema>;

// ── Files (Sources) ────────────────────────────────────────────────────
// Uploaded PDFs are persisted (chunked, server-side) so extraction can be
// re-run and the Sources screen can serve them back.

export const DndFileKindSchema = z.enum(["module", "character-sheet"]);
export type DndFileKind = z.infer<typeof DndFileKindSchema>;

export const DndFileSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().nullable(),
  kind: DndFileKindSchema,
  filename: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type DndFile = z.infer<typeof DndFileSchema>;

export const ListFilesResponseSchema = z.object({ files: z.array(DndFileSchema) });
export type ListFilesResponse = z.infer<typeof ListFilesResponseSchema>;

/** Re-run NPC extraction from the stored module PDF. */
export const RetriggerNpcsResponseSchema = z.object({
  ok: z.literal(true),
  npcCount: z.number().int().nonnegative(),
});
export type RetriggerNpcsResponse = z.infer<typeof RetriggerNpcsResponseSchema>;
