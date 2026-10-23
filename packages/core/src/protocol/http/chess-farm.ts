/**
 * The chess analysis farm: deep evaluations for opening trees, computed on a
 * worker machine (ws21) and kept in one shared cache on the server.
 *
 *   Members: `POST /api/trainers/chess/evals` — cached results for a batch of
 *            positions, queueing the ones not known yet.
 *   Farm:    `/api/chess-farm/{claim,complete,fail,enqueue,games,popular,status}` behind a
 *            bearer token.
 */
import { z } from "zod";

export const FARM_CLAIM_MAX = 32;
/** Positions a claim may ask for first (the worker's follow-ups, most wanted first). */
export const FARM_PREFER_MAX = 64;
/**
 * A job given back because the node limit stopped its search short carries
 * `error: FARM_NODE_LIMIT_PREFIX + worker + ": …"`; that worker never claims it again.
 */
export const FARM_NODE_LIMIT_PREFIX = "node limit on ";
/**
 * A job handed to the heavy lane (a search that blew up, or a decided position
 * screened before it could) carries `error: heavyMark(…)` until it is done:
 * normal lanes never claim it; the heavy lane takes the smallest estimate first.
 */
export const FARM_HEAVY_PREFIX = "heavy lane: ~";

/** The marker of a job handed to the heavy lane: its estimated normal-lane hours, and why. */
export function heavyMark(estHours: number, why: string): string {
  return `${FARM_HEAVY_PREFIX}${estHours.toFixed(1)} h · ${why}`.slice(0, 500);
}

/** The estimate in a heavy-lane marker, or `null` when `error` isn't one. */
export function heavyEstimate(error: string | null): number | null {
  if (!error?.startsWith(FARM_HEAVY_PREFIX)) return null;
  const h = Number.parseFloat(error.slice(FARM_HEAVY_PREFIX.length));
  return Number.isFinite(h) ? h : 0;
}
export const EVAL_REQUEST_MAX = 400;

/** A FEN as the trainer stores it (board, side, castling, ep, clocks). */
const FenSchema = z
  .string()
  .max(100)
  .regex(/^[pnbrqkPNBRQK1-8/]+ [wb] (?:-|[KQkq]{1,4}) (?:-|[a-h][36])(?: \d+ \d+)?$/);
const UciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

export const EvalKindSchema = z.enum(["user", "opp"]);
export type EvalKind = z.infer<typeof EvalKindSchema>;
/**
 * Where a position sits: 0 on one of your games' lines; 1–3 the short
 * extension past a line end your games left (1 the opponent after your correct
 * move, 2 your answers, 3 the opponent after those — nothing below).
 */
export const EvalStageSchema = z.number().int().min(0).max(3);

export const EvalSourceSchema = z.enum(["farm", "lichess-dump", "lichess-cloud", "chessdb"]);

/** One searched move, scored from the side to move. */
export const FarmLineSchema = z.object({
  uci: UciSchema,
  cp: z.number().int().nullable(),
  mate: z.number().int().nullable(),
  depth: z.number().int().min(0).max(255),
  seldepth: z.number().int().min(0).max(255).nullable(),
  nodes: z.number().int().nonnegative().nullable(),
  pv: z.array(UciSchema).max(24),
});
export type FarmLine = z.infer<typeof FarmLineSchema>;

export const Lc0MoveSchema = z.object({
  uci: UciSchema,
  w: z.number().min(0).max(1),
  d: z.number().min(0).max(1),
  l: z.number().min(0).max(1),
  visits: z.number().int().nonnegative(),
});

/** A finished evaluation. `lines` is ranked best first. */
export const PositionEvalSchema = z.object({
  fen: FenSchema,
  kind: EvalKindSchema,
  spec: z.string().max(32),
  best: UciSchema,
  lines: z.array(FarmLineSchema).min(1).max(12),
  lc0: z.array(Lc0MoveSchema).max(12).nullable(),
  ties: z.array(UciSchema).max(12),
  contested: z.boolean(),
  depth: z.number().int().min(0).max(255),
  source: EvalSourceSchema,
  engine: z.string().max(80),
  seconds: z.number().nonnegative(),
});
export type PositionEval = z.infer<typeof PositionEvalSchema>;

// ── Members ────────────────────────────────────────────────────────────

export const EvalRequestItemSchema = z.object({
  fen: FenSchema,
  kind: EvalKindSchema,
  /** Your games reaching the position (decides its depth tier). */
  reach: z.number().int().min(0),
  stage: EvalStageSchema.default(0),
});
export const EvalRequestBodySchema = z.object({
  items: z.array(EvalRequestItemSchema).min(1).max(EVAL_REQUEST_MAX),
});
export const EvalRequestResponseSchema = z.object({
  /** Known results, keyed by the request's FEN. */
  results: z.record(z.string(), PositionEvalSchema),
  /** Positions waiting on the farm (requested now or before). */
  queued: z.number().int().nonnegative(),
  /** The whole farm queue, for an ETA. */
  farm: z.object({
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    /** Mean seconds per finished job over the last day, if any. */
    avgSeconds: z.number().nonnegative().nullable(),
    /** When a farm worker last checked in (ISO), or null. */
    lastSeen: z.string().nullable(),
  }),
});
export type EvalRequestResponse = z.infer<typeof EvalRequestResponseSchema>;

/** Positions a queue-place request may ask about (a colour's waiting positions). */
export const EVAL_QUEUE_MAX = 3000;
export const EvalQueueBodySchema = z.object({
  items: z
    .array(z.object({ fen: FenSchema, kind: EvalKindSchema }))
    .min(1)
    .max(EVAL_QUEUE_MAX),
});
/** Where each asked position stands at the farm, for an ETA. */
export const EvalQueueResponseSchema = z.object({
  /**
   * Keyed by the request's FEN: running now, or queued with `ahead` jobs the
   * farm takes first; a position with no job is left out.
   */
  places: z.record(
    z.string(),
    z.object({ status: z.enum(["queued", "running"]), ahead: z.number().int().nonnegative() }),
  ),
  /** Searches running at once (busy lanes). */
  lanes: z.number().int().nonnegative(),
  /** Mean seconds per finished job over the last day, if any. */
  avgSeconds: z.number().nonnegative().nullable(),
});
export type EvalQueueResponse = z.infer<typeof EvalQueueResponseSchema>;

// ── Farm ───────────────────────────────────────────────────────────────

export const FarmClaimBodySchema = z.object({
  worker: z.string().min(1).max(40),
  max: z.number().int().min(1).max(FARM_CLAIM_MAX),
  /**
   * Queued positions to take before anything else, in this order: the
   * follow-ups of what the worker just searched, while its hash still holds them.
   */
  prefer: z.array(FenSchema).max(FARM_PREFER_MAX).optional(),
  /**
   * Only these kinds (a worker's role: ws21 takes `user`, the AWS fleet
   * `opp`); every kind when absent.
   */
  kinds: z.array(EvalKindSchema).min(1).max(2).optional(),
  /**
   * `reach` (default): most games first, the preferred positions breaking ties —
   * breadth first, the main lines done soonest. `deep`: the preferred positions
   * first, then the deepest waiting one — a worker that finishes lines.
   */
  order: z.enum(["reach", "deep"]).optional(),
  /**
   * `normal` (default) never takes a job handed to the heavy lane; `heavy`
   * takes only those, its own unfinished one first, then the smallest estimate.
   */
  lane: z.enum(["normal", "heavy"]).optional(),
});
export const FarmJobSchema = z.object({
  id: z.number().int(),
  fen: FenSchema,
  kind: EvalKindSchema,
  reach: z.number().int().min(0),
  spec: z.string(),
  attempts: z.number().int().min(0),
  /** The member whose tree asked first (whose games the follow-ups come from). */
  requestedBy: z.string().nullable(),
  stage: EvalStageSchema.default(0),
});
export type FarmJob = z.infer<typeof FarmJobSchema>;
export const FarmClaimResponseSchema = z.object({
  jobs: z.array(FarmJobSchema),
  /** Seconds a claim lasts before another worker may take it. */
  leaseSeconds: z.number().int(),
});

export const FarmCompleteBodySchema = z.object({
  worker: z.string().min(1).max(40),
  id: z.number().int(),
  result: PositionEvalSchema,
});
export const FarmFailBodySchema = z.object({
  worker: z.string().min(1).max(40),
  id: z.number().int(),
  error: z.string().max(500),
  /** Put it back for another try (false = give up on it). */
  retry: z.boolean(),
  /** The worker was stopped, nothing went wrong: back in the queue, the attempt not counted. */
  released: z.boolean().optional(),
  /**
   * Hand the job to the heavy lane instead (back in the queue, the attempt not
   * counted): how long it would take on a normal lane, in hours, and why.
   */
  heavy: z.object({ estHours: z.number().nonnegative(), why: z.string().max(200) }).optional(),
});
export const FarmOkSchema = z.object({ ok: z.literal(true) });

/** The worker queues a finished position's follow-ups for the member who asked. */
export const FarmEnqueueBodySchema = z.object({
  requestedBy: z.string().min(1).max(64),
  items: z.array(EvalRequestItemSchema).min(1).max(FARM_PREFER_MAX),
});
export const FarmEnqueueResponseSchema = z.object({
  /** Positions now waiting (the rest were already evaluated). */
  queued: z.array(FenSchema),
  /** The ones already evaluated, so the worker can look for gaps below them. */
  known: z.record(z.string(), PositionEvalSchema).optional(),
});

/** A member's games as one colour, for the worker's follow-ups (paged like the trainer's). */
export const FarmGamesQuerySchema = z.object({
  user: z.string().min(1).max(64),
  color: z.enum(["w", "b"]),
  cursor: z
    .string()
    .regex(/^\d+:[A-Za-z0-9]{8}$/)
    .optional(),
});
export const FarmGamesPageSchema = z.object({
  games: z.array(
    z.object({ id: z.string(), uci: z.string(), result: z.enum(["win", "loss", "draw"]) }),
  ),
  next: z.string().nullable(),
});
/** The lichess explorer's most played moves at a position (for padding opponent replies). */
export const FarmPopularQuerySchema = z.object({ fen: FenSchema });
export const FarmPopularResponseSchema = z.object({
  /** Most played first, castling as the king's move (`e1g1`). */
  moves: z.array(z.object({ uci: UciSchema, games: z.number().int().nonnegative() })).max(12),
});
export const FarmStatusSchema = EvalRequestResponseSchema.shape.farm.extend({
  done: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Jobs handed to the heavy lane: waiting, and being searched. */
  heavy: z.object({
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
  }),
});
