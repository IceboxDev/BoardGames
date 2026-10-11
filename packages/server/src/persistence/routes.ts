import {
  BulkSaveResultsBodySchema,
  BulkSaveResultsResponseSchema,
  type CompanionRecord,
  CompanionRecordListSchema,
  GameResultListSchema,
  GameResultsQuerySchema,
  isCompanionRecordSlug,
  MatchSummaryListSchema,
  OkResponseSchema,
  ReplayListQuerySchema,
  ReplayLogSchema,
  SaveCompanionRecordBodySchema,
  SaveCompanionRecordResponseSchema,
  SaveResultBodySchema,
  SaveResultResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { jsonColumn, parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { listCompanionRecords, saveCompanionRecord } from "../matches/companion-store.ts";
import { getMatchLog, listMatches } from "../matches/store.ts";

export const persistenceRoutes = authedApp();

// ── Row projections ───────────────────────────────────────────────────
//
// `game_results.result_json` is a per-game shape (the Set trainer's history),
// so it stays a loose record here. Online matches live in `matches/store.ts`.

const GameResultRowSchema = z.object({
  result_json: jsonColumn(z.record(z.string(), z.unknown())),
  created_at: z.string(),
});

// ── Routes ────────────────────────────────────────────────────────────

persistenceRoutes.post("/:slug/results", zJsonBody(SaveResultBodySchema), async (c) => {
  const slug = c.req.param("slug");
  const body = c.req.valid("json");
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

persistenceRoutes.get("/:slug/results", zQuery(GameResultsQuerySchema), async (c) => {
  const slug = c.req.param("slug");
  const db = getDb();
  const { limit } = c.req.valid("query");

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
  // `game_results` is a global, non-user-scoped table, so deleting a slug's
  // rows wipes every player's history for that game. Restrict to admins —
  // previously any logged-in user could clear it.
  const user = c.get("user");
  if (user.role !== "admin") return errorResponse(c, 403, "forbidden");

  const slug = c.req.param("slug");
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM game_results WHERE game_slug = ?",
    args: [slug],
  });
  return c.json(OkResponseSchema.parse({ ok: true }));
});

persistenceRoutes.get("/:slug/replays", zQuery(ReplayListQuerySchema), async (c) => {
  const { limit } = c.req.valid("query");
  const matches = await listMatches(c.req.param("slug"), c.get("user").id, limit);
  return c.json(MatchSummaryListSchema.parse(matches));
});

persistenceRoutes.get("/:slug/replays/:id{[0-9]+}", async (c) => {
  const log = await getMatchLog(c.req.param("slug"), Number(c.req.param("id")));
  if (log === null) return errorResponse(c, 404, "Not found");
  return c.json(ReplayLogSchema.parse(log));
});

// ── Companion records ─────────────────────────────────────────────────
//
// The Clocktower Grimoire and the D&D DM screen run at the table, not on the
// server; when a game ends the device that ran it saves a record here, keyed
// by a client id it chose (a retry or a second tab replaces, never doubles).
// Only the member's own records are ever read or written.

persistenceRoutes.post(
  "/:slug/companion-records",
  zJsonBody(SaveCompanionRecordBodySchema),
  async (c) => {
    const slug = c.req.param("slug");
    if (!isCompanionRecordSlug(slug)) return errorResponse(c, 404, "Not found");
    const { clientId, record } = c.req.valid("json");
    if (record.game !== slug) {
      return errorResponse(c, 400, "record.game: does not match the game", "BAD_REQUEST");
    }
    const user = c.get("user");
    const saved = await saveCompanionRecord(user.id, clientId, record);
    if (!saved) {
      return errorResponse(c, 409, "clientId: already used for another game", "CONFLICT");
    }
    if (saved.created) logActivity(user.id, "companion-recorded", activityMeta(record));
    return c.json(
      SaveCompanionRecordResponseSchema.parse({ ok: true, ...saved }),
      saved.created ? 201 : 200,
    );
  },
);

persistenceRoutes.get("/:slug/companion-records", zQuery(ReplayListQuerySchema), async (c) => {
  const slug = c.req.param("slug");
  if (!isCompanionRecordSlug(slug)) return errorResponse(c, 404, "Not found");
  const { limit } = c.req.valid("query");
  const entries = await listCompanionRecords(c.get("user").id, slug, limit);
  return c.json(CompanionRecordListSchema.parse(entries));
});

/** The activity trail's summary of a first save. */
function activityMeta(record: CompanionRecord) {
  const minutes =
    record.startedAt === null
      ? undefined
      : Math.round((Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 60_000);
  return record.game === "blood-on-the-clocktower"
    ? { slug: record.game, winner: record.winner, players: record.players.length, minutes }
    : {
        slug: record.game,
        players: record.members.length,
        minutes,
        ...(record.campaignTitle ? { title: record.campaignTitle } : {}),
      };
}
