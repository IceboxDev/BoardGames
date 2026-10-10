/**
 * Go reviews — KataGo's move-by-move analysis of a finished online match or an
 * imported SGF. Values are from Black's side (`winrate` = Black's chance,
 * `scoreLead` > 0 = Black ahead); `loss` is from the mover's side.
 */
import { z } from "zod";

export const GO_SGF_MAX_BYTES = 64 * 1024;

export const GoMoveAnalysisSchema = z.object({
  /** 1-based move number. */
  move: z.number().int().min(1),
  /** Black's win chance and lead in the position AFTER this move. */
  winrate: z.number().min(0).max(1),
  scoreLead: z.number(),
  /** What KataGo preferred instead (GTP vertex), and its line. */
  best: z.string().nullable(),
  pv: z.array(z.string()).max(12),
  /** Points this move gave away versus the best, for the side that played it (≥ 0). */
  loss: z.number().min(0),
});
export type GoMoveAnalysis = z.infer<typeof GoMoveAnalysisSchema>;

export const GoReviewAnalysisSchema = z.object({
  visits: z.number().int().min(1),
  /** Black's win chance and lead before the first move. */
  start: z.object({ winrate: z.number(), scoreLead: z.number() }),
  moves: z.array(GoMoveAnalysisSchema),
});
export type GoReviewAnalysis = z.infer<typeof GoReviewAnalysisSchema>;

export const GoReviewStatusSchema = z.enum(["queued", "running", "done", "failed", "unavailable"]);
export type GoReviewStatus = z.infer<typeof GoReviewStatusSchema>;

export const GoReviewSchema = z.object({
  id: z.number().int().nullable(),
  status: GoReviewStatusSchema,
  /** 0–1 while running. */
  progress: z.number().min(0).max(1),
  analysis: GoReviewAnalysisSchema.nullable(),
  /** The imported record, for an SGF review. */
  sgf: z.string().nullable(),
  error: z.string().nullable(),
});
export type GoReview = z.infer<typeof GoReviewSchema>;

export const CreateGoReviewRequestSchema = z.object({
  sgf: z.string().min(1).max(GO_SGF_MAX_BYTES),
});
export type CreateGoReviewRequest = z.infer<typeof CreateGoReviewRequestSchema>;

export const CreateGoReviewResponseSchema = z.object({ id: z.number().int() });

export const GoReviewListSchema = z.array(
  z.object({
    id: z.number().int(),
    status: GoReviewStatusSchema,
    createdAt: z.string(),
    summary: z.string(),
  }),
);
export type GoReviewList = z.infer<typeof GoReviewListSchema>;
