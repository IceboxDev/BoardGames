import { Hono } from "hono";
import { getDb } from "../db.ts";

export const persistenceRoutes = new Hono();

persistenceRoutes.post("/:slug/results", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json();
  const db = getDb();
  const clientId: string | undefined = body.id;

  if (clientId) {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO game_results (game_slug, client_id, result_json) VALUES (?, ?, ?)",
    );
    const result = stmt.run(slug, clientId, JSON.stringify(body));
    if (result.changes === 0) {
      return c.json({ ok: true, existed: true }, 200);
    }
    return c.json({ ok: true }, 201);
  }

  db.prepare("INSERT INTO game_results (game_slug, result_json) VALUES (?, ?)").run(
    slug,
    JSON.stringify(body),
  );

  return c.json({ ok: true }, 201);
});

persistenceRoutes.post("/:slug/results/bulk", async (c) => {
  const slug = c.req.param("slug");
  const { records } = (await c.req.json()) as { records: unknown[] };

  if (!Array.isArray(records)) {
    return c.json({ error: "records must be an array" }, 400);
  }

  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO game_results (game_slug, client_id, result_json) VALUES (?, ?, ?)",
  );

  let inserted = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const record of records) {
      const clientId = (record as { id?: string }).id;
      const result = stmt.run(slug, clientId ?? null, JSON.stringify(record));
      if (result.changes > 0) inserted++;
      else skipped++;
    }
  });
  tx();

  return c.json({ ok: true, inserted, skipped }, 201);
});

persistenceRoutes.get("/:slug/results", (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const limit = Number(c.req.query("limit") ?? 10000);

  const rows = db
    .prepare(
      "SELECT result_json, created_at FROM game_results WHERE game_slug = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(slug, limit) as { result_json: string; created_at: string }[];

  return c.json(
    rows.map((r) => ({
      createdAt: r.created_at,
      ...JSON.parse(r.result_json),
    })),
  );
});

persistenceRoutes.delete("/:slug/results", (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  db.prepare("DELETE FROM game_results WHERE game_slug = ?").run(slug);
  return c.json({ ok: true });
});

persistenceRoutes.get("/:slug/replays", (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const limit = Number(c.req.query("limit") ?? 50);

  const rows = db
    .prepare(
      "SELECT id, ai_engine, score_p0, score_p1, winner, created_at, scores_json, player_count FROM session_replays WHERE game_slug = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(slug, limit) as {
    id: number;
    ai_engine: string | null;
    score_p0: number | null;
    score_p1: number | null;
    winner: string | null;
    created_at: string;
    scores_json: string | null;
    player_count: number | null;
  }[];

  return c.json(
    rows.map((r) => ({
      id: r.id,
      aiEngine: r.ai_engine,
      scoreP0: r.score_p0,
      scoreP1: r.score_p1,
      winner: r.winner,
      createdAt: r.created_at,
      scores: r.scores_json ? JSON.parse(r.scores_json) : null,
      playerCount: r.player_count,
    })),
  );
});

persistenceRoutes.get("/:slug/replays/:id", (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb();
  const row = db.prepare("SELECT replay_json FROM session_replays WHERE id = ?").get(id) as
    | { replay_json: string }
    | undefined;

  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(JSON.parse(row.replay_json));
});
