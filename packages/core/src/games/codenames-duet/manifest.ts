import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { CODENAMES_AI_MODELS, DEFAULT_CODENAMES_MODEL } from "../codenames/ai/models";
import { TimerSecondsSchema } from "../codenames/manifest";
import { LanguageSchema } from "../codenames/words";
import { CampaignMissionSchema } from "./campaign/map";

/** Timer-token counts on offer: 9 is the standard game, fewer is harder. */
export const TOKEN_OPTIONS = [7, 8, 9, 10, 11] as const;
export const STANDARD_TOKENS = 9;
/** The fewest timer tokens a game may have: Hong Kong, Mumbai and Singapore on the mission map. */
export const MIN_TOKENS = 6;

export const DuetConfigSchema = z.object({
  language: LanguageSchema.default("en"),
  /** Turns the pair has before sudden death (the timer tokens). */
  timerTokens: z.number().int().min(MIN_TOKENS).max(11).default(STANDARD_TOKENS),
  /**
   * How many timer tokens start bystander side up — the mistakes the pair may
   * make (mission map). A bystander with none left costs two turns. Absent =
   * every token, the standard game.
   */
  mistakes: z.number().int().min(0).max(11).optional(),
  /** Played as a campaign mission; the server fills in its numbers (`prepareConfig`). */
  campaign: CampaignMissionSchema.optional(),
  clueTimerSec: TimerSecondsSchema.default(0),
  guessTimerSec: TimerSecondsSchema.default(0),
});
export type DuetConfig = z.infer<typeof DuetConfigSchema>;

// Seat 0 holds side A of the key, seat 1 side B.
export const duetManifest = defineManifest({
  slug: "codenames-duet",
  seats: { min: 2, max: 2 },
  seatNames: ["Agent A", "Agent B"],
  strategies: CODENAMES_AI_MODELS,
  defaultStrategy: DEFAULT_CODENAMES_MODEL,
  config: DuetConfigSchema,
});
