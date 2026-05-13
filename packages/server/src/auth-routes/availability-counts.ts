import { AvailabilityCountsSchema } from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import {
  fetchAllRsvpNoByUser,
  fetchAllRsvpYesByUser,
  parseAvailabilityJson,
} from "../lib/availability-merge.ts";

export const availabilityCountsRoutes = authedApp();

availabilityCountsRoutes.get("/counts", async (c) => {
  const [availabilityResult, rsvpYesByUser, rsvpNoByUser] = await Promise.all([
    getDb().execute("SELECT user_id, availability_json FROM user_availability"),
    fetchAllRsvpYesByUser(getDb()),
    fetchAllRsvpNoByUser(getDb()),
  ]);

  // Build per-date sets of distinct user ids so the same user never tallies
  // twice — a "can" mark plus a yes RSVP on the same date is still one
  // can-counted person. RSVP yes promotes a "maybe" to "can".
  const canByDate = new Map<string, Set<string>>();
  const maybeByDate = new Map<string, Set<string>>();
  const addTo = (map: Map<string, Set<string>>, date: string, userId: string) => {
    let set = map.get(date);
    if (!set) {
      set = new Set();
      map.set(date, set);
    }
    set.add(userId);
  };

  for (const row of availabilityResult.rows) {
    const userId = row.user_id as string;
    const map = parseAvailabilityJson(row.availability_json as string);
    for (const [date, status] of Object.entries(map)) {
      if (status === "can") addTo(canByDate, date, userId);
      else if (status === "maybe") addTo(maybeByDate, date, userId);
    }
  }

  for (const [userId, dates] of rsvpYesByUser) {
    for (const date of dates) {
      addTo(canByDate, date, userId);
      maybeByDate.get(date)?.delete(userId);
    }
  }
  // RSVP-no removes the user from both sets — they've explicitly said
  // they aren't coming, so their standing "can"/"maybe" mark must not
  // keep counting toward heat or pie totals for that date.
  for (const [userId, dates] of rsvpNoByUser) {
    for (const date of dates) {
      canByDate.get(date)?.delete(userId);
      maybeByDate.get(date)?.delete(userId);
    }
  }

  const counts: Record<string, { can: number; maybe: number }> = {};
  const ensure = (date: string) => {
    let entry = counts[date];
    if (!entry) {
      entry = { can: 0, maybe: 0 };
      counts[date] = entry;
    }
    return entry;
  };
  for (const [date, set] of canByDate) ensure(date).can += set.size;
  for (const [date, set] of maybeByDate) ensure(date).maybe += set.size;

  return c.json(AvailabilityCountsSchema.parse(counts));
});
