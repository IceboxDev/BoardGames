import { z } from "zod";

// Game-result and replay payloads are per-game JSON blobs. Until per-game
// schemas land, the shape is `unknown` at the boundary; consumers (UIs,
// tournaments) handle game-specific fields.

// ── Results ────────────────────────────────────────────────────────────

/** A single game-result row — arbitrary shape with a `createdAt` injected by the server. */
export const GameResultSchema = z.object({ createdAt: z.string() }).catchall(z.unknown());
export type GameResult = z.infer<typeof GameResultSchema>;

export const GameResultListSchema = z.array(GameResultSchema);

export const SaveResultResponseSchema = z.object({
  ok: z.literal(true),
  existed: z.boolean().optional(),
});
export type SaveResultResponse = z.infer<typeof SaveResultResponseSchema>;

export const BulkSaveResultsBodySchema = z.object({
  records: z.array(z.unknown()),
});
export type BulkSaveResultsBody = z.input<typeof BulkSaveResultsBodySchema>;

export const BulkSaveResultsResponseSchema = z.object({
  ok: z.literal(true),
  inserted: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type BulkSaveResultsResponse = z.infer<typeof BulkSaveResultsResponseSchema>;

// ── Replays ────────────────────────────────────────────────────────────

export const ReplaySummarySchema = z.object({
  id: z.number().int(),
  aiEngine: z.string().nullable(),
  scoreP0: z.number().nullable(),
  scoreP1: z.number().nullable(),
  winner: z.string().nullable(),
  createdAt: z.string(),
  scores: z.unknown().nullable().optional(),
  playerCount: z.number().int().nullable().optional(),
});
export type ReplaySummary = z.infer<typeof ReplaySummarySchema>;

export const ReplaySummaryListSchema = z.array(ReplaySummarySchema);

/** Full replay log — a per-game JSON blob; opaque at this layer. */
export const ReplayLogSchema = z.unknown();
export type ReplayLog = z.infer<typeof ReplayLogSchema>;
