import { z } from "zod";
import { TimeControlSchema } from "../../machines/clock";
import { defineManifest, type StrategyInfo } from "../../machines/manifest";
import { handicapProblem } from "./handicap";

export const GO_STRATEGIES = [
  {
    id: "heuristic",
    label: "Pebble",
    description: "Captures what it can, saves what it must, otherwise plays loosely.",
    difficulty: "Easy",
  },
  {
    id: "mcts",
    label: "Brook",
    description: "Monte Carlo tree search. Sharp on 9×9, thin on the big board.",
    difficulty: "Medium",
  },
  {
    id: "katago-max",
    label: "Mountain",
    description:
      "KataGo searching at full strength — stronger than any professional. Expect to lose.",
    difficulty: "Master",
  },
] as const satisfies readonly StrategyInfo[];

/** Off the ladder since 2026-11-26; old games still name them, and the server can still play them. */
export const GO_RETIRED_STRATEGIES = [
  { id: "katago-5k", label: "5 kyu" },
  { id: "katago-1k", label: "1 kyu" },
  { id: "katago-5d", label: "5 dan" },
] as const;

export type GoStrategy = (typeof GO_STRATEGIES | typeof GO_RETIRED_STRATEGIES)[number]["id"];

export const GoSizeSchema = z.union([z.literal(9), z.literal(13), z.literal(19)]);

export const GoConfigSchema = z
  .object({
    size: GoSizeSchema.default(19),
    handicap: z.number().int().min(0).max(9).default(0),
    /** Absent: 7.5, or 0.5 in a handicap game. */
    komi: z.number().min(-50).max(50).multipleOf(0.5).optional(),
    timeControl: TimeControlSchema.default({ kind: "none" }),
  })
  .superRefine((cfg, ctx) => {
    const problem = handicapProblem(cfg.size, cfg.handicap);
    if (problem) ctx.addIssue({ code: "custom", path: ["handicap"], message: problem });
  });
export type GoConfig = z.infer<typeof GoConfigSchema>;
export type GoConfigInput = z.input<typeof GoConfigSchema>;

export function komiFor(config: Pick<GoConfig, "komi" | "handicap">): number {
  return config.komi ?? (config.handicap > 0 ? 0.5 : 7.5);
}

export const goManifest = defineManifest({
  slug: "go",
  seats: { min: 2, max: 2 },
  // The seat IS the colour: seat 0 plays Black. Solo picks a colour by seat
  // order; a room's host swaps seats.
  seatNames: ["Black", "White"],
  strategies: GO_STRATEGIES,
  defaultStrategy: "mcts",
  retiredStrategies: GO_RETIRED_STRATEGIES,
  config: GoConfigSchema,
});
