import {
  BulkSaveResultsBodySchema,
  BulkSaveResultsResponseSchema,
  GameResultListSchema,
  OkResponseSchema,
  ReplayLogSchema,
  ReplaySummaryListSchema,
  SaveResultResponseSchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const persistenceRoutes = authedApp();

persistenceRoutes.post("/:slug/results", async (c) => {
  const slug = c.req.param("slug");
  const body = (await c.req.json()) as Record<string, unknown>;
  const db = getDb();
  const clientId = typeof body.id === "string" ? body.id : undefined;

  if (clientId) {
    const result = await db.execute({
      sql: "INSERT OR IGNORE INTO game_results (game_slug, client_id, result_json) VALUES (?, ?, ?)",
      args: [slug, clientId, JSON.stringify(body)],
    });
    if (result.rowsAffected === 0) {
      return c.json(SaveResultResponseSchema.parse({ ok: true, existed: true }), 200);
    }
    return c.json(SaveResultResponseSchema.parse({ ok: true }), 201);
  }

  await db.execute({
    sql: "INSERT INTO game_results (game_slug, result_json) VALUES (?, ?)",
    args: [slug, JSON.stringify(body)],
  });

  return c.json(SaveResultResponseSchema.parse({ ok: true }), 201);
});

persistenceRoutes.post("/:slug/results/bulk", zJsonBody(BulkSaveResultsBodySchema), async (c) => {
  const slug = c.req.param("slug");
  const { records } = c.req.valid("json");

  const db = getDb();
  const statements = records.map((record) => {
    const clientId = (record as { id?: string }).id;
    return {
      sql: "INSERT OR IGNORE INTO game_results (game_slug, client_id, result_json) VALUES (?, ?, ?)",
      args: [slug, clientId ?? null, JSON.stringify(record)] as (string | null)[],
    };
  });

  const results = await db.batch(statements, "write");
  let inserted = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.rowsAffected > 0) inserted++;
    else skipped++;
  }

  return c.json(BulkSaveResultsResponseSchema.parse({ ok: true, inserted, skipped }), 201);
});

persistenceRoutes.get("/:slug/results", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const limit = Number(c.req.query("limit") ?? 10000);

  const { rows } = await db.execute({
    sql: "SELECT result_json, created_at FROM game_results WHERE game_slug = ? ORDER BY created_at DESC LIMIT ?",
    args: [slug, limit],
  });

  return c.json(
    GameResultListSchema.parse(
      rows.map((r) => ({
        createdAt: r.created_at as string,
        ...JSON.parse(r.result_json as string),
      })),
    ),
  );
});

persistenceRoutes.delete("/:slug/results", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM game_results WHERE game_slug = ?",
    args: [slug],
  });
  return c.json(OkResponseSchema.parse({ ok: true }));
});

persistenceRoutes.get("/:slug/replays", async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const limit = Number(c.req.query("limit") ?? 50);

  const { rows } = await db.execute({
    sql: "SELECT id, ai_engine, score_p0, score_p1, winner, created_at, scores_json, player_count FROM session_replays WHERE game_slug = ? ORDER BY created_at DESC LIMIT ?",
    args: [slug, limit],
  });

  return c.json(
    ReplaySummaryListSchema.parse(
      rows.map((r) => ({
        id: r.id as number,
        aiEngine: r.ai_engine as string | null,
        scoreP0: r.score_p0 as number | null,
        scoreP1: r.score_p1 as number | null,
        winner: r.winner as string | null,
        createdAt: r.created_at as string,
        scores: r.scores_json ? JSON.parse(r.scores_json as string) : null,
        playerCount: r.player_count as number | null,
      })),
    ),
  );
});

persistenceRoutes.get("/:slug/replays/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb();
  const { rows } = await db.execute({
    sql: "SELECT replay_json FROM session_replays WHERE id = ?",
    args: [id],
  });

  if (rows.length === 0) return errorResponse(c, 404, "Not found");
  return c.json(ReplayLogSchema.parse(JSON.parse(rows[0].replay_json as string)));
});
