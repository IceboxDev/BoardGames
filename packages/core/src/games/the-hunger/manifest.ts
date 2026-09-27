import { z } from "zod";
import { type DifficultyTier, defineManifest } from "../../machines/manifest";
import { type AIStrategyId, ALL_STRATEGIES } from "./types";

const DIFFICULTY = {
  random: "Easy",
  "heuristic-v1": "Medium",
  strigoi: "Hard",
  dracula: "Expert",
} as const satisfies Record<AIStrategyId, DifficultyTier>;

// Easiest first.
const ORDER: readonly AIStrategyId[] = ["random", "heuristic-v1", "strigoi", "dracula"];

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
  strategies: ORDER.map((id) => {
    const s = ALL_STRATEGIES.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown The Hunger strategy ${id}`);
    return { id, label: s.label, description: s.description, difficulty: DIFFICULTY[id] };
  }),
  defaultStrategy: "heuristic-v1",
  config: HungerConfigSchema,
});
