// Everything a seat can send in an online game.
//
// The Storyteller's actions carry `rev` — the state revision their screen
// showed — and are refused when the game has moved on since, so two quick
// clicks on a stale Grimoire can't land on the wrong player. Players' actions
// are keyed by room seat and need no revision: each one is checked against
// the state it lands on.

import { z } from "zod";
import { CompanionActionSchema } from "../actions.ts";
import { InfoPayloadSchema } from "../info.ts";
import {
  AlignmentSchema,
  CharacterIdSchema,
  DemonSkillSchema,
  EditionSchema,
  NightStepIdSchema,
} from "../schema.ts";
import {
  DayTimerKindSchema,
  OnlineChoiceSchema,
  RequestKindSchema,
  RoomSeatSchema,
} from "./state.ts";

const Text = z.string().trim().min(1).max(500);

const action = <T extends string, S extends z.ZodRawShape>(kind: T, shape: S) =>
  z.object({ kind: z.literal(kind), ...shape }).strict();

// ── Players ─────────────────────────────────────────────────────────────

export const PlayerActionSchema = z.discriminatedUnion("kind", [
  /** "I've seen my character." */
  action("ack-character", {}),
  /** A woken player's answer to their prompt. */
  action("night-choice", { stepId: NightStepIdSchema, choice: OnlineChoiceSchema }),
  /** Mark something the Storyteller told them as read. */
  action("dismiss-info", { id: z.number().int() }),
  /** The town square. */
  action("chat", { text: Text }),
  /** A private message to a player, or to the Storyteller (room seat 0). */
  action("whisper", { to: RoomSeatSchema, text: Text }),
  /** Nominate a player (or call for a Traveller's exile). */
  action("nominate", { nominee: RoomSeatSchema }),
  /** Raise or lower a hand in the running vote, before the clock reaches them. */
  action("hand", { up: z.boolean() }),
  /** "I'm ready to move on" — the Storyteller sees who is, and may move on early. */
  action("ready", { ready: z.boolean() }),
  /** A public claim the Storyteller rules on. */
  action("request", {
    request: RequestKindSchema,
    targets: z.array(RoomSeatSchema).max(6),
    text: z.string().trim().max(200).optional(),
  }),
]);
export type PlayerAction = z.infer<typeof PlayerActionSchema>;

// ── The Storyteller ─────────────────────────────────────────────────────

const st = <T extends string, S extends z.ZodRawShape>(kind: T, shape: S) =>
  action(kind, { rev: z.number().int().min(0), ...shape });

export const StorytellerActionSchema = z.discriminatedUnion("kind", [
  // Setup: the circle, the Travellers, the bag.
  st("setup-order", { order: z.array(RoomSeatSchema).max(20) }),
  st("setup-traveller", {
    roomSeat: RoomSeatSchema,
    traveller: z
      .object({ character: CharacterIdSchema.nullable(), alignment: AlignmentSchema })
      .nullable(),
  }),
  st("setup-edition", { edition: EditionSchema }),
  st("setup-reroll", {}),
  st("setup-swap-token", { from: CharacterIdSchema, to: CharacterIdSchema }),
  st("setup-stand-in", { character: CharacterIdSchema }),
  st("setup-demon-skill", { skill: DemonSkillSchema }),
  st("deal", {}),
  // Reveal.
  st("reveal-characters", {}),
  st("begin-night", {}),
  // Any time after the deal: a Grimoire edit (the companion's reducers).
  st("grimoire", { action: CompanionActionSchema, label: z.string().max(120).optional() }),
  // Night.
  st("wake", { stepId: NightStepIdSchema }),
  st("sleep", {}),
  st("send-info", {
    /** Everyone it goes to (the Minions all learn their Demon at once). */
    to: z.array(RoomSeatSchema).min(1).max(20),
    payload: InfoPayloadSchema,
    /** Also note it in the Grimoire ("Told X: 2 (true: 1)"). */
    record: z.boolean(),
    truth: z.string().max(200).optional(),
  }),
  /** Tell a player their (new) true character: the star-pass, the Scarlet Woman… */
  st("show-character", { to: RoomSeatSchema }),
  st("dawn", {}),
  // Day.
  st("nominations", { open: z.boolean() }),
  st("start-vote", {}),
  st("pause-vote", {}),
  st("resume-vote", {}),
  st("cancel-vote", {}),
  st("confirm-vote", {}),
  st("execute", {}),
  st("end-day", {}),
  st("announce", { text: Text }),
  /** Start a countdown everyone sees (`seconds: null` clears it). Resets who is ready. */
  st("timer", {
    timer: DayTimerKindSchema,
    seconds: z.number().int().min(1).max(1800).nullable(),
    label: z.string().trim().max(60).optional(),
  }),
  st("chat-settings", { publicOpen: z.boolean(), whispersOpen: z.boolean() }),
  st("resolve-request", {
    id: z.number().int(),
    status: z.enum(["resolved", "dismissed"]),
    note: z.string().trim().max(300).optional(),
  }),
  /** Act for a player who is away (their night answer, a nomination, a hand). */
  st("act-for", { roomSeat: RoomSeatSchema, action: PlayerActionSchema }),
  st("undo", {}),
  st("redo", {}),
  st("end-game", { winner: AlignmentSchema, reason: z.string().trim().min(1).max(200) }),
]);
export type StorytellerAction = z.infer<typeof StorytellerActionSchema>;

/** A Storyteller action without its `rev` — the sender stamps the revision its screen shows. */
export type StorytellerMove = WithoutRev<StorytellerAction>;
type WithoutRev<T> = T extends unknown ? Omit<T, "rev"> : never;

/** The Storyteller may also talk: chat and whisper go through the players' actions. */
export const OnlineActionSchema = z.union([StorytellerActionSchema, PlayerActionSchema]);
export type OnlineAction = z.infer<typeof OnlineActionSchema>;

/** Storyteller-only kinds, for the seat check. */
export const STORYTELLER_KINDS: ReadonlySet<string> = new Set(
  StorytellerActionSchema.options.map((o) => o.shape.kind.value),
);
