import { z } from "zod";
import { GameSlugSchema } from "../common.ts";

// ── Strategies & start ─────────────────────────────────────────────────

export const StrategyInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type StrategyInfo = z.infer<typeof StrategyInfoSchema>;

export const StrategyListSchema = z.array(StrategyInfoSchema);

/**
 * Upper bound on `numGames` per tournament. Every game's config carries
 * `numGames`; it sizes the server's game loop AND the per-core worker fan-out,
 * so an unbounded value is a denial-of-service (huge array allocation + every
 * core pinned). The cap matches the tournament-grid UI's `max` input.
 */
export const MAX_TOURNAMENT_GAMES = 10_000;

export const StartTournamentBodySchema = z.object({
  gameSlug: GameSlugSchema,
  /**
   * Per-game config. The per-game shape stays open (`catchall`), but the
   * shared `numGames` field is bounded here at the wire boundary so the server
   * never forks work for an attacker-chosen game count. `catchall` (not a plain
   * object) is load-bearing: it KEEPS per-game keys like `strategyAId` /
   * `strategies` instead of stripping them. See MAX_TOURNAMENT_GAMES.
   */
  config: z
    .object({ numGames: z.number().int().min(1).max(MAX_TOURNAMENT_GAMES) })
    .catchall(z.unknown()),
});
export type StartTournamentBody = z.input<typeof StartTournamentBodySchema>;

export const StartTournamentResponseSchema = z.object({ id: z.string() });
export type StartTournamentResponse = z.infer<typeof StartTournamentResponseSchema>;

// ── Summary / detail ───────────────────────────────────────────────────

const TournamentStatusSchema = z.string();

const TournamentBaseSchema = z.object({
  id: z.string(),
  game_slug: z.string(),
  /** Per-game config — `unknown` for the same reason as above. */
  config: z.record(z.string(), z.unknown()),
  status: TournamentStatusSchema,
  result: z.record(z.string(), z.unknown()).nullable(),
  progress_completed: z.number().int().min(0),
  progress_total: z.number().int().min(0),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

export const TournamentSummarySchema = TournamentBaseSchema;
export type TournamentSummary = z.infer<typeof TournamentSummarySchema>;

export const TournamentSummaryListSchema = z.array(TournamentSummarySchema);

export const TournamentDetailSchema = TournamentBaseSchema;
export type TournamentDetail = z.infer<typeof TournamentDetailSchema>;

export const TournamentSummaryNullableSchema = TournamentSummarySchema.omit({
  game_slug: true,
}).nullable();

// ── Per-game logs ──────────────────────────────────────────────────────

/** Each tournament-game log is a `{ gameIndex, ...arbitrary }` object. */
export const TournamentGameLogSchema = z
  .object({ gameIndex: z.number().int().min(0) })
  .catchall(z.unknown());
export type TournamentGameLog = z.infer<typeof TournamentGameLogSchema>;

export const TournamentGameLogListSchema = z.array(TournamentGameLogSchema);

/** Single log fetch — arbitrary shape, keep as record. */
export const TournamentGameSingleSchema = z.record(z.string(), z.unknown());
export type TournamentGameSingle = z.infer<typeof TournamentGameSingleSchema>;

// ── Query strings ──────────────────────────────────────────────────────

export const TournamentListQuerySchema = z.object({
  gameSlug: z.string().optional(),
  status: z.string().optional(),
});
export type TournamentListQuery = z.input<typeof TournamentListQuerySchema>;

export const TournamentByMatchupQuerySchema = z.object({
  gameSlug: z.string(),
  strategyA: z.string(),
  strategyB: z.string(),
});
export type TournamentByMatchupQuery = z.input<typeof TournamentByMatchupQuerySchema>;

// ── SSE progress events ────────────────────────────────────────────────

/** Discriminated by `kind`. The `version` field lets us evolve the wire
 * shape later without breaking old clients (cached pages, stale tabs). */
export const TournamentStreamProgressSchema = z.object({
  kind: z.literal("progress"),
  version: z.literal(1).default(1),
  completed: z.number().int().min(0),
  total: z.number().int().min(0),
  /** Per-game in-flight stats (wins/losses/scores). Shape varies by game. */
  partial: z.record(z.string(), z.unknown()).optional(),
});

export const TournamentStreamCompleteSchema = z.object({
  kind: z.literal("complete"),
  version: z.literal(1).default(1),
  result: z.unknown(),
});

export const TournamentStreamErrorSchema = z.object({
  kind: z.literal("error"),
  version: z.literal(1).default(1),
  message: z.string(),
});

export const TournamentStreamEventSchema = z.discriminatedUnion("kind", [
  TournamentStreamProgressSchema,
  TournamentStreamCompleteSchema,
  TournamentStreamErrorSchema,
]);
export type TournamentStreamEvent = z.infer<typeof TournamentStreamEventSchema>;
