import { isExitGameSlug } from "@boardgames/core/games/exit-games";
import {
  ExitNightQuerySchema,
  ExitNightStateSchema,
  ExitVoteBodySchema,
  OkResponseSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { jsonColumn, parseRow, parseRows, RowParseError } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";

// ── EXIT night narrowing vote ─────────────────────────────────────────
//
// Second-stage voting for sealed nights whose winner is the "exit" catalog
// anchor: which EXIT box do we actually play? Kept out of `game_requests` so
// box slugs never pollute the first-stage hype/teach/learn ranking.

export const calendarExitRoutes = authedApp();

// ── Row projections ───────────────────────────────────────────────────

/** `SELECT expected_user_ids_json FROM locked_dates WHERE date_key = ?`. */
const ExpectedUserIdsRowSchema = z.object({
  expected_user_ids_json: jsonColumn(z.array(z.string())),
});

/** `SELECT user_id, game_slugs_json FROM user_inventory WHERE user_id IN (...)`. */
const InventoryRowSchema = z.object({
  user_id: z.string(),
  game_slugs_json: jsonColumn(z.array(z.string())),
});

/** `SELECT user_id, exit_slug FROM exit_game_votes WHERE date_key = ?`. */
const ExitVoteRowSchema = z.object({
  user_id: z.string(),
  exit_slug: z.string(),
});

/** `SELECT user_id, status FROM rsvps WHERE date_key = ?`. */
const RsvpForDateRowSchema = z.object({
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
});

/** `SELECT user_id FROM user_availability_days WHERE date_key = ? AND status = 'can'`. */
const AvailabilityCanRowSchema = z.object({ user_id: z.string() });

// ── Routes ────────────────────────────────────────────────────────────

calendarExitRoutes.get("/exit", zQuery(ExitNightQuerySchema), async (c) => {
  const { date } = c.req.valid("query");

  const lockedRow = await getDb().execute({
    sql: "SELECT expected_user_ids_json FROM locked_dates WHERE date_key = ? AND unlocked_at IS NULL LIMIT 1",
    args: [date],
  });
  if (lockedRow.rows.length === 0) {
    return errorResponse(c, 400, "date is not locked");
  }
  const { expected_user_ids_json: expectedIds } = parseRow(
    ExpectedUserIdsRowSchema,
    lockedRow.rows[0],
    "locked_dates",
  );

  // Whose shelves count: the same population whose inventories made "exit"
  // win the night, i.e. the definite attendees (availability `can` ∪ RSVP yes,
  // minus RSVP no — mirrors GET /locks), unioned with the sealed guest-list
  // snapshot. Anything narrower can show "nobody owns a box" for a night the
  // winner computation decided was playable.
  const [rsvpsResult, cansResult] = await Promise.all([
    getDb().execute({
      sql: "SELECT user_id, status FROM rsvps WHERE date_key = ?",
      args: [date],
    }),
    getDb().execute({
      sql: "SELECT user_id FROM user_availability_days WHERE date_key = ? AND status = 'can'",
      args: [date],
    }),
  ]);
  const rsvpNo = new Set<string>();
  const attendeeIds = new Set<string>(expectedIds);
  for (const r of parseRows(RsvpForDateRowSchema, rsvpsResult.rows, "rsvps")) {
    if (r.status === "yes") attendeeIds.add(r.user_id);
    else rsvpNo.add(r.user_id);
  }
  for (const r of parseRows(AvailabilityCanRowSchema, cansResult.rows, "user_availability_days")) {
    attendeeIds.add(r.user_id);
  }
  for (const id of rsvpNo) attendeeIds.delete(id);

  // Box slug → attendees who own it.
  const owners: Record<string, string[]> = {};
  if (attendeeIds.size > 0) {
    const ids = [...attendeeIds];
    const placeholders = ids.map(() => "?").join(",");
    const inventoryResult = await getDb().execute({
      sql: `SELECT user_id, game_slugs_json FROM user_inventory WHERE user_id IN (${placeholders})`,
      args: ids,
    });
    for (const row of inventoryResult.rows) {
      // Per-row tolerance: one corrupt inventory doesn't hide everyone's boxes.
      let inv: { user_id: string; game_slugs_json: string[] };
      try {
        inv = parseRow(InventoryRowSchema, row, "user_inventory");
      } catch (err) {
        if (!(err instanceof RowParseError)) throw err;
        continue;
      }
      for (const slug of inv.game_slugs_json) {
        if (!isExitGameSlug(slug)) continue;
        const list = owners[slug] ?? [];
        list.push(inv.user_id);
        owners[slug] = list;
      }
    }
  }

  // Box slug → tonight's voters. Seed every box that has owners or votes so
  // the client never needs to guess at missing keys.
  const votesResult = await getDb().execute({
    sql: "SELECT user_id, exit_slug FROM exit_game_votes WHERE date_key = ? ORDER BY created_at",
    args: [date],
  });
  const votes: Record<string, string[]> = {};
  for (const row of parseRows(ExitVoteRowSchema, votesResult.rows, "exit_game_votes")) {
    const list = votes[row.exit_slug] ?? [];
    list.push(row.user_id);
    votes[row.exit_slug] = list;
  }

  return c.json(ExitNightStateSchema.parse({ owners, votes }));
});

calendarExitRoutes.post("/exit/vote", zJsonBody(ExitVoteBodySchema), async (c) => {
  const user = c.get("user");
  const { date, slug, on } = c.req.valid("json");

  const lockedRow = await getDb().execute({
    sql: "SELECT 1 FROM locked_dates WHERE date_key = ? AND unlocked_at IS NULL LIMIT 1",
    args: [date],
  });
  if (lockedRow.rows.length === 0) {
    return errorResponse(c, 400, "date is not locked");
  }

  if (on) {
    await getDb().execute({
      sql: `INSERT OR IGNORE INTO exit_game_votes (date_key, user_id, exit_slug)
            VALUES (?, ?, ?)`,
      args: [date, user.id, slug],
    });
  } else {
    await getDb().execute({
      sql: "DELETE FROM exit_game_votes WHERE date_key = ? AND user_id = ? AND exit_slug = ?",
      args: [date, user.id, slug],
    });
  }

  logActivity(user.id, "game-vote", { date, slug, on, stage: "exit" });
  return c.json(OkResponseSchema.parse({ ok: true }));
});
