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
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { tournamentRegistry } from "./game-registry.ts";
import { abortTournament, startTournament, subscribeSse } from "./manager.ts";

export const tournamentRoutes = authedApp();

tournamentRoutes.get("/strategies/:slug", (c) => {
  const slug = c.req.param("slug");
  const entry = tournamentRegistry[slug];
  if (!entry) return errorResponse(c, 404, "Unknown game");
  return c.json(StrategyListSchema.parse(entry.strategies));
});

tournamentRoutes.post("/", zJsonBody(StartTournamentBodySchema), async (c) => {
  const body = c.req.valid("json");

  try {
    const { id } = await startTournament(body.gameSlug, body.config);
    return c.json(StartTournamentResponseSchema.parse({ id }), 201);
  } catch (err) {
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

  return c.json(
    TournamentSummaryListSchema.parse(
      rows.map((r) => ({
        id: r.id as string,
        game_slug: r.game_slug as string,
        config: JSON.parse(r.config_json as string),
        status: r.status as string,
        result: r.result_json ? JSON.parse(r.result_json as string) : null,
        progress_completed: r.progress_completed as number,
        progress_total: r.progress_total as number,
        created_at: r.created_at as string,
        completed_at: r.completed_at as string | null,
      })),
    ),
  );
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

  const match = rows.find((r) => {
    const cfg = JSON.parse(r.config_json as string) as {
      strategyAId: string;
      strategyBId: string;
    };
    return (
      (cfg.strategyAId === strategyA && cfg.strategyBId === strategyB) ||
      (cfg.strategyAId === strategyB && cfg.strategyBId === strategyA)
    );
  });

  if (!match) return c.json(null);
  return c.json(
    TournamentDetailSchema.parse({
      id: match.id as string,
      game_slug: match.game_slug as string,
      config: JSON.parse(match.config_json as string),
      status: match.status as string,
      result: match.result_json ? JSON.parse(match.result_json as string) : null,
      progress_completed: match.progress_completed as number,
      progress_total: match.progress_total as number,
      created_at: match.created_at as string,
      completed_at: match.completed_at as string | null,
    }),
  );
});

tournamentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const { rows } = await db.execute({
    sql: "SELECT id, game_slug, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at FROM tournaments WHERE id = ?",
    args: [id],
  });

  if (rows.length === 0) return errorResponse(c, 404, "Not found");
  const row = rows[0];

  return c.json(
    TournamentDetailSchema.parse({
      id: row.id as string,
      game_slug: row.game_slug as string,
      config: JSON.parse(row.config_json as string),
      status: row.status as string,
      result: row.result_json ? JSON.parse(row.result_json as string) : null,
      progress_completed: row.progress_completed as number,
      progress_total: row.progress_total as number,
      created_at: row.created_at as string,
      completed_at: row.completed_at as string | null,
    }),
  );
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
    const row = rows[0] as unknown as
      | { status: string; progress_completed: number; progress_total: number }
      | undefined;

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

  return c.json(
    TournamentGameLogListSchema.parse(
      rows.map((r) => ({
        gameIndex: r.game_index as number,
        ...JSON.parse(r.log_json as string),
      })),
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
  return c.json(TournamentGameSingleSchema.parse(JSON.parse(rows[0].log_json as string)));
});
