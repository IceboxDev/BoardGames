import { z } from "zod";
import { GameOutcomeSchema } from "../../machines/outcome.ts";

// Game results (the Set trainer's local history) are per-game JSON blobs,
// opaque at this layer. Online matches are summarised in the shared shape —
// the outcome and who sat where — and their replay logs stay per-game.

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

// ── Online matches ─────────────────────────────────────────────────────

export const MatchSeatSchema = z.object({
  seat: z.number().int().min(0),
  kind: z.enum(["human", "ai"]),
  /** The AI's strategy id; `null` for people. */
  strategy: z.string().nullable(),
  /** A person's display name; `null` for AI seats and unknown accounts. */
  name: z.string().nullable(),
  /** This seat is the account asking. */
  isViewer: z.boolean(),
});
export type MatchSeat = z.infer<typeof MatchSeatSchema>;

/**
 * One finished online game, from the asking account's point of view. Games
 * saved before seats were recorded carry no `seats`; their `viewerSeat` is 0,
 * the seat a solo player always held then.
 */
export const MatchSummarySchema = z.object({
  id: z.number().int(),
  createdAt: z.string(),
  playerCount: z.number().int().min(1),
  outcome: GameOutcomeSchema,
  seats: z.array(MatchSeatSchema),
  viewerSeat: z.number().int().min(0).nullable(),
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

export const MatchSummaryListSchema = z.array(MatchSummarySchema);

/** Full replay log — a per-game JSON blob; opaque at this layer. */
export const ReplayLogSchema = z.unknown();
export type ReplayLog = z.infer<typeof ReplayLogSchema>;
