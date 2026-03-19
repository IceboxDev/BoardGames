import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getDb } from "../db.ts";
import { tournamentRegistry } from "./game-registry.ts";
import { abortTournament, startTournament, subscribeSse } from "./manager.ts";

export const tournamentRoutes = new Hono();

tournamentRoutes.get("/strategies/:slug", (c) => {
  const slug = c.req.param("slug");
  const entry = tournamentRegistry[slug];
  if (!entry) return c.json({ error: "Unknown game" }, 404);
  return c.json(entry.strategies);
});

tournamentRoutes.post("/", async (c) => {
  const body = await c.req.json<{ gameSlug: string; config: Record<string, unknown> }>();

  try {
    const { id } = startTournament(body.gameSlug, body.config);
    return c.json({ id }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start tournament";
    return c.json({ error: message }, 400);
  }
});

tournamentRoutes.get("/", (c) => {
  const db = getDb();
  const gameSlug = c.req.query("gameSlug");
  const status = c.req.query("status");

  let sql =
    "SELECT id, game_slug, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at FROM tournaments";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (gameSlug) {
    conditions.push("game_slug = ?");
    params.push(gameSlug);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }
  sql += " ORDER BY created_at DESC LIMIT 100";

  const rows = db.prepare(sql).all(...params) as {
    id: string;
    game_slug: string;
    config_json: string;
    status: string;
    result_json: string | null;
    progress_completed: number;
    progress_total: number;
    created_at: string;
    completed_at: string | null;
  }[];

  return c.json(
    rows.map((r) => ({
      id: r.id,
      game_slug: r.game_slug,
      config: JSON.parse(r.config_json),
      status: r.status,
      result: r.result_json ? JSON.parse(r.result_json) : null,
      progress_completed: r.progress_completed,
      progress_total: r.progress_total,
      created_at: r.created_at,
      completed_at: r.completed_at,
    })),
  );
});

tournamentRoutes.get("/by-matchup", (c) => {
  const gameSlug = c.req.query("gameSlug");
  const strategyA = c.req.query("strategyA");
  const strategyB = c.req.query("strategyB");
  if (!gameSlug || !strategyA || !strategyB) return c.json({ error: "Missing params" }, 400);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at
     FROM tournaments
     WHERE game_slug = ? AND status = 'completed'
     ORDER BY completed_at DESC`,
    )
    .all(gameSlug) as {
    id: string;
    config_json: string;
    status: string;
    result_json: string | null;
    progress_completed: number;
    progress_total: number;
    created_at: string;
    completed_at: string | null;
  }[];

  const match = rows.find((r) => {
    const cfg = JSON.parse(r.config_json) as { strategyAId: string; strategyBId: string };
    return (
      (cfg.strategyAId === strategyA && cfg.strategyBId === strategyB) ||
      (cfg.strategyAId === strategyB && cfg.strategyBId === strategyA)
    );
  });

  if (!match) return c.json(null);
  return c.json({
    id: match.id,
    config: JSON.parse(match.config_json),
    status: match.status,
    result: match.result_json ? JSON.parse(match.result_json) : null,
    progress_completed: match.progress_completed,
    progress_total: match.progress_total,
    created_at: match.created_at,
    completed_at: match.completed_at,
  });
});

tournamentRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, game_slug, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at FROM tournaments WHERE id = ?",
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return c.json({ error: "Not found" }, 404);

  return c.json({
    ...row,
    config: JSON.parse(row.config_json as string),
    result: row.result_json ? JSON.parse(row.result_json as string) : null,
  });
});

tournamentRoutes.get("/:id/stream", (c) => {
  const id = c.req.param("id");
  return streamSSE(c, async (stream) => {
    const unsub = subscribeSse(id, (data) => {
      stream.writeSSE({ data });
    });

    stream.onAbort(() => {
      unsub();
    });

    const db = getDb();
    const row = db
      .prepare("SELECT status, progress_completed, progress_total FROM tournaments WHERE id = ?")
      .get(id) as
      | { status: string; progress_completed: number; progress_total: number }
      | undefined;

    if (row && row.status === "running") {
      await stream.writeSSE({
        data: JSON.stringify({
          kind: "progress",
          completed: row.progress_completed,
          total: row.progress_total,
        }),
      });
    }

    await new Promise(() => {});
  });
});

tournamentRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const ok = abortTournament(id);
  if (!ok) return c.json({ error: "Tournament not running" }, 404);
  return c.json({ ok: true });
});

tournamentRoutes.get("/:id/games", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT game_index, log_json FROM tournament_games WHERE tournament_id = ? ORDER BY game_index",
    )
    .all(id) as { game_index: number; log_json: string }[];

  return c.json(
    rows.map((r) => ({
      gameIndex: r.game_index,
      ...JSON.parse(r.log_json),
    })),
  );
});

tournamentRoutes.get("/:id/games/:n", (c) => {
  const id = c.req.param("id");
  const n = Number(c.req.param("n"));
  const db = getDb();
  const row = db
    .prepare("SELECT log_json FROM tournament_games WHERE tournament_id = ? AND game_index = ?")
    .get(id, n) as { log_json: string } | undefined;

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(JSON.parse(row.log_json));
});
