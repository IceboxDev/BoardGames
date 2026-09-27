import { z } from "zod";

export type Shape = "diamond" | "oval" | "squiggle";
export type CardColor = "red" | "green" | "purple";
export type Fill = "solid" | "striped" | "empty";
export type Count = 1 | 2 | 3;

export interface SetCardData {
  id: number;
  shape: Shape;
  color: CardColor;
  fill: Fill;
  count: Count;
}

export type GamePhase = "idle" | "dealing" | "playing" | "selecting" | "game-over";

export interface DealEntry {
  slotIndex: number;
  card: SetCardData;
}

export const PerSetRecordSchema = z.object({
  reactionTimeMs: z.number(),
  selectionTimeMs: z.number(),
  totalFindTimeMs: z.number(),
  boardSize: z.number(),
  calledDuringDeal: z.boolean(),
  cardsDealtWhenCalled: z.number(),
});
export type PerSetRecord = z.infer<typeof PerSetRecordSchema>;

/**
 * One trainer run. Kept in the browser and mirrored to the server's game
 * results, so both read paths parse it with this schema.
 */
export const GameRecordSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  durationMs: z.number(),
  setsFound: z.number(),
  incorrectCalls: z.number(),
  accuracy: z.number(),
  netScore: z.number(),
  avgFindTimeMs: z.number(),
  medianFindTimeMs: z.number(),
  fastestSetMs: z.number(),
  slowestSetMs: z.number(),
  consistencyMs: z.number(),
  timeToFirstSetMs: z.number(),
  earlyCallCount: z.number(),
  earlyCallRate: z.number(),
  avgBoardSize: z.number(),
  plusThreeRequests: z.number(),
  hintCount: z.number(),
  longestStreak: z.number(),
  fatigueSlopeMs: z.number(),
  cardsRemaining: z.number(),
  throughput: z.number(),
  rating: z.number(),
  perSetDetails: z.array(PerSetRecordSchema),
});
export type GameRecord = z.infer<typeof GameRecordSchema>;
