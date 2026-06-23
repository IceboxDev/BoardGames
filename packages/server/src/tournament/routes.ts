import {
  OkResponseSchema,
  StartTournamentBodySchema,
  StartTournamentResponseSchema,
  StrategyListSchema,
  TournamentByMatchupQuerySchema,
  TournamentDetailSchema,
  TournamentGameLogListSchema,
  TournamentGameSingleSchema,
  TournamentListQuerySchema,
  TournamentStreamEventSchema,
  TournamentSummaryListSchema,
} from "@boardgames/core/protocol";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { tournamentRegistry } from "./game-registry.ts";
import { abortTournament, startTournament, subscribeSse, TournamentLimitError } from "./manager.ts";

export const tournamentRoutes = authedApp();

// ── Row projections ───────────────────────────────────────────────────
//
// `config_json` and `result_json` shapes are intentionally per-game (each
// game stores its strategy IDs / scores / wins-by-strategy etc). We keep
// them as opaque records here and let the wire-side
// `TournamentSummary/Detail/GameLog` schemas do tighter validation
// downstream.

const TournamentConfigSchema = z.record(z.string(), z.unknown());
const TournamentResultSchema = z.record(z.string(), z.unknown());

/**
 * Narrowing schema for the head-to-head matchup config shape. Tournament
 * configs are per-game (each game stores its own strategy ID fields), but
 * the `/by-matchup` query only needs `strategyAId` / `strategyBId`, so we
 * safe-parse against this minimal subset.
 */
const MatchupConfigShapeSchema = z.object({
  strategyAId: z.string().optional(),
  strategyBId: z.string().optional(),
});

const TournamentFullRowSchema = z.object({
  id: z.string(),
  game_slug: z.string(),
  config_json: jsonColumn(TournamentConfigSchema),
  status: z.string(),
  result_json: jsonColumn(TournamentResultSchema).nullable(),
  progress_completed: z.number(),
  progress_total: z.number(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
type TournamentFullRow = z.infer<typeof TournamentFullRowSchema>;

/** Status + progress projection used by the SSE warm-up. */
const TournamentProgressRowSchema = z.object({
  status: z.string(),
  progress_completed: z.number(),
  progress_total: z.number(),
});

/** Game log projection — `log_json` is per-game so it stays loose. */
const TournamentGameLogRowSchema = z.object({
  game_index: z.number(),
  log_json: jsonColumn(z.record(z.string(), z.unknown())),
});

/** Single-log projection (no `game_index`). */
const TournamentLogOnlyRowSchema = z.object({
  log_json: jsonColumn(z.record(z.string(), z.unknown())),
});

function rowToSummaryShape(row: TournamentFullRow): Record<string, unknown> {
  return {
    id: row.id,
    game_slug: row.game_slug,
    config: row.config_json,
    status: row.status,
    result: row.result_json,
    progress_completed: row.progress_completed,
    progress_total: row.progress_total,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

// ── Routes ────────────────────────────────────────────────────────────

tournamentRoutes.get("/strategies/:slug", (c) => {
  const slug = c.req.param("slug");
  const entry = tournamentRegistry[slug];
  if (!entry) return errorResponse(c, 404, "Unknown game");
  return c.json(StrategyListSchema.parse(entry.strategies));
});

tournamentRoutes.post("/", zJsonBody(StartTournamentBodySchema), async (c) => {
  const body = c.req.valid("json");
  const user = c.get("user");

  try {
    const { id } = await startTournament(body.gameSlug, body.config, user.id);
    return c.json(StartTournamentResponseSchema.parse({ id }), 201);
  } catch (err) {
    if (err instanceof TournamentLimitError) {
      return errorResponse(c, 409, err.message);
    }
    const message = err instanceof Error ? err.message : "Failed to start tournament";
    return errorResponse(c, 400, message);
  }
});

tournamentRoutes.get("/", zQuery(TournamentListQuerySchema), async (c) => {
  const db = getDb();
  const { gameSlug, status } = c.req.valid("query");

  let sql =
    "SELECT id, game_slug, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at FROM tournaments";
  const conditions: string[] = [];
  const args: unknown[] = [];

  if (gameSlug) {
    conditions.push("game_slug = ?");
    args.push(gameSlug);
  }
  if (status) {
    conditions.push("status = ?");
    args.push(status);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }
  sql += " ORDER BY created_at DESC LIMIT 100";

  const { rows } = await db.execute({ sql, args: args as (string | number)[] });
  const parsed = parseRows(TournamentFullRowSchema, rows, "tournaments");

  return c.json(TournamentSummaryListSchema.parse(parsed.map(rowToSummaryShape)));
});

tournamentRoutes.get("/by-matchup", zQuery(TournamentByMatchupQuerySchema), async (c) => {
  const { gameSlug, strategyA, strategyB } = c.req.valid("query");

  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, game_slug, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at
     FROM tournaments
     WHERE game_slug = ? AND status = 'completed'
     ORDER BY completed_at DESC`,
    args: [gameSlug],
  });
  const parsed = parseRows(TournamentFullRowSchema, rows, "tournaments");

  const match = parsed.find((r) => {
    const cfg = MatchupConfigShapeSchema.safeParse(r.config_json);
    if (!cfg.success) return false;
    const { strategyAId, strategyBId } = cfg.data;
    return (
      (strategyAId === strategyA && strategyBId === strategyB) ||
      (strategyAId === strategyB && strategyBId === strategyA)
    );
  });

  if (!match) return c.json(null);
  return c.json(TournamentDetailSchema.parse(rowToSummaryShape(match)));
});

tournamentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const { rows } = await db.execute({
    sql: "SELECT id, game_slug, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at FROM tournaments WHERE id = ?",
    args: [id],
  });

  if (rows.length === 0) return errorResponse(c, 404, "Not found");
  const row = parseRow(TournamentFullRowSchema, rows[0], "tournaments");
  return c.json(TournamentDetailSchema.parse(rowToSummaryShape(row)));
});

tournamentRoutes.get("/:id/stream", (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    const unsub = subscribeSse(id, (data) => {
      // Already JSON-serialized by the caller; we trust it. Unsafe in dev only
      // — Phase 3 wraps every SSE emit through TournamentStreamEventSchema at
      // the source.
      stream.writeSSE({ data });
    });

    stream.onAbort(() => {
      unsub();
    });

    const db = getDb();
    const { rows } = await db.execute({
      sql: "SELECT status, progress_completed, progress_total FROM tournaments WHERE id = ?",
      args: [id],
    });
    const row = rows[0] ? parseRow(TournamentProgressRowSchema, rows[0], "tournaments") : null;

    if (row && row.status === "running") {
      const event = TournamentStreamEventSchema.parse({
        kind: "progress",
        version: 1,
        completed: row.progress_completed,
        total: row.progress_total,
      });
      await stream.writeSSE({ data: JSON.stringify(event) });
    }

    await new Promise(() => {});
  });
});

tournamentRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await abortTournament(id);
  if (!ok) return errorResponse(c, 404, "Tournament not running");
  return c.json(OkResponseSchema.parse({ ok: true }));
});

tournamentRoutes.get("/:id/games", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const { rows } = await db.execute({
    sql: "SELECT game_index, log_json FROM tournament_games WHERE tournament_id = ? ORDER BY game_index",
    args: [id],
  });
  const parsed = parseRows(TournamentGameLogRowSchema, rows, "tournament_games");

  return c.json(
    TournamentGameLogListSchema.parse(
      parsed.map((r) => ({ gameIndex: r.game_index, ...r.log_json })),
    ),
  );
});

tournamentRoutes.get("/:id/games/:n", async (c) => {
  const id = c.req.param("id");
  const n = Number(c.req.param("n"));
  const db = getDb();
  const { rows } = await db.execute({
    sql: "SELECT log_json FROM tournament_games WHERE tournament_id = ? AND game_index = ?",
    args: [id, n],
  });

  if (rows.length === 0) return errorResponse(c, 404, "Not found");
  const { log_json } = parseRow(TournamentLogOnlyRowSchema, rows[0], "tournament_games");
  return c.json(TournamentGameSingleSchema.parse(log_json));
});
