import { z } from "zod";
import { type DifficultyTier, defineManifest } from "../../machines/manifest";
import {
  AI_STRATEGY_DESCRIPTIONS,
  AI_STRATEGY_IDS,
  AI_STRATEGY_LABELS,
  type AIStrategyId,
} from "./strategy-info";

/** The board sizes on offer, `<columns>x<rows>`. Every one fits the 64-bit search bitboard. */
export const BOARD_SIZES = ["7x6", "6x5", "8x7"] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

/** Series lengths on offer: a single game, best of three, best of five. */
export const BEST_OF = [1, 3, 5] as const;
export type BestOf = (typeof BEST_OF)[number];

/** Who opens game 1: a seat, or a coin toss. */
export const FIRST_PLAYER_CHOICES = ["seat0", "seat1", "random"] as const;

export const Connect4ConfigSchema = z.object({
  /** Columns × rows. 7×6 is the classic frame. */
  board: z.enum(BOARD_SIZES).default("7x6"),
  /** Hasbro's PopOut: a turn may instead pop one of your own discs out of the bottom row. */
  popOut: z.boolean().default(false),
  /** A series of games; the first player alternates from game to game. */
  bestOf: z.literal(BEST_OF).default(1),
  /** Who opens game 1. */
  firstPlayer: z.enum(FIRST_PLAYER_CHOICES).default("seat0"),
  /** Hints, the evaluation bar and post-game analysis are shown at this table. */
  assists: z.boolean().default(true),
});
export type Connect4Config = z.infer<typeof Connect4ConfigSchema>;

export function boardDimensions(size: BoardSize): { cols: number; rows: number } {
  const [cols, rows] = size.split("x").map(Number);
  return { cols, rows };
}

/** Each bot's tier on the setup screen, easiest first. */
const STRATEGY_TIERS = {
  blocker: "Easy",
  lookahead: "Medium",
  deep: "Hard",
  perfect: "Expert",
} as const satisfies Record<AIStrategyId, DifficultyTier>;

export const connect4Manifest = defineManifest({
  slug: "connect-4",
  seats: { min: 2, max: 2 },
  seatNames: ["Red", "Yellow"],
  strategies: AI_STRATEGY_IDS.map((id) => ({
    id,
    label: AI_STRATEGY_LABELS[id],
    description: AI_STRATEGY_DESCRIPTIONS[id],
    difficulty: STRATEGY_TIERS[id],
  })),
  defaultStrategy: "blocker",
  config: Connect4ConfigSchema,
});
