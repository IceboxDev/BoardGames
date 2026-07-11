import type { MatchRecord } from "@boardgames/core/history/types";
import { DndOpenCampaignsResponseSchema, MatchOutcomeSchema } from "@boardgames/core/protocol";
import type { Client, Row } from "@libsql/client";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "../lib/db-rows.ts";
import { collectUserIds, refreshDisplayNames } from "./match-history-validate.ts";

export const matchHistoryRoutes = authedApp();

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type Db = Client;

// ── Row schemas ────────────────────────────────────────────────────────
//
// One projection per query. The column list intentionally mirrors the
// `SELECT ...` lists in each route so a column rename in `db.ts` shows
// up as a schema diff in the same PR.

/**
 * Projection used by every match-history row read (list, by-night, by-id,
 * admin POST/PATCH return). `outcome_json` is decoded through
 * {@link MatchOutcomeSchema} so a bad blob throws at the row boundary
 * rather than deep inside `refreshDisplayNames`.
 *
 * Also re-exported for `admin-match-history.ts` so admin POST/PATCH
 * responses use the same shape — single source of truth.
 */
export const MatchResultRowSchema = z.object({
  id: z.number(),
  date_key: z.string().nullable(),
  played_at: z.string(),
  game_slug: z.string().nullable(),
  game_title: z.string(),
  outcome_json: jsonColumn(MatchOutcomeSchema),
  notes: z.string().nullable(),
  recorded_by: z.string(),
  recorded_at: z.string(),
  updated_at: z.string().nullable(),
  sort_order: z.number(),
});
export type MatchResultRow = z.infer<typeof MatchResultRowSchema>;

/** Two-column projection used for the bulk user-name lookup. */
const UserNameRowSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/** Single-column projection for the open-D&D-campaigns query. */
const CampaignRowSchema = z.object({
  campaign: z.string().min(1).max(120),
});

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the latest display names for every userId referenced in the
 * supplied outcomes, in a single round-trip. The returned map is empty
 * when no user ids are referenced — callers can pass it to
 * `refreshDisplayNames` unconditionally.
 */
export async function fetchNameMap(db: Db, ids: Set<string>): Promise<Map<string, string>> {
  if (ids.size === 0) return new Map();
  const list = [...ids];
  const placeholders = list.map(() => "?").join(",");
  const { rows } = await db.execute({
    sql: `SELECT id, name FROM user WHERE id IN (${placeholders})`,
    args: list,
  });
  const parsed = parseRows(UserNameRowSchema, rows, "user.id-name");
  return new Map(parsed.map((r) => [r.id, r.name]));
}

/**
 * Shape a libSQL row into the wire-shape `MatchRecord`, applying
 * `refreshDisplayNames` to the decoded outcome. Exported so the admin
 * POST/PATCH routes can re-shape their RETURNING rows through the same
 * pipeline.
 */
export function rowToMatchRecord(row: MatchResultRow, nameById: Map<string, string>): MatchRecord {
  return {
    id: row.id,
    dateKey: row.date_key,
    playedAt: row.played_at,
    gameSlug: row.game_slug,
    gameTitle: row.game_title,
    outcome: refreshDisplayNames(row.outcome_json, nameById),
    notes: row.notes,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
    sortOrder: row.sort_order,
  };
}

/**
 * Parse a result set of `match_results` rows into wire-shape `MatchRecord[]`,
 * resolving display names in a single follow-up query.
 */
export async function rowsToMatches(db: Db, rows: readonly Row[]): Promise<MatchRecord[]> {
  if (rows.length === 0) return [];
  const parsed = parseRows(MatchResultRowSchema, rows, "match_results");
  const allIds = new Set<string>();
  for (const row of parsed) {
    for (const id of collectUserIds(row.outcome_json)) allIds.add(id);
  }
  const nameById = await fetchNameMap(db, allIds);
  return parsed.map((row) => rowToMatchRecord(row, nameById));
}

// ── Routes ─────────────────────────────────────────────────────────────

matchHistoryRoutes.get("/", async (c) => {
  const rawLimit = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const before = c.req.query("before");

  const sql = before
    ? `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
              recorded_by, recorded_at, updated_at, sort_order
         FROM match_results
         WHERE played_at < ?
         ORDER BY played_at DESC, id DESC
         LIMIT ?`
    : `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
              recorded_by, recorded_at, updated_at, sort_order
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

// Open D&D campaigns: names with at least one recorded session but no resolved
// one (no session carries a win/loss). Feeds the record-match campaign dropdown.
matchHistoryRoutes.get("/dnd-campaigns", async (c) => {
  const db = getDb();
  const { rows } = await db.execute(
    `SELECT DISTINCT json_extract(outcome_json, '$.campaign') AS campaign
       FROM match_results
      WHERE game_slug = 'dungeons-and-dragons'
        AND json_extract(outcome_json, '$.campaign') IS NOT NULL
        AND json_extract(outcome_json, '$.campaign') NOT IN (
          SELECT json_extract(outcome_json, '$.campaign')
            FROM match_results
           WHERE game_slug = 'dungeons-and-dragons'
             AND json_extract(outcome_json, '$.campaign') IS NOT NULL
             AND json_extract(outcome_json, '$.outcome') IS NOT NULL
        )
      ORDER BY campaign COLLATE NOCASE`,
  );
  const campaigns = parseRows(CampaignRowSchema, rows, "dnd-campaigns").map((r) => r.campaign);
  return c.json(DndOpenCampaignsResponseSchema.parse({ campaigns }));
});

matchHistoryRoutes.get("/by-night/:dateKey", async (c) => {
  const dateKey = c.req.param("dateKey");
  if (!DATE_KEY_RE.test(dateKey)) {
    return c.json({ error: "invalid dateKey" }, 400);
  }
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
                 recorded_by, recorded_at, updated_at, sort_order
          FROM match_results
          WHERE date_key = ?
          ORDER BY sort_order ASC, id ASC
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
                 recorded_by, recorded_at, updated_at, sort_order
          FROM match_results
          WHERE id = ?
          LIMIT 1`,
    args: [id],
  });
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  const parsed = parseRow(MatchResultRowSchema, rows[0], "match_results");
  const nameById = await fetchNameMap(db, collectUserIds(parsed.outcome_json));
  return c.json(rowToMatchRecord(parsed, nameById));
});
