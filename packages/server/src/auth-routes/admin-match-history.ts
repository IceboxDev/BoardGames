import type { MatchOutcome, MatchRecord } from "@boardgames/core/history/types";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { parseRow, parseRows } from "../lib/db-rows.ts";
import { MatchResultRowSchema, rowToMatchRecord } from "./match-history.ts";
import {
  collectUserIds,
  isValidDateKey,
  isValidGameSlug,
  isValidIsoDateTime,
  parseOutcome,
} from "./match-history-validate.ts";

export const adminMatchHistoryRoutes = adminApp();

type ParsedInput = {
  dateKey: string | null;
  playedAt: string;
  gameSlug: string | null;
  gameTitle: string;
  outcome: MatchOutcome;
  notes: string | null;
};

/** Projection used for the bulk userId existence check + name lookup. */
const UserIdRowSchema = z.object({ id: z.string() });
const UserIdNameRowSchema = z.object({ id: z.string(), name: z.string() });

async function verifyUserIdsExist(
  ids: Set<string>,
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  if (ids.size === 0) return { ok: true };
  const list = [...ids];
  const placeholders = list.map(() => "?").join(",");
  const { rows } = await getDb().execute({
    sql: `SELECT id FROM user WHERE id IN (${placeholders})`,
    args: list,
  });
  const found = new Set(parseRows(UserIdRowSchema, rows, "user.id").map((r) => r.id));
  const missing = list.filter((id) => !found.has(id));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function parseInput(
  body: unknown,
): { ok: true; value: ParsedInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;

  const dateKey =
    b.dateKey === null || b.dateKey === undefined
      ? null
      : isValidDateKey(b.dateKey)
        ? b.dateKey
        : undefined;
  if (dateKey === undefined) return { ok: false, error: "invalid dateKey" };

  if (!isValidIsoDateTime(b.playedAt)) return { ok: false, error: "invalid playedAt (ISO)" };

  const gameSlug =
    b.gameSlug === null || b.gameSlug === undefined
      ? null
      : isValidGameSlug(b.gameSlug)
        ? b.gameSlug
        : undefined;
  if (gameSlug === undefined) return { ok: false, error: "invalid gameSlug" };

  if (typeof b.gameTitle !== "string") return { ok: false, error: "missing gameTitle" };
  const gameTitle = b.gameTitle.trim();
  if (gameTitle.length === 0 || gameTitle.length > 200) {
    return { ok: false, error: "gameTitle: 1-200 chars" };
  }

  const outcomeResult = parseOutcome(b.outcome);
  if (!outcomeResult.ok) return outcomeResult;

  let notes: string | null = null;
  if (b.notes !== null && b.notes !== undefined) {
    if (typeof b.notes !== "string") return { ok: false, error: "notes must be a string" };
    const t = b.notes.trim();
    notes = t.length === 0 ? null : t.slice(0, 2000);
  }

  return {
    ok: true,
    value: {
      dateKey,
      playedAt: b.playedAt,
      gameSlug,
      gameTitle,
      outcome: outcomeResult.value,
      notes,
    },
  };
}

/**
 * Re-fetch a single match row by id and shape it into the wire `MatchRecord`,
 * resolving the latest display names for every referenced user. Returns
 * null when the row no longer exists (e.g. a concurrent delete).
 */
async function fetchAndShape(id: number): Promise<MatchRecord | null> {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
                 recorded_by, recorded_at, updated_at
          FROM match_results WHERE id = ? LIMIT 1`,
    args: [id],
  });
  if (rows.length === 0) return null;

  const parsed = parseRow(MatchResultRowSchema, rows[0], "match_results");
  const ids = collectUserIds(parsed.outcome_json);
  const nameById = new Map<string, string>();
  if (ids.size > 0) {
    const list = [...ids];
    const placeholders = list.map(() => "?").join(",");
    const userRes = await db.execute({
      sql: `SELECT id, name FROM user WHERE id IN (${placeholders})`,
      args: list,
    });
    for (const r of parseRows(UserIdNameRowSchema, userRes.rows, "user.id-name")) {
      nameById.set(r.id, r.name);
    }
  }
  return rowToMatchRecord(parsed, nameById);
}

adminMatchHistoryRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = parseInput(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { dateKey, playedAt, gameSlug, gameTitle, outcome, notes } = parsed.value;

  const userCheck = await verifyUserIdsExist(collectUserIds(outcome));
  if (!userCheck.ok) {
    return c.json({ error: `unknown userIds: ${userCheck.missing.join(", ")}` }, 400);
  }

  const user = c.get("user");
  const result = await getDb().execute({
    sql: `INSERT INTO match_results
            (date_key, played_at, game_slug, game_title, outcome_json, notes, recorded_by, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          RETURNING id`,
    args: [dateKey, playedAt, gameSlug, gameTitle, JSON.stringify(outcome), notes, user.id],
  });
  const insertedId = parseRow(
    z.object({ id: z.number() }),
    result.rows[0],
    "match_results.RETURNING",
  ).id;
  const record = await fetchAndShape(insertedId);
  return c.json(record);
});

adminMatchHistoryRoutes.patch("/:id{[0-9]+}", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => null);
  const parsed = parseInput(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { dateKey, playedAt, gameSlug, gameTitle, outcome, notes } = parsed.value;

  const userCheck = await verifyUserIdsExist(collectUserIds(outcome));
  if (!userCheck.ok) {
    return c.json({ error: `unknown userIds: ${userCheck.missing.join(", ")}` }, 400);
  }

  const result = await getDb().execute({
    sql: `UPDATE match_results
          SET date_key = ?, played_at = ?, game_slug = ?, game_title = ?,
              outcome_json = ?, notes = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [dateKey, playedAt, gameSlug, gameTitle, JSON.stringify(outcome), notes, id],
  });
  if (result.rowsAffected === 0) return c.json({ error: "not found" }, 404);
  const record = await fetchAndShape(id);
  return c.json(record);
});

adminMatchHistoryRoutes.delete("/:id{[0-9]+}", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  const result = await getDb().execute({
    sql: "DELETE FROM match_results WHERE id = ?",
    args: [id],
  });
  if (result.rowsAffected === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
