// The online game's whole state — the server's, never a client's.
//
// Two coordinate systems meet here, kept apart on purpose:
//   • ROOM SEAT — who a person is for the whole game (0 = the Storyteller).
//     Everything players send and see is keyed by it.
//   • CHAIR — a seat around the companion's circle (`CompanionState.players`
//     index). Chairs move (re-seating, Travellers); `CompanionPlayer.roomSeat`
//     ties each chair to its person. Only grimoire edits speak in chairs.
//
// The Storyteller's truth is the companion state, edited by the same pure
// reducers as the phone Grimoire. Everything the town knows is kept apart
// from it (`publicLife`, `timeline`, `shown`, `inbox`), written only when the
// Storyteller makes something known — so a player view never has to guess
// which parts of the truth are public.

import { z } from "zod";
import { InfoPayloadSchema } from "../info.ts";
import { BotcConfigSchema } from "../manifest.ts";
import {
  AlignmentSchema,
  BagSetupSchema,
  CharacterIdSchema,
  CompanionStateSchema,
  DemonSkillSchema,
  NightStepIdSchema,
} from "../schema.ts";

export const ONLINE_STATE_VERSION = 1;

export const RoomSeatSchema = z.number().int().min(0).max(20);
export type RoomSeat = z.infer<typeof RoomSeatSchema>;

/** Kept in state; older entries drop off the front (the replay log keeps every one). */
export const CHAT_LIMIT = 1000;
/** Undo depth for the Storyteller. */
export const HISTORY_LIMIT = 20;

export const StageSchema = z.enum(["setup", "reveal", "play", "over"]);
export type Stage = z.infer<typeof StageSchema>;

/** One Traveller chosen at setup: they sit in the circle but never draw from the bag. */
export const SetupTravellerSchema = z.object({
  roomSeat: RoomSeatSchema,
  /** `null` = roll one at the deal. */
  character: CharacterIdSchema.nullable(),
  alignment: AlignmentSchema,
});

/** Before the deal: the circle, the Travellers and the bag the Storyteller is shaping. */
export const SetupStageSchema = z.object({
  /** Players' room seats in clockwise circle order (never the Storyteller). */
  order: z.array(RoomSeatSchema),
  travellers: z.array(SetupTravellerSchema),
  /** `null` while the resident count is outside 5–15. */
  bag: BagSetupSchema.nullable(),
  demonSkill: DemonSkillSchema,
});
export type SetupStage = z.infer<typeof SetupStageSchema>;

/** What one player was told they are. Never the truth unless the truth was told. */
export const ShownSchema = z.object({
  character: CharacterIdSchema,
  alignment: AlignmentSchema.optional(),
  /** They confirmed they've seen it (the Storyteller watches this at the reveal). */
  acknowledged: z.boolean(),
});
export type Shown = z.infer<typeof ShownSchema>;

/** Something the Storyteller told one player. Append-only: undo never unsends it. */
export const DeliverySchema = z.object({
  id: z.number().int(),
  at: z.number(),
  /** "Night 2", "Day 3", "Setup" — when it was told. */
  when: z.string().max(20),
  payload: InfoPayloadSchema,
  read: z.boolean(),
});
export type Delivery = z.infer<typeof DeliverySchema>;

/** A woken player's answer, in room seats. */
export const OnlineChoiceSchema = z.object({
  seats: z.array(RoomSeatSchema).max(4),
  character: CharacterIdSchema.optional(),
});
export type OnlineChoice = z.infer<typeof OnlineChoiceSchema>;

/** Who is awake right now, for which night step, and what they answered. */
export const WakeSchema = z.object({
  stepId: NightStepIdSchema,
  seats: z.array(RoomSeatSchema),
  /** room seat (as a string key) → their answer, revisable until the step resolves. */
  choices: z.record(z.string(), OnlineChoiceSchema),
  at: z.number(),
});
export type Wake = z.infer<typeof WakeSchema>;

export const RequestKindSchema = z.enum([
  "slayer",
  "gunslinger",
  "beggar-give",
  "judge",
  "matron-swap",
  "moonchild",
  "other",
]);
export type RequestKind = z.infer<typeof RequestKindSchema>;

/** A public claim the Storyteller has to rule on ("I'm the Slayer — I shoot Ben"). */
export const RequestSchema = z.object({
  id: z.number().int(),
  at: z.number(),
  from: RoomSeatSchema,
  kind: RequestKindSchema,
  targets: z.array(RoomSeatSchema).max(6),
  text: z.string().max(200).optional(),
  status: z.enum(["open", "resolved", "dismissed"]),
});
export type Request = z.infer<typeof RequestSchema>;

export const VoteSchema = z.object({
  nominator: RoomSeatSchema,
  nominee: RoomSeatSchema,
  kind: z.enum(["execution", "exile"]),
  /** Clockwise from the nominee's left, the nominee last. */
  order: z.array(RoomSeatSchema),
  /** `hands[i]` is `order[i]`'s hand. */
  hands: z.array(z.boolean()),
  /** How many voters the clock hand has passed (their hands are final). */
  locked: z.number().int().min(0),
  status: z.enum(["open", "running", "paused", "done"]),
  /** When the hand moves on (running only). */
  nextTickAt: z.number().nullable(),
  /** Set once the Storyteller confirmed the count. */
  result: z
    .object({ votes: z.number().int(), required: z.number().int(), outcome: z.string().max(60) })
    .optional(),
});
export type Vote = z.infer<typeof VoteSchema>;

/** The day's public bookkeeping (the companion keeps the truth of it). */
export const OnlineDaySchema = z.object({
  nominationsOpen: z.boolean(),
  /** Room seats that nominated / were nominated today (for execution). */
  nominators: z.array(RoomSeatSchema),
  nominees: z.array(RoomSeatSchema),
  vote: VoteSchema.nullable(),
});
export type OnlineDay = z.infer<typeof OnlineDaySchema>;

export const TimelineKindSchema = z.enum([
  "phase",
  "death",
  "life",
  "nomination",
  "vote",
  "execution",
  "claim",
  "announce",
  "seating",
  "end",
]);

/** One public event in the town's story. */
export const TimelineEntrySchema = z.object({
  id: z.number().int(),
  at: z.number(),
  kind: TimelineKindSchema,
  text: z.string().max(500),
  /** The Storyteller took back the step that published this. */
  retracted: z.boolean().optional(),
  /** Published by a Storyteller step (undo can retract it) rather than by a player. */
  byStoryteller: z.boolean(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const ChatMessageSchema = z.object({
  id: z.number().int(),
  at: z.number(),
  from: RoomSeatSchema,
  text: z.string().max(500),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** A private message. `to` 0 is the Storyteller. */
export const WhisperSchema = ChatMessageSchema.extend({ to: RoomSeatSchema });
export type Whisper = z.infer<typeof WhisperSchema>;

/** The part of the game a Storyteller's undo winds back. */
export const UndoEntrySchema = z.object({
  label: z.string().max(120),
  stage: StageSchema,
  companion: CompanionStateSchema.nullable(),
  day: OnlineDaySchema,
  publicLife: z.array(z.boolean()),
  wake: WakeSchema.nullable(),
  /** The timeline's next id when this was taken: later Storyteller entries are retracted. */
  timelineMark: z.number().int(),
});
export type UndoEntry = z.infer<typeof UndoEntrySchema>;

export const LoggedActionSchema = z.object({
  seat: RoomSeatSchema,
  at: z.number(),
  action: z.unknown(),
});

export const BotcOnlineSchema = z.object({
  version: z.literal(ONLINE_STATE_VERSION),
  /** Bumped by every applied action; Storyteller actions carry the one they were made against. */
  rev: z.number().int().min(0),
  seed: z.number().int(),
  config: BotcConfigSchema,
  /** Never in any view: it predicts every future roll. */
  rngState: z.number().int(),
  /** Display name per room seat (0 = the Storyteller). */
  names: z.array(z.string().max(60)),
  connected: z.array(z.boolean()),
  stage: StageSchema,
  setup: SetupStageSchema.nullable(),
  companion: CompanionStateSchema.nullable(),
  /** Per room seat: alive as the town knows it (set at dawn and by daytime deaths). */
  publicLife: z.array(z.boolean()),
  shown: z.array(ShownSchema.nullable()),
  inbox: z.array(z.array(DeliverySchema)),
  wake: WakeSchema.nullable(),
  requests: z.array(RequestSchema),
  day: OnlineDaySchema,
  timeline: z.array(TimelineEntrySchema),
  chat: z.array(ChatMessageSchema),
  whispers: z.array(WhisperSchema),
  chatSettings: z.object({ publicOpen: z.boolean(), whispersOpen: z.boolean() }),
  past: z.array(UndoEntrySchema),
  future: z.array(UndoEntrySchema),
  nextId: z.number().int(),
  /** Every applied action, for the replay. */
  log: z.array(LoggedActionSchema),
});
export type BotcOnline = z.infer<typeof BotcOnlineSchema>;

export const EMPTY_DAY: OnlineDay = {
  nominationsOpen: false,
  nominators: [],
  nominees: [],
  vote: null,
};

/** The replay a finished online game saves: the seed, every action, and the final state. */
export const BotcReplayLogSchema = z.object({
  formatVersion: z.literal(1),
  seed: z.number().int(),
  config: BotcConfigSchema,
  names: z.array(z.string()),
  actions: z.array(LoggedActionSchema),
  final: BotcOnlineSchema,
});
export type BotcReplayLog = z.infer<typeof BotcReplayLogSchema>;
