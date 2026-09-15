// "You're invited" — the greeting a private night's guest list gets.
//
// Pending = the viewer is on an active, upcoming private night's guest list,
// is not its host, has no RSVP row for it (an answer either way retires the
// card), and has not dismissed the card (`night_invite_seen`). Oldest night
// first, so a member with two invitations sees them in date order.

import type { NightInviteGreeting } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";
import { todayDateKey } from "./next-night.ts";
import {
  deriveNightParticipants,
  NIGHT_LOCK_COLUMNS,
  NightLockRowSchema,
  nightLockFromRow,
} from "./night-participants.ts";

const RsvpRowSchema = z.object({
  user_id: z.string(),
  status: z.enum(["yes", "no"]),
  rsvped_at: z.string(),
});

export async function nextPendingInvite(
  db: Client,
  viewerId: string,
  today: string = todayDateKey(),
): Promise<NightInviteGreeting | null> {
  const { rows } = await db.execute({
    sql: `SELECT ${NIGHT_LOCK_COLUMNS} FROM locked_dates ld
          WHERE ld.private = 1 AND ld.unlocked_at IS NULL AND ld.date_key >= ?
            AND ld.host_user_id IS NOT NULL AND ld.host_user_id <> ?
            AND EXISTS (SELECT 1 FROM json_each(ld.expected_user_ids_json) WHERE value = ?)
            AND NOT EXISTS (SELECT 1 FROM rsvps r WHERE r.date_key = ld.date_key AND r.user_id = ?)
            AND NOT EXISTS (SELECT 1 FROM night_invite_seen s
                            WHERE s.date_key = ld.date_key AND s.user_id = ?)
          ORDER BY ld.date_key ASC LIMIT 1`,
    args: [today, viewerId, viewerId, viewerId, viewerId],
  });
  const row = parseRows(NightLockRowSchema, rows, "locked_dates")[0];
  if (!row) return null;
  const lock = nightLockFromRow(row);
  if (!lock.hostUserId) return null;

  const rsvpResult = await db.execute({
    sql: "SELECT user_id, status, rsvped_at FROM rsvps WHERE date_key = ?",
    args: [lock.dateKey],
  });
  const seats = deriveNightParticipants(
    lock,
    parseRows(RsvpRowSchema, rsvpResult.rows, "rsvps"),
    [],
  ).seats ?? { total: 1, taken: 1, waitlisted: 0 };

  return {
    kind: "night-invite",
    date: lock.dateKey as NightInviteGreeting["date"],
    hostUserId: lock.hostUserId,
    title: lock.title,
    eventTime: lock.eventTime as NightInviteGreeting["eventTime"],
    seats,
    pickMode: lock.pickMode,
  };
}

/** First-write-wins: the card shows once per (night, member). */
export async function markInviteSeen(db: Client, date: string, userId: string): Promise<void> {
  await db.execute({
    sql: "INSERT OR IGNORE INTO night_invite_seen (date_key, user_id) VALUES (?, ?)",
    args: [date, userId],
  });
}
