import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { AI_STRATEGY_DESCRIPTIONS, AI_STRATEGY_LABELS } from "./types";

export const sensoManifest = defineManifest({
  slug: "senso-battle-for-japan",
  seats: { min: 2, max: 5 },
  strategies: [
    {
      id: "heuristic-v1",
      label: AI_STRATEGY_LABELS["heuristic-v1"],
      description: AI_STRATEGY_DESCRIPTIONS["heuristic-v1"],
      difficulty: "Medium",
    },
    {
      id: "shogun",
      label: AI_STRATEGY_LABELS.shogun,
      description: AI_STRATEGY_DESCRIPTIONS.shogun,
      difficulty: "Hard",
    },
    {
      id: "kami",
      label: AI_STRATEGY_LABELS.kami,
      description: AI_STRATEGY_DESCRIPTIONS.kami,
      difficulty: "Master",
    },
  ],
  defaultStrategy: "kami",
  /** Off the ladder since 2026-11-26; old games still name them. */
  retiredStrategies: (["random", "aggressive", "tenka"] as const).map((id) => ({
    id,
    label: AI_STRATEGY_LABELS[id],
  })),
  config: z.object({}),
});
