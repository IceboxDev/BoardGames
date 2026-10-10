/**
 * Admin inspection of the server's AI ledger (`server/src/lib/ai/ledger.ts`):
 * spend per feature since the process started, and the recent calls in full —
 * prompt, answer, tokens and billed cost — so a surprising AI move in a
 * production game can be read back afterwards. In memory only: a restart
 * (deploy) clears it.
 *
 *   GET /api/admin/ai-calls?feature=codenames&limit=50 → totals + summaries
 *   GET /api/admin/ai-calls/:id                        → one call in full
 */
import { z } from "zod";

export const AiCallsQuerySchema = z.object({
  feature: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(300).default(50),
});

const UsageSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  reasoningTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  resolvedModel: z.string().nullable(),
  generationId: z.string().nullable(),
});

export const AiCallSummarySchema = z.object({
  id: z.string(),
  at: z.string(),
  feature: z.string(),
  label: z.string(),
  model: z.string(),
  ms: z.number(),
  ok: z.boolean(),
  error: z.string().nullable(),
  attempts: z.number().int(),
  usage: UsageSchema,
});
export type AiCallSummary = z.infer<typeof AiCallSummarySchema>;

export const AiCallsResponseSchema = z.object({
  /** Per feature since the server started: calls, billed dollars, failures. */
  totals: z.record(
    z.string(),
    z.object({ calls: z.number().int(), costUsd: z.number(), failed: z.number().int() }),
  ),
  /** Newest first. */
  calls: z.array(AiCallSummarySchema),
});
export type AiCallsResponse = z.infer<typeof AiCallsResponseSchema>;

export const AiCallDetailSchema = AiCallSummarySchema.extend({
  transport: z.string(),
  system: z.string().nullable(),
  user: z.string(),
  /** The model's parsed answer, as returned (null when the call failed). */
  output: z.unknown(),
});
export type AiCallDetail = z.infer<typeof AiCallDetailSchema>;
