import { z } from "zod";
import { defineManifest } from "../../machines/manifest";

export const SevenWondersConfigSchema = z.object({
  /** Wonder board sides: all A, all B, or dealt at random. */
  sideMode: z.enum(["A", "B", "random"]).default("random"),
  /** The Edifice expansion — communal projects. */
  edifice: z.boolean().default(false),
});
export type SevenWondersConfig = z.infer<typeof SevenWondersConfigSchema>;

export const sevenWondersManifest = defineManifest({
  slug: "7-wonders",
  seats: { min: 3, max: 7 },
  strategies: [
    {
      id: "random",
      label: "Random",
      description: "Picks a random legal move — trades, wonders and all.",
      difficulty: "Easy",
    },
    {
      id: "search",
      label: "Strategist",
      description:
        "Searches sampled deals for the strongest play. Falls back to Random where the search engine isn't installed.",
      difficulty: "Hard",
    },
  ],
  defaultStrategy: "search",
  config: SevenWondersConfigSchema,
});
