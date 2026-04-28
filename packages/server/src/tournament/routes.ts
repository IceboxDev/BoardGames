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
    const { id } = await startTournament(body.gameSlug, body.config);
    return c.json({ id }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start tournament";
    return c.json({ error: message }, 400);
  }
});

tournamentRoutes.get("/", async (c) => {
  const db = getDb();
  const gameSlug = c.req.query("gameSlug");
  const status = c.req.query("status");

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
  );
});

tournamentRoutes.get("/by-matchup", async (c) => {
  const gameSlug = c.req.query("gameSlug");
  const strategyA = c.req.query("strategyA");
  const strategyB = c.req.query("strategyB");
  if (!gameSlug || !strategyA || !strategyB) return c.json({ error: "Missing params" }, 400);

  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at
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
  return c.json({
    id: match.id as string,
    config: JSON.parse(match.config_json as string),
    status: match.status as string,
    result: match.result_json ? JSON.parse(match.result_json as string) : null,
    progress_completed: match.progress_completed as number,
    progress_total: match.progress_total as number,
    created_at: match.created_at as string,
    completed_at: match.completed_at as string | null,
  });
});

tournamentRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const { rows } = await db.execute({
    sql: "SELECT id, game_slug, config_json, status, result_json, progress_completed, progress_total, created_at, completed_at FROM tournaments WHERE id = ?",
    args: [id],
  });

  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  const row = rows[0];

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
    const { rows } = await db.execute({
      sql: "SELECT status, progress_completed, progress_total FROM tournaments WHERE id = ?",
      args: [id],
    });
    const row = rows[0] as unknown as
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

tournamentRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const ok = await abortTournament(id);
  if (!ok) return c.json({ error: "Tournament not running" }, 404);
  return c.json({ ok: true });
});

tournamentRoutes.get("/:id/games", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const { rows } = await db.execute({
    sql: "SELECT game_index, log_json FROM tournament_games WHERE tournament_id = ? ORDER BY game_index",
    args: [id],
  });

  return c.json(
    rows.map((r) => ({
      gameIndex: r.game_index as number,
      ...JSON.parse(r.log_json as string),
    })),
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

  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json(JSON.parse(rows[0].log_json as string));
});
