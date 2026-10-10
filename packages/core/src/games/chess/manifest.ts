import { z } from "zod";
import { defineManifest, type StrategyInfo } from "../../machines/manifest";
import { type TimeControl, TimeControlSchema } from "./schemas";

/**
 * The AI ladder, easiest first. Every tier above `random` is Stockfish on the
 * server (`server/src/games/chess-agent.ts` maps each id to UCI options); when
 * the engine is unavailable the machine's built-in search plays instead.
 */
export const CHESS_STRATEGIES = [
  {
    id: "random",
    label: "Wanderer",
    description: "Plays any legal move at random. For learning how the pieces move.",
    difficulty: "Easy",
  },
  {
    id: "sf-beginner",
    label: "Pawn",
    description: "Stockfish at its weakest — sees one move ahead and hangs pieces.",
    difficulty: "Easy",
  },
  {
    id: "sf-1400",
    label: "Club player",
    description: "Stockfish limited to about 1400 Elo. Solid, but leaves chances.",
    difficulty: "Medium",
  },
  {
    id: "sf-1800",
    label: "Tournament player",
    description: "About 1800 Elo. Punishes loose pieces and simple blunders.",
    difficulty: "Hard",
  },
  {
    id: "sf-2200",
    label: "Master",
    description: "About 2200 Elo — national-master strength.",
    difficulty: "Hard+",
  },
  {
    id: "sf-2700",
    label: "Grandmaster",
    description: "About 2700 Elo. Elite human strength.",
    difficulty: "Expert",
  },
  {
    id: "sf-max",
    label: "Stockfish",
    description: "Full strength. Stronger than any human who has ever played.",
    difficulty: "Master",
  },
] as const satisfies readonly StrategyInfo[];

export type ChessStrategyId = (typeof CHESS_STRATEGIES)[number]["id"];

/** Time controls offered on the setup and lobby screens, as `minutes+increment`. */
export const TIME_CONTROL_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly control: TimeControl | null;
}[] = [
  { id: "untimed", label: "Untimed", category: "Casual", control: null },
  { id: "1+0", label: "1+0", category: "Bullet", control: { initialMs: 60_000, incrementMs: 0 } },
  {
    id: "3+2",
    label: "3+2",
    category: "Blitz",
    control: { initialMs: 180_000, incrementMs: 2_000 },
  },
  {
    id: "5+3",
    label: "5+3",
    category: "Blitz",
    control: { initialMs: 300_000, incrementMs: 3_000 },
  },
  {
    id: "10+5",
    label: "10+5",
    category: "Rapid",
    control: { initialMs: 600_000, incrementMs: 5_000 },
  },
  {
    id: "15+10",
    label: "15+10",
    category: "Rapid",
    control: { initialMs: 900_000, incrementMs: 10_000 },
  },
  {
    id: "30+0",
    label: "30+0",
    category: "Classical",
    control: { initialMs: 1_800_000, incrementMs: 0 },
  },
];

export const ChessConfigSchema = z.object({
  /** `null` plays without clocks. */
  timeControl: TimeControlSchema.nullable().default(null),
  /** Against an AI a takeback is instant; against a person the opponent must agree. */
  takebacks: z.boolean().default(true),
});
export type ChessConfig = z.infer<typeof ChessConfigSchema>;

export const chessManifest = defineManifest({
  slug: "chess",
  seats: { min: 2, max: 2 },
  seatNames: ["White", "Black"],
  strategies: CHESS_STRATEGIES,
  defaultStrategy: "sf-1400",
  config: ChessConfigSchema,
});
