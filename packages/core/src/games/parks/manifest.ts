import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "./types";

export const parksManifest = defineManifest({
  slug: "parks",
  seats: { min: 2, max: 2 },
  strategies: [
    {
      id: "random",
      label: AI_STRATEGY_LABELS.random,
      description: AI_STRATEGY_DESCRIPTIONS.random,
      difficulty: "Easy",
    },
  ],
  config: z.object({}),
});
