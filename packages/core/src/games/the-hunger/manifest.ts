import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { ALL_STRATEGIES } from "./types";

const DIFFICULTY = { random: "Easy", "heuristic-v1": "Medium" } as const;

export const HungerConfigSchema = z.object({
  /** Elder = board side B (end in the Castle or Cemetery); Rookie = side A. */
  mode: z.enum(["elder", "rookie"]).default("elder"),
  /** Elder only: Beginners survive the Mountains too. */
  beginnerSafeMountains: z.boolean().default(false),
});
export type HungerConfig = z.infer<typeof HungerConfigSchema>;

export const theHungerManifest = defineManifest({
  slug: "the-hunger",
  seats: { min: 2, max: 6 },
  // Easiest first; `ALL_STRATEGIES` lists them strongest first.
  strategies: [...ALL_STRATEGIES].reverse().map((s) => ({ ...s, difficulty: DIFFICULTY[s.id] })),
  defaultStrategy: "heuristic-v1",
  config: HungerConfigSchema,
});
