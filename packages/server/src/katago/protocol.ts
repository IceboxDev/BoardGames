/**
 * The slice of KataGo's JSON analysis protocol we use
 * (https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md).
 * KataGo is configured to report values from Black's side
 * (`reportAnalysisWinratesAs = BLACK`), so +ownership and +scoreLead are Black's.
 */
import { z } from "zod";

/** Exactly the rules the Go engine plays: area scoring, positional superko, no suicide. */
export const GO_RULES = {
  koRule: "POSITIONAL",
  scoringRule: "AREA",
  taxRule: "NONE",
  multiStoneSuicideLegal: false,
  hasButton: false,
  whiteHandicapBonus: "N",
  friendlyPassOk: true,
} as const;

const MovePairSchema = z.tuple([z.string().max(8), z.string().max(8)]);

export const KataGoQuerySchema = z.object({
  id: z.string().max(64).optional(),
  moves: z.array(MovePairSchema).max(2000),
  initialStones: z.array(MovePairSchema).max(400).optional(),
  rules: z.record(z.string(), z.union([z.string(), z.boolean()])),
  komi: z.number(),
  boardXSize: z.number().int().min(2).max(19),
  boardYSize: z.number().int().min(2).max(19),
  maxVisits: z.number().int().min(1).max(100_000).optional(),
  analyzeTurns: z.array(z.number().int().min(0)).max(2000).optional(),
  includeOwnership: z.boolean().optional(),
  includePolicy: z.boolean().optional(),
  /** Higher runs first: live moves outrank post-game analysis. */
  priority: z.number().int().optional(),
  overrideSettings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type KataGoQuery = z.infer<typeof KataGoQuerySchema>;

export const KataGoResponseSchema = z.object({
  id: z.string(),
  turnNumber: z.number().int(),
  isDuringSearch: z.boolean().optional(),
  moveInfos: z.array(
    z.object({
      move: z.string(),
      visits: z.number(),
      winrate: z.number(),
      scoreLead: z.number(),
      order: z.number(),
      pv: z.array(z.string()).optional(),
    }),
  ),
  rootInfo: z.object({ winrate: z.number(), scoreLead: z.number(), visits: z.number() }),
  ownership: z.array(z.number()).optional(),
  policy: z.array(z.number()).optional(),
  humanPolicy: z.array(z.number()).optional(),
});
export type KataGoResponse = z.infer<typeof KataGoResponseSchema>;

/** One response per analysed turn. */
export interface KataGoEngine {
  query(q: KataGoQuery, timeoutMs: number): Promise<KataGoResponse[]>;
  /** Free-form status for health checks. */
  status(): { ready: boolean; detail: string };
}
