import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { AI_ENGINE_DESCRIPTIONS, AI_ENGINE_LABELS } from "./types";

export const lostCitiesManifest = defineManifest({
  slug: "lost-cities",
  seats: { min: 2, max: 2 },
  strategies: [
    {
      id: "ismcts-v1",
      label: AI_ENGINE_LABELS["ismcts-v1"],
      description: AI_ENGINE_DESCRIPTIONS["ismcts-v1"],
      difficulty: "Easy",
    },
    {
      id: "ismcts-v4",
      label: AI_ENGINE_LABELS["ismcts-v4"],
      description: AI_ENGINE_DESCRIPTIONS["ismcts-v4"],
      difficulty: "Medium",
    },
    {
      id: "ismcts-v5",
      label: AI_ENGINE_LABELS["ismcts-v5"],
      description: AI_ENGINE_DESCRIPTIONS["ismcts-v5"],
      difficulty: "Hard",
    },
    {
      id: "ismcts-v6",
      label: AI_ENGINE_LABELS["ismcts-v6"],
      description: AI_ENGINE_DESCRIPTIONS["ismcts-v6"],
      difficulty: "Hard+",
    },
  ],
  defaultStrategy: "ismcts-v4",
  config: z.object({}),
});
