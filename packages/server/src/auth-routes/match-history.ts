import type { MatchOutcome, MatchRecord } from "@boardgames/core/history/types";
import type { Row } from "@libsql/client";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { collectUserIds, refreshDisplayNames } from "./match-history-validate.ts";

export const matchHistoryRoutes = authedApp();

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Db = ReturnType<typeof getDb>;

async function rowsToMatches(db: Db, rows: Row[]): Promise<MatchRecord[]> {
  if (rows.length === 0) return [];
  const matches: Array<{ row: Row; outcome: MatchOutcome }> = [];
  const allIds = new Set<string>();
  for (const row of rows) {
    let outcome: MatchOutcome;
    try {
      outcome = JSON.parse(row.outcome_json as string) as MatchOutcome;
    } catch {
      continue;
    }
    matches.push({ row, outcome });
    for (const id of collectUserIds(outcome)) allIds.add(id);
  }

  const nameById = new Map<string, string>();
  if (allIds.size > 0) {
    const ids = [...allIds];
    const placeholders = ids.map(() => "?").join(",");
    const userRes = await db.execute({
      sql: `SELECT id, name FROM user WHERE id IN (${placeholders})`,
      args: ids,
    });
    for (const r of userRes.rows) {
      nameById.set(r.id as string, r.name as string);
    }
  }

  return matches.map(({ row, outcome }) => ({
    id: row.id as number,
    dateKey: (row.date_key as string | null) ?? null,
    playedAt: row.played_at as string,
    gameSlug: (row.game_slug as string | null) ?? null,
    gameTitle: row.game_title as string,
    outcome: refreshDisplayNames(outcome, nameById),
    notes: (row.notes as string | null) ?? null,
    recordedBy: row.recorded_by as string,
    recordedAt: row.recorded_at as string,
    updatedAt: (row.updated_at as string | null) ?? null,
  }));
}

matchHistoryRoutes.get("/", async (c) => {
  const rawLimit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const before = c.req.query("before");

  const sql = before
    ? `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
              recorded_by, recorded_at, updated_at
         FROM match_results
         WHERE played_at < ?
         ORDER BY played_at DESC, id DESC
         LIMIT ?`
    : `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
              recorded_by, recorded_at, updated_at
         FROM match_results
         ORDER BY played_at DESC, id DESC
         LIMIT ?`;
  const args = before ? [before, limit + 1] : [limit + 1];

  const db = getDb();
  const { rows } = await db.execute({ sql, args });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const matches = await rowsToMatches(db, pageRows);
  const nextBefore = hasMore && matches.length > 0 ? matches[matches.length - 1].playedAt : null;

  return c.json({ matches, nextBefore });
});

matchHistoryRoutes.get("/by-night/:dateKey", async (c) => {
  const dateKey = c.req.param("dateKey");
  if (!DATE_KEY_RE.test(dateKey)) {
    return c.json({ error: "invalid dateKey" }, 400);
  }
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
                 recorded_by, recorded_at, updated_at
          FROM match_results
          WHERE date_key = ?
          ORDER BY played_at ASC, id ASC
          LIMIT 100`,
    args: [dateKey],
  });
  const matches = await rowsToMatches(db, rows);
  return c.json({ matches });
});

matchHistoryRoutes.get("/:id{[0-9]+}", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
                 recorded_by, recorded_at, updated_at
          FROM match_results
          WHERE id = ?
          LIMIT 1`,
    args: [id],
  });
  const matches = await rowsToMatches(db, rows);
  if (matches.length === 0) return c.json({ error: "not found" }, 404);
  return c.json(matches[0]);
});
