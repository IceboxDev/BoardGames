import { z } from "zod";
import { defineManifest, type StrategyInfo } from "../../machines/manifest";
import { TimeControlSchema } from "../chess/schemas";

/**
 * Bughouse bots. Above `random`, each is Fairy-Stockfish on the server
 * (`server/src/games/chess-agent.ts`), playing its own board from the pieces
 * in hand; partners do not coordinate beyond what the board shows.
 */
export const BUGHOUSE_STRATEGIES = [
  {
    id: "fairy-easy",
    label: "Beetle",
    description: "Fairy-Stockfish looking one move ahead. Slow and sturdy.",
    difficulty: "Easy",
  },
  {
    id: "fairy-medium",
    label: "Hornet",
    description: "Fairy-Stockfish at a middling skill level. Punishes careless drops.",
    difficulty: "Medium",
  },
  {
    id: "fairy-max",
    label: "Mantis",
    description: "Fairy-Stockfish at full strength — drops with intent.",
    difficulty: "Expert",
  },
] as const satisfies readonly StrategyInfo[];

/** Off the ladder since 2026-11-26; old games still name it. */
export const BUGHOUSE_RETIRED_STRATEGIES = [{ id: "random", label: "Wanderer" }] as const;

export const BughouseConfigSchema = z.object({
  /** Bughouse is a timed game; `null` plays without clocks (casual). */
  timeControl: TimeControlSchema.nullable().default({ initialMs: 180_000, incrementMs: 0 }),
});
export type BughouseConfig = z.infer<typeof BughouseConfigSchema>;

export const bughouseManifest = defineManifest({
  slug: "chess-bughouse",
  seats: { min: 4, max: 4 },
  // Partners sit on different boards with opposite colours: 0 & 3, 1 & 2.
  seatNames: ["Board A · White", "Board A · Black", "Board B · White", "Board B · Black"],
  strategies: BUGHOUSE_STRATEGIES,
  defaultStrategy: "fairy-medium",
  retiredStrategies: BUGHOUSE_RETIRED_STRATEGIES,
  config: BughouseConfigSchema,
});
