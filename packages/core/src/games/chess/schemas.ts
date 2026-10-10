/**
 * Chess's wire shapes: the actions a seat may send, the view each seat gets,
 * and the replay log. The WS envelope keeps per-game payloads `unknown`; the
 * browser parses them with these (no `as` casts at the boundary), and the
 * types below are derived from them, never re-declared.
 */

import { z } from "zod";

export const ColorSchema = z.enum(["w", "b"]);
export const PieceTypeSchema = z.enum(["p", "n", "b", "r", "q", "k"]);

/** UCI text: `e2e4`, `e7e8q`, or a drop `N@f3`. */
export const UciSchema = z.string().regex(/^(?:[a-h][1-8][a-h][1-8][qrbn]?|[PNBRQ]@[a-h][1-8])$/);

export const TimeControlSchema = z.object({
  initialMs: z
    .number()
    .int()
    .min(15_000)
    .max(3 * 60 * 60_000),
  incrementMs: z.number().int().min(0).max(60_000),
});
export type TimeControl = z.infer<typeof TimeControlSchema>;

export const DrawClaimSchema = z.enum(["threefold", "fifty-move", "abandon"]);
export type DrawClaim = z.infer<typeof DrawClaimSchema>;

export const ChessActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), uci: UciSchema }),
  z.object({ kind: z.literal("resign") }),
  z.object({ kind: z.literal("offer-draw") }),
  z.object({ kind: z.literal("accept-draw") }),
  z.object({ kind: z.literal("decline-draw") }),
  z.object({ kind: z.literal("claim-draw"), reason: DrawClaimSchema }),
  z.object({ kind: z.literal("claim-win") }),
  /** Against an AI: undo your last move (and its reply) at once. */
  z.object({ kind: z.literal("takeback") }),
  /** Against a person: ask; they accept or decline. */
  z.object({ kind: z.literal("request-takeback") }),
  z.object({ kind: z.literal("accept-takeback") }),
  z.object({ kind: z.literal("decline-takeback") }),
]);
export type ChessAction = z.infer<typeof ChessActionSchema>;

export const TerminationSchema = z.enum([
  "checkmate",
  "resign",
  "timeout",
  /** The flagged side's opponent had only a king: a draw, not a win. */
  "timeout-vs-insufficient",
  "stalemate",
  "insufficient",
  "threefold",
  "fivefold",
  "fifty-move",
  "seventy-five-move",
  "agreement",
  /** The opponent left the game and the remaining player claimed it. */
  "abandon",
]);
export type Termination = z.infer<typeof TerminationSchema>;

export const ChessResultSchema = z.object({
  /** `null` for a draw. */
  winner: ColorSchema.nullable(),
  termination: TerminationSchema,
});
export type ChessResult = z.infer<typeof ChessResultSchema>;

export const ClockViewSchema = z.object({
  remainingMs: z.object({ w: z.number(), b: z.number() }),
  /** Whose clock is running, or `null` when the game is over. */
  running: ColorSchema.nullable(),
  incrementMs: z.number(),
  /**
   * The server's time when the view was built. `remainingMs[running]` was
   * true at that instant; the browser counts down from it.
   */
  serverNow: z.number(),
});
export type ClockView = z.infer<typeof ClockViewSchema>;

export const HistoryEntrySchema = z.object({
  uci: UciSchema,
  san: z.string(),
  by: ColorSchema,
  /** The mover's clock after the move (increment included), when timed. */
  clockMs: z.number().nullable(),
  captured: PieceTypeSchema.nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const ChessPlayerViewSchema = z.object({
  /** The current position. */
  fen: z.string(),
  /** The position the game started from (replays rebuild every step from it). */
  startFen: z.string(),
  /** This seat's colour; `null` for a seat that isn't playing (never today). */
  color: ColorSchema.nullable(),
  /** Every seat's colour, by seat index. */
  seatColors: z.array(ColorSchema),
  /** Which seats are AI. */
  aiSeats: z.array(z.number().int()),
  history: z.array(HistoryEntrySchema),
  clock: ClockViewSchema.nullable(),
  /** The colour with a draw offer standing. */
  drawOffer: ColorSchema.nullable(),
  /** The colour that asked to take a move back. */
  takebackRequest: ColorSchema.nullable(),
  /** A draw the side to move could claim right now. */
  claimableDraw: z.enum(["threefold", "fifty-move"]).nullable(),
  /** Seats currently disconnected (rooms). */
  disconnected: z.array(z.number().int()),
  /** Seats whose opponent may now claim the game because they left. */
  abandoned: z.array(z.number().int()),
  aiThinking: z.boolean(),
  result: ChessResultSchema.nullable(),
  timeControl: TimeControlSchema.nullable(),
});
export type ChessPlayerView = z.infer<typeof ChessPlayerViewSchema>;

export const ChessReplayLogSchema = z.object({
  formatVersion: z.literal(1),
  variant: z.literal("chess"),
  startFen: z.string(),
  timeControl: TimeControlSchema.nullable(),
  /** Seat 0 is White. AI seats carry their strategy id, people `null`. */
  strategies: z.array(z.string().nullable()),
  moves: z.array(HistoryEntrySchema),
  result: ChessResultSchema,
});
export type ChessReplayLog = z.infer<typeof ChessReplayLogSchema>;
