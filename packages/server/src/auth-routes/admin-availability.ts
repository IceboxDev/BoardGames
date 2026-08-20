import { AggregateAvailabilityMapSchema, AvailabilityMapSchema } from "@boardgames/core/protocol";
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
import { parseRows } from "../lib/db-rows.ts";

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

export const adminAvailabilityAllRoutes = adminApp();

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
