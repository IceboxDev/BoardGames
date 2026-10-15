import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { DemonSkillSchema, EditionSchema } from "./schema.ts";
import { MAX_PLAYERS, MIN_PLAYERS } from "./setup.ts";

/** Travellers a table may seat on top of its residents (the rulebook's limit). */
export const MAX_TRAVELLERS = 5;

/** Room seat 0 is always the Storyteller. */
export const STORYTELLER_SEAT = 0;

/** The stand-in bot (`online/bots.ts`) until a real AI exists. */
export const BOT_STRATEGY = "dummy";

export const BotcConfigSchema = z.object({
  edition: EditionSchema.default("trouble-brewing"),
  /** Bluff weighting for the Demon (a practised one gets bolder bluffs). */
  demonSkill: DemonSkillSchema.default("new"),
  /** How long the clock hand rests on each voter, in ms. */
  voteClockMs: z.number().int().min(500).max(10_000).default(1500),
  /** Private whispers between players during the day. */
  whispers: z.boolean().default(true),
  /** Whether the town square chat stays open while the town sleeps. */
  publicChatAtNight: z.boolean().default(false),
});
export type BotcConfig = z.infer<typeof BotcConfigSchema>;

const MAX_SEATS = 1 + MAX_PLAYERS + MAX_TRAVELLERS;

// Online Blood on the Clocktower: a Storyteller (seat 0) and 5–15 residents
// plus up to 5 Travellers. Any seat may be a stand-in bot, so one person can
// play alone as the Storyteller or as a player. The phone companion (solo
// "Companion" card) needs none of this.
export const botcManifest = defineManifest({
  slug: "blood-on-the-clocktower",
  seats: { min: 1 + MIN_PLAYERS, max: MAX_SEATS },
  seatNames: ["Storyteller", ...Array.from({ length: MAX_SEATS - 1 }, (_, i) => `Player ${i + 1}`)],
  strategies: [
    {
      id: BOT_STRATEGY,
      label: "Stand-in",
      description: "A scripted placeholder that plays by the rules, not to win",
      difficulty: "Easy",
    },
  ],
  defaultStrategy: BOT_STRATEGY,
  config: BotcConfigSchema,
});
