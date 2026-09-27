import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "./types";

export const durakManifest = defineManifest({
  slug: "durak",
  seats: { min: 2, max: 5 },
  strategies: [
    {
      id: "random",
      label: AI_STRATEGY_LABELS.random,
      description: AI_STRATEGY_DESCRIPTIONS.random,
      difficulty: "Easy",
    },
    {
      id: "heuristic-v1",
      label: AI_STRATEGY_LABELS["heuristic-v1"],
      description: AI_STRATEGY_DESCRIPTIONS["heuristic-v1"],
      difficulty: "Medium",
    },
  ],
  defaultStrategy: "heuristic-v1",
  config: z.object({}),
});
