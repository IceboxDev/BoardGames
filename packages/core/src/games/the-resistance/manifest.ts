import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "./types";

export const ResistanceConfigSchema = z.object({
  /** The leader picks which mission to attempt; mission 5 opens after two successes. */
  targeting: z.boolean().default(false),
  /** Skip the spy reveal: spies don't know each other. */
  blindSpies: z.boolean().default(false),
  /** Show every seat the Solver panel (its own view only) during play. */
  liveSolver: z.boolean().default(true),
});
export type ResistanceConfig = z.infer<typeof ResistanceConfigSchema>;

// Hidden-role team game for 5–10. Bots can fill empty room seats.
export const resistanceManifest = defineManifest({
  slug: "the-resistance",
  seats: { min: 5, max: 10 },
  strategies: [
    {
      id: "random",
      label: AI_STRATEGY_LABELS.random,
      description: AI_STRATEGY_DESCRIPTIONS.random,
      difficulty: "Easy",
    },
    {
      id: "analyst",
      label: AI_STRATEGY_LABELS.analyst,
      description: AI_STRATEGY_DESCRIPTIONS.analyst,
      difficulty: "Hard",
    },
  ],
  defaultStrategy: "analyst",
  config: ResistanceConfigSchema,
});
