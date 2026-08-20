import { z } from "zod";

// Game-result and replay payloads are per-game JSON blobs. Until per-game
// schemas land, the shape is `unknown` at the boundary; consumers (UIs,
// tournaments) handle game-specific fields.

// ── Results ────────────────────────────────────────────────────────────

/** A single game-result row — arbitrary shape with a `createdAt` injected by the server. */
export const GameResultSchema = z.object({ createdAt: z.string() }).catchall(z.unknown());
export type GameResult = z.infer<typeof GameResultSchema>;

export const GameResultListSchema = z.array(GameResultSchema);

/**
 * `GET /api/games/:slug/results?limit=<n>`.
 *
 * The handler used to do `Number(c.req.query("limit") ?? 10000)` and bind the
 * result straight into `LIMIT ?`. Four distinct bad outcomes fell out of that:
 * `?limit=abc` bound NaN (libsql throws "Only finite numbers…" → 500),
 * `?limit=2.5` bound a float (SQLITE_MISMATCH → 500), `?limit=` bound 0 and
 * silently returned nothing, and `?limit=-1` meant *unlimited* to SQLite.
 * Coercing and rejecting here makes all four a 400 with a readable message.
 *
 * The ceiling and the default both stay at the handler's previous default
 * (10 000) on purpose: the Set trainer already fetches `?limit=10000` to
 * reconcile its local history, and the bug was never that the number was
 * large — it was that unvalidated text reached the SQL binder.
 */
export const GameResultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10_000).default(10_000),
});
export type GameResultsQuery = z.input<typeof GameResultsQuerySchema>;

/** `GET /api/games/:slug/replays?limit=<n>` — same reasoning, smaller ceiling
 *  (a replay summary row is heavier and the UI lists a handful). */
export const ReplayListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ReplayListQuery = z.input<typeof ReplayListQuerySchema>;

/**
 * Request body for `POST /:slug/results`. The per-game result shape is still
 * opaque (`z.unknown()` values — per-game schemas are a follow-up), but the
 * boundary at least enforces that the payload is a JSON object rather than an
 * array/primitive, and that `id` (used as the dedup client key) is a string
 * when present. Rejects malformed bodies at the wire instead of stringifying
 * whatever arrives straight into the database.
 */
export const SaveResultBodySchema = z.object({ id: z.string().optional() }).catchall(z.unknown());
export type SaveResultBody = z.infer<typeof SaveResultBodySchema>;

export const SaveResultResponseSchema = z.object({
  ok: z.literal(true),
  existed: z.boolean().optional(),
});
export type SaveResultResponse = z.infer<typeof SaveResultResponseSchema>;

/**
 * Largest bulk upload accepted in one request. Every record becomes one
 * statement in a single `db.batch(..., "write")`, so an uncapped array is an
 * uncapped transaction against the production database — issued by any
 * authenticated member, with no user attribution on the rows it writes.
 * Clients that need more should page.
 */
export const MAX_BULK_RESULT_RECORDS = 500;

export const BulkSaveResultsBodySchema = z.object({
  records: z.array(z.unknown()).max(MAX_BULK_RESULT_RECORDS),
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
