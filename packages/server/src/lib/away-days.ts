// Admin "away" notes (migration 0040): a member is known to be unavailable on
// a day. Read here for the two places that shrink a coverage denominator —
// the admin availability routes and the agent inactivity snapshot — so both
// answer the same. A note is only ever consulted from today on; past notes
// are history and never returned.

import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";

const AwayRowSchema = z.object({ user_id: z.string(), date_key: z.string() });

/** `userId → away date keys (sorted)` from `fromDateKey` on. */
export async function fetchAwayDaysByUser(
  db: Client,
  fromDateKey: string,
): Promise<Map<string, string[]>> {
  const { rows } = await db.execute({
    sql: `SELECT user_id, date_key FROM admin_away_days WHERE date_key >= ? ORDER BY user_id, date_key`,
    args: [fromDateKey],
  });
  const byUser = new Map<string, string[]>();
  for (const r of parseRows(AwayRowSchema, rows, "admin_away_days")) {
    let list = byUser.get(r.user_id);
    if (!list) {
      list = [];
      byUser.set(r.user_id, list);
    }
    list.push(r.date_key);
  }
  return byUser;
}

/** One member's away date keys (sorted) from `fromDateKey` on. */
export async function fetchAwayDays(
  db: Client,
  userId: string,
  fromDateKey: string,
): Promise<string[]> {
  const { rows } = await db.execute({
    sql: "SELECT user_id, date_key FROM admin_away_days WHERE user_id = ? AND date_key >= ? ORDER BY date_key",
    args: [userId, fromDateKey],
  });
  return parseRows(AwayRowSchema, rows, "admin_away_days").map((r) => r.date_key);
}

/** Today's date key in UTC — the same clock the agent snapshot uses. */
export function todayKeyUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
