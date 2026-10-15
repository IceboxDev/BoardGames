// What each seat sees — the only path a secret travels.
//
// The Storyteller sees everything. A player sees the town (`publicLife`, the
// timeline, the square), their own character AS TOLD (`shown` — a Drunk sees
// their Townsfolk, a Lunatic their Demon), what they were told, their own
// whispers and that other whispers happened, and — only once the game is
// over — the Grimoire. A player view never reads the companion state except
// through the fields listed here; `view.test.ts` plays whole games and checks
// every player view after every step for anything that isn't theirs to know.

import { z } from "zod";
import { isTraveller, nightQueue, nightStepId } from "../companion.ts";
import { BotcConfigSchema } from "../manifest.ts";
import {
  CharacterIdSchema,
  CompanionStateSchema,
  EditionSchema,
  NightStepIdSchema,
} from "../schema.ts";
import { type WakePrompt, wakePrompt } from "../wake-prompts.ts";
import { chairOf, roomSeatOf, STORYTELLER } from "./apply.ts";
import {
  type BotcOnline,
  ChatMessageSchema,
  DeliverySchema,
  OnlineChoiceSchema,
  OnlineDaySchema,
  RequestSchema,
  RoomSeatSchema,
  SetupStageSchema,
  ShownSchema,
  StageSchema,
  TimelineEntrySchema,
  WakeSchema,
  WhisperSchema,
} from "./state.ts";

/** How much of the square and the story a view carries. */
export const VIEW_LIMIT = 300;

const PhaseViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("setup") }).strict(),
  z.object({ kind: z.literal("reveal") }).strict(),
  z.object({ kind: z.literal("night"), number: z.number().int() }).strict(),
  z.object({ kind: z.literal("day"), number: z.number().int() }).strict(),
  z
    .object({ kind: z.literal("ended"), winner: z.enum(["good", "evil"]), reason: z.string() })
    .strict(),
]);
export type PhaseView = z.infer<typeof PhaseViewSchema>;

/** One chair of the town square, as everyone sees it. */
export const TownSeatSchema = z
  .object({
    seat: RoomSeatSchema,
    alive: z.boolean(),
    ghostVote: z.boolean(),
    left: z.boolean(),
    /** Travellers' characters are public; their alignment isn't. */
    traveller: CharacterIdSchema.optional(),
  })
  .strict();
export type TownSeat = z.infer<typeof TownSeatSchema>;

/** A woken player's prompt, in room seats. */
export const WakePromptViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("info") }).strict(),
  z
    .object({
      kind: z.literal("players"),
      min: z.number().int(),
      max: z.number().int(),
      filter: z.enum(["any", "alive", "dead"]),
      allowSelf: z.boolean(),
      excluded: z.array(RoomSeatSchema),
    })
    .strict(),
  z.object({ kind: z.literal("character"), optional: z.boolean() }).strict(),
  z.object({ kind: z.literal("player-and-character") }).strict(),
]);
export type WakePromptView = z.infer<typeof WakePromptViewSchema>;

const CommonViewShape = {
  you: RoomSeatSchema,
  stage: StageSchema,
  phase: PhaseViewSchema,
  edition: EditionSchema,
  config: BotcConfigSchema,
  names: z.array(z.string()),
  connected: z.array(z.boolean()),
  town: z.array(TownSeatSchema),
  day: OnlineDaySchema,
  timeline: z.array(TimelineEntrySchema),
  chat: z.array(ChatMessageSchema),
  chatSettings: z.object({ publicOpen: z.boolean(), whispersOpen: z.boolean() }).strict(),
  requests: z.array(RequestSchema),
};

export const PlayerViewSchema = z
  .object({
    role: z.literal("player"),
    ...CommonViewShape,
    me: z
      .object({
        shown: ShownSchema.nullable(),
        inbox: z.array(DeliverySchema),
        /** Set while the Storyteller has woken you. */
        wake: z
          .object({
            stepId: NightStepIdSchema,
            prompt: WakePromptViewSchema,
            choice: OnlineChoiceSchema.optional(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    /** Your whispers, both ways. */
    whispers: z.array(WhisperSchema),
    /** That other whispers happened — who and when, never what. */
    whisperTicker: z
      .array(z.object({ from: RoomSeatSchema, to: RoomSeatSchema, at: z.number() }).strict())
      .max(50),
    /** The whole truth, once the game is over. */
    reveal: z
      .object({ grimoire: CompanionStateSchema, whispers: z.array(WhisperSchema) })
      .strict()
      .optional(),
  })
  .strict();
export type PlayerView = z.infer<typeof PlayerViewSchema>;

export const StorytellerViewSchema = z
  .object({
    role: z.literal("storyteller"),
    ...CommonViewShape,
    rev: z.number().int(),
    seed: z.number().int(),
    setup: SetupStageSchema.nullable(),
    companion: CompanionStateSchema.nullable(),
    publicLife: z.array(z.boolean()),
    shown: z.array(ShownSchema.nullable()),
    inbox: z.array(z.array(DeliverySchema)),
    wake: WakeSchema.nullable(),
    whispers: z.array(WhisperSchema),
    undoLabel: z.string().nullable(),
    redoLabel: z.string().nullable(),
  })
  .strict();
export type StorytellerView = z.infer<typeof StorytellerViewSchema>;

export const BotcViewSchema = z.discriminatedUnion("role", [
  PlayerViewSchema,
  StorytellerViewSchema,
]);
export type BotcView = z.infer<typeof BotcViewSchema>;

function phaseView(game: BotcOnline): PhaseView {
  const phase = game.companion?.phase;
  if (!phase) return { kind: "setup" };
  switch (phase.kind) {
    case "reveal":
      return { kind: "reveal" };
    case "night":
      return { kind: "night", number: phase.night };
    case "day":
      return { kind: "day", number: phase.day };
    case "ended":
      return { kind: "ended", winner: phase.winner, reason: phase.reason };
  }
}

function town(game: BotcOnline): TownSeat[] {
  if (!game.companion) {
    return (game.setup?.order ?? []).map((seat) => ({
      seat,
      alive: true,
      ghostVote: true,
      left: false,
    }));
  }
  return game.companion.players.flatMap((p) => {
    if (p.roomSeat === undefined) return [];
    return [
      {
        seat: p.roomSeat,
        alive: game.publicLife[p.roomSeat] ?? true,
        ghostVote: p.ghostVote,
        left: p.left ?? false,
        ...(isTraveller(p) ? { traveller: p.character } : {}),
      },
    ];
  });
}

function common(game: BotcOnline, you: number) {
  return {
    you,
    stage: game.stage,
    phase: phaseView(game),
    edition: game.config.edition,
    config: game.config,
    names: game.names,
    connected: game.connected,
    town: town(game),
    day: game.day,
    timeline: game.timeline.slice(-VIEW_LIMIT),
    chat: game.chat.slice(-VIEW_LIMIT),
    chatSettings: game.chatSettings,
    requests: game.requests.slice(-VIEW_LIMIT),
  };
}

/** The prompt in room seats (the excluded chairs mapped to people). */
function promptView(game: BotcOnline, prompt: WakePrompt): WakePromptView {
  if (prompt.kind !== "players") return prompt;
  return {
    ...prompt,
    excluded: prompt.excluded.flatMap((c) => {
      const rs = roomSeatOf(game, c);
      return rs === undefined ? [] : [rs];
    }),
  };
}

function myWake(game: BotcOnline, seat: number): PlayerView["me"]["wake"] {
  const wake = game.wake;
  const state = game.companion;
  if (!wake || !state || !wake.seats.includes(seat)) return null;
  const step = nightQueue(state).find((s) => nightStepId(s) === wake.stepId);
  if (!step || chairOf(game, seat) === undefined) return null;
  const choice = wake.choices[String(seat)];
  return {
    stepId: wake.stepId,
    prompt: promptView(game, wakePrompt(state, step)),
    ...(choice ? { choice } : {}),
  };
}

export function playerView(game: BotcOnline, seat: number): PlayerView {
  const over = game.stage === "over";
  const mine = game.whispers.filter((w) => w.from === seat || w.to === seat);
  const others = game.whispers.filter((w) => w.from !== seat && w.to !== seat);
  return {
    role: "player",
    ...common(game, seat),
    me: {
      shown: game.shown[seat] ?? null,
      inbox: game.inbox[seat] ?? [],
      wake: over ? null : myWake(game, seat),
    },
    whispers: mine.slice(-VIEW_LIMIT),
    whisperTicker: others.slice(-50).map((w) => ({ from: w.from, to: w.to, at: w.at })),
    ...(over && game.companion
      ? { reveal: { grimoire: game.companion, whispers: game.whispers.slice(-VIEW_LIMIT) } }
      : {}),
  };
}

export function storytellerView(game: BotcOnline): StorytellerView {
  return {
    role: "storyteller",
    ...common(game, STORYTELLER),
    rev: game.rev,
    seed: game.seed,
    setup: game.setup,
    companion: game.companion,
    publicLife: game.publicLife,
    shown: game.shown,
    inbox: game.inbox,
    wake: game.wake,
    whispers: game.whispers.slice(-VIEW_LIMIT * 2),
    undoLabel: game.past.at(-1)?.label ?? null,
    redoLabel: game.future.at(-1)?.label ?? null,
  };
}

/** The view for any seat (a seat beyond the table sees what a player would, of nobody). */
export function viewFor(game: BotcOnline, seat: number): BotcView {
  return seat === STORYTELLER ? storytellerView(game) : playerView(game, seat);
}
