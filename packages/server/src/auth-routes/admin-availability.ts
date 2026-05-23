import { AggregateAvailabilityMapSchema, AvailabilityMapSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import {
  applyRsvpNoToAvailability,
  fetchAllRsvpNoByUser,
  fetchAllRsvpYesByUser,
  fetchRsvpNoDatesForUser,
  fetchRsvpYesDatesForUser,
  mergeRsvpYesIntoAvailability,
  parseAvailabilityJson,
} from "../lib/availability-merge.ts";
import { parseRow, parseRows } from "../lib/db-rows.ts";

export const adminAvailabilityRoutes = adminApp();

// ── Row projections ───────────────────────────────────────────────────
//
// `availability_json` is read as a raw string and handed to
// `parseAvailabilityJson` so per-entry leniency is preserved (a single
// stray status value doesn't blank a user's whole calendar).

const AvailabilityJsonOnlyRowSchema = z.object({
  availability_json: z.string(),
});

const UserAvailabilityJoinedRowSchema = z.object({
  user_id: z.string(),
  availability_json: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
});

const UserNameEmailRowSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
});

// ── Routes ────────────────────────────────────────────────────────────

adminAvailabilityRoutes.get("/:id/availability", async (c) => {
  const userId = c.req.param("id");
  const [{ rows }, rsvpYesDates, rsvpNoDates] = await Promise.all([
    getDb().execute({
      sql: "SELECT availability_json FROM user_availability WHERE user_id = ?",
      args: [userId],
    }),
    fetchRsvpYesDatesForUser(getDb(), userId),
    fetchRsvpNoDatesForUser(getDb(), userId),
  ]);
  const firstRow = rows[0]
    ? parseRow(AvailabilityJsonOnlyRowSchema, rows[0], "user_availability")
    : null;
  const stored = parseAvailabilityJson(firstRow?.availability_json);
  const withYes = mergeRsvpYesIntoAvailability(stored, rsvpYesDates);
  const merged = applyRsvpNoToAvailability(withYes, rsvpNoDates);
  return c.json(AvailabilityMapSchema.parse(merged));
});

export const adminAvailabilityAllRoutes = adminApp();

adminAvailabilityAllRoutes.get("/availability/all", async (c) => {
  const [{ rows }, rsvpYesByUser, rsvpNoByUser] = await Promise.all([
    getDb().execute(
      `SELECT ua.user_id, ua.availability_json, u.name, u.email
       FROM user_availability ua
       JOIN user u ON u.id = ua.user_id`,
    ),
    fetchAllRsvpYesByUser(getDb()),
    fetchAllRsvpNoByUser(getDb()),
  ]);

  // Build per-user, per-date status (can wins over maybe; rsvp:yes promotes
  // maybe → can and fills in missing entries). Then pivot to per-date lists
  // for the aggregate map. Walking user-by-user keeps the (userId, date)
  // dedupe natural — a person with both "can" and rsvp:yes still appears once.
  type Status = "can" | "maybe";
  const perUser = new Map<
    string,
    { userId: string; name: string; statuses: Map<string, Status> }
  >();
  for (const row of parseRows(UserAvailabilityJoinedRowSchema, rows, "user_availability+user")) {
    const name = ((row.name ?? "") || (row.email ?? "") || "—").trim() || "—";
    const statuses = new Map<string, Status>();
    const map = parseAvailabilityJson(row.availability_json);
    for (const [date, status] of Object.entries(map)) statuses.set(date, status);
    perUser.set(row.user_id, { userId: row.user_id, name, statuses });
  }
  for (const [userId, dates] of rsvpYesByUser) {
    let entry = perUser.get(userId);
    if (!entry) {
      // RSVP-yes without any availability row — fetch a display name. Rare
      // but possible if the user RSVPed and never marked availability.
      const userResult = await getDb().execute({
        sql: "SELECT name, email FROM user WHERE id = ?",
        args: [userId],
      });
      const r = userResult.rows[0]
        ? parseRow(UserNameEmailRowSchema, userResult.rows[0], "user")
        : null;
      const name = ((r?.name ?? "") || (r?.email ?? "") || "—").trim() || "—";
      entry = { userId, name, statuses: new Map() };
      perUser.set(userId, entry);
    }
    for (const date of dates) entry.statuses.set(date, "can");
  }
  // RSVP-no wins last — it overrides both stored availability and any
  // yes promotion (which can't co-exist anyway given the rsvps PK, but
  // applying after keeps the override semantics unambiguous).
  for (const [userId, dates] of rsvpNoByUser) {
    const entry = perUser.get(userId);
    if (!entry) continue;
    for (const date of dates) entry.statuses.delete(date);
  }

  const aggregate: Record<string, Array<{ userId: string; name: string; status: string }>> = {};
  for (const { userId, name, statuses } of perUser.values()) {
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
