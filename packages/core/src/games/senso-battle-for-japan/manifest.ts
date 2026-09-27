import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "./types";

export const sensoManifest = defineManifest({
  slug: "senso-battle-for-japan",
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
    {
      id: "aggressive",
      label: AI_STRATEGY_LABELS.aggressive,
      description: AI_STRATEGY_DESCRIPTIONS.aggressive,
      difficulty: "Hard",
    },
    {
      id: "shogun",
      label: AI_STRATEGY_LABELS.shogun,
      description: AI_STRATEGY_DESCRIPTIONS.shogun,
      difficulty: "Hard+",
    },
    {
      id: "tenka",
      label: AI_STRATEGY_LABELS.tenka,
      description: AI_STRATEGY_DESCRIPTIONS.tenka,
      difficulty: "Expert",
    },
    {
      id: "kami",
      label: AI_STRATEGY_LABELS.kami,
      description: AI_STRATEGY_DESCRIPTIONS.kami,
      difficulty: "Master",
    },
  ],
  defaultStrategy: "kami",
  config: z.object({}),
});
