import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { CODENAMES_AI_MODELS, DEFAULT_CODENAMES_MODEL } from "./ai/models";
import { SEAT_NAMES } from "./seating";
import { LanguageSchema } from "./words";

/** Timer lengths the setup screens offer, in seconds (0 = off). */
export const TIMER_OPTIONS = [0, 60, 90, 120, 180] as const;

export const TimerSecondsSchema = z
  .number()
  .int()
  .refine((n) => (TIMER_OPTIONS as readonly number[]).includes(n), "not an offered timer length");

export const CodenamesConfigSchema = z.object({
  language: LanguageSchema.default("en"),
  /** Seconds a spymaster has for a clue; 0 = no limit. */
  clueTimerSec: TimerSecondsSchema.default(0),
  /** Seconds operatives have to guess; 0 = no limit. */
  guessTimerSec: TimerSecondsSchema.default(0),
});
export type CodenamesConfig = z.infer<typeof CodenamesConfigSchema>;

// Seat roles come from the seat index (`seating.ts`): 0 and 1 are the Red and
// Blue spymasters, the rest alternate Red / Blue operatives — so any table of
// 4–8 is two balanced teams, whichever slots are filled.
export const codenamesManifest = defineManifest({
  slug: "codenames",
  seats: { min: 4, max: 8 },
  seatNames: SEAT_NAMES,
  strategies: CODENAMES_AI_MODELS,
  defaultStrategy: DEFAULT_CODENAMES_MODEL,
  config: CodenamesConfigSchema,
});
