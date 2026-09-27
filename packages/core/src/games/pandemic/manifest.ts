import { z } from "zod";
import { defineManifest } from "../../machines/manifest";

export const PandemicConfigSchema = z.object({
  /** Epidemic cards in the deck: 4 introductory, 5 standard, 6 heroic. */
  difficulty: z.union([z.literal(4), z.literal(5), z.literal(6)]).default(4),
});
export type PandemicConfig = z.infer<typeof PandemicConfigSchema>;

// Co-operative with no AI: every seat is a role a person plays. Solo is one
// person holding every seat.
export const pandemicManifest = defineManifest({
  slug: "pandemic",
  seats: { min: 2, max: 4 },
  strategies: [],
  config: PandemicConfigSchema,
});
