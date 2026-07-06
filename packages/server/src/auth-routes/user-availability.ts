import {
  type Availability,
  AvailabilityMapSchema,
  OkResponseSchema,
  PushAvailabilityBodySchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import {
  applyRsvpNoToAvailability,
  fetchRsvpNoDatesForUser,
  fetchRsvpYesDatesForUser,
  mergeRsvpYesIntoAvailability,
} from "../lib/availability-merge.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const userAvailabilityRoutes = authedApp();

/** `SELECT date_key, status FROM user_availability_days WHERE user_id = ?`. */
const AvailabilityDayRowSchema = z.object({
  date_key: z.string(),
  status: z.enum(["can", "maybe"]),
});

userAvailabilityRoutes.get("/availability", async (c) => {
  const user = c.get("user");
  const [{ rows }, rsvpYesDates, rsvpNoDates] = await Promise.all([
    getDb().execute({
      sql: "SELECT date_key, status FROM user_availability_days WHERE user_id = ?",
      args: [user.id],
    }),
    fetchRsvpYesDatesForUser(getDb(), user.id),
    fetchRsvpNoDatesForUser(getDb(), user.id),
  ]);
  const stored: Record<string, Availability> = {};
  for (const row of parseRows(AvailabilityDayRowSchema, rows, "user_availability_days")) {
    stored[row.date_key] = row.status;
  }
  const withYes = mergeRsvpYesIntoAvailability(stored, rsvpYesDates);
  const merged = applyRsvpNoToAvailability(withYes, rsvpNoDates);
  return c.json(AvailabilityMapSchema.parse(merged));
});

userAvailabilityRoutes.put("/availability", zJsonBody(PushAvailabilityBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const entries = Object.entries(body);
  if (entries.length > 200) {
    return errorResponse(c, 400, "too many entries", "TOO_MANY_ENTRIES");
  }

  // Dual-write during the `user_availability_days` EXPAND phase (migration
  // 0010): the legacy JSON blob is kept in sync as a rollback backstop while
  // the normalized table is the read source. Both commit atomically in one
  // batch. The normalized side is a full replace of this user's rows — the
  // client always PUTs its complete map, so delete-then-insert mirrors the
  // blob's whole-map-overwrite semantics exactly.
  await getDb().batch(
    [
      {
        sql: `INSERT INTO user_availability (user_id, availability_json, updated_at)
              VALUES (?, ?, datetime('now'))
              ON CONFLICT(user_id) DO UPDATE SET
                availability_json = excluded.availability_json,
                updated_at = excluded.updated_at`,
        args: [user.id, JSON.stringify(body)],
      },
      { sql: "DELETE FROM user_availability_days WHERE user_id = ?", args: [user.id] },
      ...entries.map(([dateKey, status]) => ({
        sql: `INSERT INTO user_availability_days (user_id, date_key, status, updated_at)
              VALUES (?, ?, ?, datetime('now'))`,
        args: [user.id, dateKey, status],
      })),
    ],
    "write",
  );

  return c.json(OkResponseSchema.parse({ ok: true }));
});
