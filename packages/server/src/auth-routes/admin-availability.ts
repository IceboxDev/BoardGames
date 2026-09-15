import {
  AdminAwayDaysResponseSchema,
  AggregateAvailabilityMapSchema,
  AvailabilityMapSchema,
  AwayDaysResponseSchema,
  SetAwayDayBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import {
  applyRsvpNoToAvailability,
  fetchAllAvailabilityDays,
  fetchAllRsvpNoByUser,
  fetchAllRsvpYesByUser,
  fetchAvailabilityDaysForUser,
  fetchRsvpNoDatesForUser,
  fetchRsvpYesDatesForUser,
  mergeRsvpYesIntoAvailability,
} from "../lib/availability-merge.ts";
import {
  awayDaysFromRows,
  awayDaysStatement,
  fetchAwayDaysByUser,
  todayKeyUtc,
} from "../lib/away-days.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const adminAvailabilityRoutes = adminApp();

// Admin coverage views. Both used to read the legacy `user_availability` JSON
// blob while the member-facing calendar read `user_availability_days`, so an
// admin and a member could be looking at different answers to the same
// question with nothing to reconcile them. Both now read the normalized table
// through the shared helpers in `lib/availability-merge.ts`.

// ── Row projections ───────────────────────────────────────────────────

const UserNameEmailRowSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
});

/** Display name for the admin lists. Falls back to the email only as a last
 *  resort — this is an admin-only surface, unlike the member-facing payloads. */
function displayName(row: { name: string | null; email: string | null } | undefined): string {
  return ((row?.name ?? "") || (row?.email ?? "") || "—").trim() || "—";
}

// ── Routes ────────────────────────────────────────────────────────────

adminAvailabilityRoutes.get("/:id/availability", async (c) => {
  const userId = c.req.param("id");
  const [stored, rsvpYesDates, rsvpNoDates] = await Promise.all([
    fetchAvailabilityDaysForUser(getDb(), userId),
    fetchRsvpYesDatesForUser(getDb(), userId),
    fetchRsvpNoDatesForUser(getDb(), userId),
  ]);
  const withYes = mergeRsvpYesIntoAvailability(stored, rsvpYesDates);
  const merged = applyRsvpNoToAvailability(withYes, rsvpNoDates);
  return c.json(AvailabilityMapSchema.parse(merged));
});

// ── Away notes ────────────────────────────────────────────────────────
// An admin's reminder that a member is known to be unavailable on a day
// (migration 0040). Never merged into the member's availability above —
// the only reader that changes an answer is the coverage pie, which drops
// the day from its denominator. A note on a past day is history; the
// write path refuses one, the read paths skip them.

adminAvailabilityRoutes.put("/:id/away", zJsonBody(SetAwayDayBodySchema), async (c) => {
  const userId = c.req.param("id");
  const { dateKey, away } = c.req.valid("json");
  const today = todayKeyUtc();
  if (dateKey < today) return errorResponse(c, 400, "the day is already past", "PAST_DAY");
  // One round trip to the (remote) database: the member check, the write
  // guarded by it, and the read-back the drawer reconciles with. The tap has
  // already shown optimistically; this is what confirms it.
  const [member, , readBack] = await getDb().batch(
    [
      { sql: `SELECT 1 FROM "user" WHERE id = ?`, args: [userId] },
      away
        ? {
            sql: `INSERT OR IGNORE INTO admin_away_days (user_id, date_key, marked_by)
                  SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM "user" WHERE id = ?)`,
            args: [userId, dateKey, c.get("user").id, userId],
          }
        : {
            sql: "DELETE FROM admin_away_days WHERE user_id = ? AND date_key = ?",
            args: [userId, dateKey],
          },
      awayDaysStatement(userId, today),
    ],
    "write",
  );
  if (member.rows.length === 0) return errorResponse(c, 404, "user not found", "NOT_FOUND");
  return c.json(AwayDaysResponseSchema.parse({ days: awayDaysFromRows(readBack.rows) }));
});

export const adminAvailabilityAllRoutes = adminApp();

adminAvailabilityAllRoutes.get("/availability/away", async (c) => {
  const byUser = await fetchAwayDaysByUser(getDb(), todayKeyUtc());
  return c.json(AdminAwayDaysResponseSchema.parse({ awayByUser: Object.fromEntries(byUser) }));
});

adminAvailabilityAllRoutes.get("/availability/all", async (c) => {
  const db = getDb();
  const [availabilityByUser, rsvpYesByUser, rsvpNoByUser] = await Promise.all([
    fetchAllAvailabilityDays(db),
    fetchAllRsvpYesByUser(db),
    fetchAllRsvpNoByUser(db),
  ]);

  // Build per-user, per-date status (can wins over maybe; rsvp:yes promotes
  // maybe → can and fills in missing entries). Then pivot to per-date lists
  // for the aggregate map. Walking user-by-user keeps the (userId, date)
  // dedupe natural — a person with both "can" and rsvp:yes still appears once.
  type Status = "can" | "maybe";
  const statusesByUser = new Map<string, Map<string, Status>>();
  const ensure = (userId: string) => {
    let entry = statusesByUser.get(userId);
    if (!entry) {
      entry = new Map<string, Status>();
      statusesByUser.set(userId, entry);
    }
    return entry;
  };

  for (const [userId, map] of availabilityByUser) {
    const statuses = ensure(userId);
    for (const [date, status] of Object.entries(map)) statuses.set(date, status);
  }
  // An RSVP-yes with no availability row at all is normal (someone who RSVPed
  // through the modal and never touched the calendar). This used to issue one
  // `SELECT name, email FROM user WHERE id = ?` per such person, sequentially,
  // inside the loop; names are now resolved in a single round trip below.
  for (const [userId, dates] of rsvpYesByUser) {
    const statuses = ensure(userId);
    for (const date of dates) statuses.set(date, "can");
  }
  // RSVP-no wins last — it overrides both stored availability and any
  // yes promotion (which can't co-exist anyway given the rsvps PK, but
  // applying after keeps the override semantics unambiguous).
  for (const [userId, dates] of rsvpNoByUser) {
    const statuses = statusesByUser.get(userId);
    if (!statuses) continue;
    for (const date of dates) statuses.delete(date);
  }

  const userIds = [...statusesByUser.keys()];
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const placeholders = userIds.map(() => "?").join(",");
    const { rows } = await db.execute({
      sql: `SELECT id, name, email FROM "user" WHERE id IN (${placeholders})`,
      args: userIds,
    });
    for (const r of parseRows(UserNameEmailRowSchema, rows, "user.id-name-email")) {
      nameById.set(r.id, displayName(r));
    }
  }

  const aggregate: Record<string, Array<{ userId: string; name: string; status: string }>> = {};
  for (const [userId, statuses] of statusesByUser) {
    const name = nameById.get(userId) ?? "—";
    for (const [date, status] of statuses) {
      let list = aggregate[date];
      if (!list) {
        list = [];
        aggregate[date] = list;
      }
      list.push({ userId, name, status });
    }
  }
  for (const list of Object.values(aggregate)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return c.json(AggregateAvailabilityMapSchema.parse(aggregate));
});
