import {
  BulkSaveResultsBodySchema,
  BulkSaveResultsResponseSchema,
  GameResultListSchema,
  OkResponseSchema,
  ReplayLogSchema,
  ReplaySummaryListSchema,
  SaveResultResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const persistenceRoutes = authedApp();

// ── Row projections ───────────────────────────────────────────────────
//
// `game_results.result_json` and `session_replays.replay_json` /
// `scores_json` are per-game shapes. `ReplayLogSchema` is intentionally
// `z.unknown()` and the per-game shape lives client-side, so we mirror
// that with loose record/array schemas here.

const GameResultRowSchema = z.object({
  result_json: jsonColumn(z.record(z.string(), z.unknown())),
  created_at: z.string(),
});

const ReplaySummaryRowSchema = z.object({
  id: z.number(),
  ai_engine: z.string().nullable(),
  score_p0: z.number().nullable(),
  score_p1: z.number().nullable(),
  winner: z.string().nullable(),
  created_at: z.string(),
  scores_json: jsonColumn(z.array(z.number())).nullable(),
  player_count: z.number().nullable(),
});

const ReplayLogRowSchema = z.object({
  replay_json: jsonColumn(z.unknown()),
});

// ── Routes ────────────────────────────────────────────────────────────

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

  const parsed = parseRows(GameResultRowSchema, rows, "game_results");
  return c.json(
    GameResultListSchema.parse(parsed.map((r) => ({ createdAt: r.created_at, ...r.result_json }))),
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
  const parsed = parseRows(ReplaySummaryRowSchema, rows, "session_replays");

  return c.json(
    ReplaySummaryListSchema.parse(
      parsed.map((r) => ({
        id: r.id,
        aiEngine: r.ai_engine,
        scoreP0: r.score_p0,
        scoreP1: r.score_p1,
        winner: r.winner,
        createdAt: r.created_at,
        scores: r.scores_json,
        playerCount: r.player_count,
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
  const { replay_json } = parseRow(ReplayLogRowSchema, rows[0], "session_replays");
  return c.json(ReplayLogSchema.parse(replay_json));
});
