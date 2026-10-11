import { z } from "zod";
import {
  AlignmentSchema,
  CharacterIdSchema,
  EditionSchema,
} from "../../games/blood-on-the-clocktower/schema.ts";
import { MIN_PLAYERS as BOTC_MIN_PLAYERS } from "../../games/blood-on-the-clocktower/setup.ts";
import { IsoTimestampSchema } from "../common.ts";
import { CampaignKindSchema, PARTY_NAME_MAX } from "./dnd.ts";

// ── Companion records ─────────────────────────────────────────────────
//
// The finished games of the two table companions the server does not run:
// the Blood on the Clocktower Grimoire (client-side, in the Storyteller's
// phone) and the D&D DM screen. Neither has a machine, a seed or seats held
// by accounts, so they can't be `session_replays` rows — the people at the
// table are names the Storyteller / DM typed, and a D&D session has no
// winner. They live in their own table (`companion_records`), one row per
// game the recording account ran, and Match History lists them for that
// account.
//
// Every record carries a client-generated id. A POST with an id the account
// already used REPLACES that record (a retry, a second tab, or a winner
// corrected after an Undo) — it never adds a second row.

export const COMPANION_RECORD_SLUGS = ["blood-on-the-clocktower", "dungeons-and-dragons"] as const;
export const CompanionRecordSlugSchema = z.enum(COMPANION_RECORD_SLUGS);
export type CompanionRecordSlug = z.infer<typeof CompanionRecordSlugSchema>;

/** Is this game recorded by its companion (rather than by a server session)? */
export function isCompanionRecordSlug(slug: string): slug is CompanionRecordSlug {
  return (COMPANION_RECORD_SLUGS as readonly string[]).includes(slug);
}

/** A client-generated record id (a UUID, in practice). */
export const CompanionRecordClientIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "Expected an 8–64 character id");

/** A game no longer than this is a real game; anything longer is a clock bug. */
export const COMPANION_RECORD_MAX_DURATION_MS = 48 * 60 * 60 * 1000;

/** Official seating: 15 players plus up to 5 Travellers. */
export const BOTC_RECORD_MAX_PLAYERS = 20;
export const COMPANION_NAME_MAX = 60;
export const BOTC_REASON_MAX = 200;
export const DND_RECORD_MAX_MEMBERS = 12;

const Name = z.string().trim().min(1).max(COMPANION_NAME_MAX);

// ── Blood on the Clocktower ───────────────────────────────────────────

export const BotcRecordPlayerSchema = z.object({
  seat: z.number().int().min(0),
  name: Name,
  /** The character the player truly was at the end (a Drunk is the Drunk). */
  character: CharacterIdSchema,
  /** The team the player ended on (a Goon or Traveller may differ from the character type). */
  alignment: AlignmentSchema,
  alive: z.boolean(),
});
export type BotcRecordPlayer = z.infer<typeof BotcRecordPlayerSchema>;

export const BotcRecordSchema = z.object({
  game: z.literal("blood-on-the-clocktower"),
  edition: EditionSchema,
  /** The Storyteller's name as typed in setup — not an account. */
  storyteller: Name.nullable(),
  players: z.array(BotcRecordPlayerSchema).min(BOTC_MIN_PLAYERS).max(BOTC_RECORD_MAX_PLAYERS),
  winner: AlignmentSchema,
  reason: z.string().trim().min(1).max(BOTC_REASON_MAX),
  /** The last day the town reached (0 = it ended before the first day). */
  days: z.number().int().min(0).max(100),
  /** When the characters were dealt; `null` for games begun before it was kept. */
  startedAt: IsoTimestampSchema.nullable(),
  endedAt: IsoTimestampSchema,
});
export type BotcRecord = z.infer<typeof BotcRecordSchema>;
/** What a client builds before the schema brands its timestamps. */
export type BotcRecordInput = z.input<typeof BotcRecordSchema>;

// ── Dungeons & Dragons ────────────────────────────────────────────────

export const DndRecordMemberSchema = z.object({
  characterId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80).nullable(),
  playerName: z.string().trim().min(1).max(80).nullable(),
  race: z.string().trim().min(1).max(60).nullable(),
  class: z.string().trim().max(80),
  level: z.number().int().min(1).max(20).nullable(),
});
export type DndRecordMember = z.infer<typeof DndRecordMemberSchema>;

export const DndRecordSchema = z.object({
  game: z.literal("dungeons-and-dragons"),
  campaignId: z.string().min(1).max(64),
  campaignTitle: z.string().trim().min(1).max(200).nullable(),
  campaignKind: CampaignKindSchema,
  partyId: z.string().min(1).max(64),
  partyName: z.string().trim().min(1).max(PARTY_NAME_MAX),
  members: z.array(DndRecordMemberSchema).max(DND_RECORD_MAX_MEMBERS),
  /** Where the story stood when the session ended (0-based checkpoint). */
  waypoint: z
    .object({
      index: z.number().int().min(0),
      of: z.number().int().min(0),
      title: z.string().trim().min(1).max(200).nullable(),
    })
    .refine((w) => w.of === 0 || w.index < w.of, {
      message: "waypoint index past the last checkpoint",
      path: ["index"],
    }),
  /** Chronicle entries logged during this session. */
  loggedEntries: z.number().int().min(0).max(100_000),
  startedAt: IsoTimestampSchema,
  endedAt: IsoTimestampSchema,
});
export type DndRecord = z.infer<typeof DndRecordSchema>;
export type DndRecordInput = z.input<typeof DndRecordSchema>;

// ── The union ─────────────────────────────────────────────────────────

export const CompanionRecordSchema = z
  .discriminatedUnion("game", [BotcRecordSchema, DndRecordSchema])
  .superRefine((record, ctx) => {
    if (record.startedAt === null) return;
    const span = Date.parse(record.endedAt) - Date.parse(record.startedAt);
    if (span < 0) {
      ctx.addIssue({ code: "custom", path: ["endedAt"], message: "ends before it started" });
    } else if (span > COMPANION_RECORD_MAX_DURATION_MS) {
      ctx.addIssue({ code: "custom", path: ["endedAt"], message: "longer than 48 hours" });
    }
  });
export type CompanionRecord = z.infer<typeof CompanionRecordSchema>;

/** `POST /api/games/:slug/companion-records` — `record.game` must be `:slug`. */
export const SaveCompanionRecordBodySchema = z.object({
  clientId: CompanionRecordClientIdSchema,
  record: CompanionRecordSchema,
});
export type SaveCompanionRecordBody = z.input<typeof SaveCompanionRecordBodySchema>;

export const SaveCompanionRecordResponseSchema = z.object({
  ok: z.literal(true),
  id: z.number().int(),
  /** `false` when the id was already recorded and this replaced it. */
  created: z.boolean(),
});
export type SaveCompanionRecordResponse = z.infer<typeof SaveCompanionRecordResponseSchema>;

/** One stored record, as Match History lists it. */
export const CompanionRecordEntrySchema = z.object({
  id: z.number().int(),
  clientId: CompanionRecordClientIdSchema,
  /** When the server first saw it. */
  recordedAt: z.string(),
  record: CompanionRecordSchema,
});
export type CompanionRecordEntry = z.infer<typeof CompanionRecordEntrySchema>;

export const CompanionRecordListSchema = z.array(CompanionRecordEntrySchema);
export type CompanionRecordList = z.infer<typeof CompanionRecordListSchema>;
