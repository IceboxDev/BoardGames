import { z } from "zod";
import { defineManifest } from "../../machines/manifest";
import { SCENARIOS } from "./scenarios";

export const SkyTeamConfigSchema = z.object({
  scenarioId: z
    .string()
    .refine((id) => Object.hasOwn(SCENARIOS, id), { message: "Unknown scenario" })
    .default("yul-montreal"),
});
export type SkyTeamConfig = z.infer<typeof SkyTeamConfigSchema>;

export const skyTeamManifest = defineManifest({
  slug: "sky-team",
  seats: { min: 2, max: 2 },
  seatNames: ["Pilot", "Co-Pilot"],
  strategies: [
    {
      id: "heuristic-v1",
      label: "Heuristic",
      description:
        "Rule-based AI: safe placements, advances under pressure, spends coffee sparingly.",
      difficulty: "Medium",
    },
  ],
  config: SkyTeamConfigSchema,
});
