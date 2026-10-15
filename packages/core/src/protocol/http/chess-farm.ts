/**
 * The chess analysis farm: deep evaluations for opening trees, computed on a
 * worker machine (ws21) and kept in one shared cache on the server.
 *
 *   Members: `POST /api/trainers/chess/evals` — cached results for a batch of
 *            positions, queueing the ones not known yet.
 *   Farm:    `/api/chess-farm/{claim,complete,fail,status}` behind a bearer token.
 */
import { z } from "zod";

export const FARM_CLAIM_MAX = 32;
export const EVAL_REQUEST_MAX = 400;

/** A FEN as the trainer stores it (board, side, castling, ep, clocks). */
const FenSchema = z
  .string()
  .max(100)
  .regex(/^[pnbrqkPNBRQK1-8/]+ [wb] (?:-|[KQkq]{1,4}) (?:-|[a-h][36])(?: \d+ \d+)?$/);
const UciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

export const EvalKindSchema = z.enum(["user", "opp"]);
export type EvalKind = z.infer<typeof EvalKindSchema>;

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

// ── Farm ───────────────────────────────────────────────────────────────

export const FarmClaimBodySchema = z.object({
  worker: z.string().min(1).max(40),
  max: z.number().int().min(1).max(FARM_CLAIM_MAX),
});
export const FarmJobSchema = z.object({
  id: z.number().int(),
  fen: FenSchema,
  kind: EvalKindSchema,
  reach: z.number().int().min(0),
  spec: z.string(),
  attempts: z.number().int().min(0),
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
});
export const FarmOkSchema = z.object({ ok: z.literal(true) });
export const FarmStatusSchema = EvalRequestResponseSchema.shape.farm.extend({
  done: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
