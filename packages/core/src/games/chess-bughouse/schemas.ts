/**
 * Bughouse's wire shapes. Two boards of chess, four seats, two teams: the
 * actions a seat may send, the view each seat gets and the replay log. Types
 * derive from the schemas.
 */

import { z } from "zod";
import {
  ClockViewSchema,
  ColorSchema,
  HistoryEntrySchema,
  TimeControlSchema,
  UciSchema,
} from "../chess/schemas";

/** Quick messages to your partner — what bughouse players shout across the table. */
export const SIGNAL_CODES = [
  "need-p",
  "need-n",
  "need-b",
  "need-r",
  "need-q",
  "sit",
  "go",
] as const;
export const SignalCodeSchema = z.enum(SIGNAL_CODES);
export type SignalCode = z.infer<typeof SignalCodeSchema>;

export const BughouseActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), uci: UciSchema }),
  z.object({ kind: z.literal("resign") }),
  z.object({ kind: z.literal("signal"), code: SignalCodeSchema }),
  /** An opponent has been gone a minute: end the game in your team's favour. */
  z.object({ kind: z.literal("claim-win") }),
]);
export type BughouseAction = z.infer<typeof BughouseActionSchema>;

export const BughouseTerminationSchema = z.enum(["checkmate", "resign", "timeout", "abandon"]);

export const BughouseResultSchema = z.object({
  /** 0 = seats 0 & 3 (A-White, B-Black); 1 = seats 1 & 2. */
  winningTeam: z.union([z.literal(0), z.literal(1)]),
  /** The board where it was decided. */
  board: z.union([z.literal(0), z.literal(1)]),
  /** The seat that lost it (mated, flagged, resigned or left). */
  loserSeat: z.number().int().min(0).max(3),
  termination: BughouseTerminationSchema,
});
export type BughouseResult = z.infer<typeof BughouseResultSchema>;

export const BoardViewSchema = z.object({
  fen: z.string(),
  history: z.array(HistoryEntrySchema),
  clock: ClockViewSchema.nullable(),
  aiThinking: z.boolean(),
});
export type BoardView = z.infer<typeof BoardViewSchema>;

export const SignalSchema = z.object({
  seat: z.number().int(),
  code: SignalCodeSchema,
  /** Server time it was sent (ms). */
  at: z.number(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const BughousePlayerViewSchema = z.object({
  boards: z.tuple([BoardViewSchema, BoardViewSchema]),
  /** The viewing seat, its board and colour. */
  seat: z.number().int(),
  board: z.union([z.literal(0), z.literal(1)]),
  color: ColorSchema,
  partner: z.number().int(),
  aiSeats: z.array(z.number().int()),
  disconnected: z.array(z.number().int()),
  /** Seats gone long enough for the other team to claim the game. */
  abandoned: z.array(z.number().int()),
  /** Your team's signals, newest last. */
  signals: z.array(SignalSchema),
  result: BughouseResultSchema.nullable(),
  timeControl: TimeControlSchema.nullable(),
});
export type BughousePlayerView = z.infer<typeof BughousePlayerViewSchema>;

export const BughouseReplayMoveSchema = z.object({
  board: z.union([z.literal(0), z.literal(1)]),
  seat: z.number().int(),
  uci: UciSchema,
  san: z.string(),
  /** The board's position after the move — pockets change from the other board, so steps can't be recomputed from one board's moves. */
  fenAfter: z.string(),
  /** The partner board's position after the move (its pocket may have grown). */
  otherFenAfter: z.string(),
  /** ms since the game began. */
  at: z.number(),
});
export type BughouseReplayMove = z.infer<typeof BughouseReplayMoveSchema>;

export const BughouseReplayLogSchema = z.object({
  formatVersion: z.literal(1),
  variant: z.literal("bughouse"),
  startFen: z.string(),
  timeControl: TimeControlSchema.nullable(),
  strategies: z.array(z.string().nullable()),
  moves: z.array(BughouseReplayMoveSchema),
  result: BughouseResultSchema,
});
export type BughouseReplayLog = z.infer<typeof BughouseReplayLogSchema>;
