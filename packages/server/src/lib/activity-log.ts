// Member activity logging — the write side of the admin activity drawer.
//
// Every call is fire-and-forget: activity logging must never fail, slow down,
// or change the behavior of the request that triggered it. Failures are
// logged to the console and swallowed.
//
// `type` is the server-owned event vocabulary. The client keeps a matching
// label map (ActivityDrawer) but tolerates unknown types, so appending a new
// member here is safe without a coordinated deploy.

import { getDb } from "../db.ts";

export type ActivityType =
  | "login"
  | "visit"
  | "page-view"
  | "rsvp"
  | "rsvp-cleared"
  | "rsvp-kick"
  | "night-guest"
  | "game-vote"
  | "availability"
  | "profile-view"
  | "profile-update"
  | "avatar-save"
  | "calendar-feed-subscribe"
  | "calendar-feed-unsubscribe"
  | "picks-locked"
  | "night-locked"
  | "night-unlocked"
  | "match-recorded"
  | "match-deleted"
  | "guest-merged"
  | "ownership-announced"
  | "ownership-resolved"
  | "ownership-removed"
  | "played-through";

/** Insert one activity row. Never throws; never awaited by callers. */
export function logActivity(
  userId: string,
  type: ActivityType,
  meta: Record<string, unknown> = {},
): void {
  getDb()
    .execute({
      sql: "INSERT INTO activity_log (user_id, type, meta_json) VALUES (?, ?, ?)",
      args: [userId, type, JSON.stringify(meta)],
    })
    .catch((err) => {
      console.error(`[activity] failed to log ${type} for ${userId}:`, err);
    });
}

// ── visit tracking ────────────────────────────────────────────────────
//
// A "visit" is the first authenticated API request a user makes after
// VISIT_WINDOW_MS of silence — one row per browsing session rather than one
// per request. The throttle is in-memory: a server restart may log one extra
// visit per user, which is harmless noise, and staying off the DB keeps the
// hot auth middleware write-free for already-seen users.

const VISIT_WINDOW_MS = 30 * 60 * 1000;
const lastSeenByUser = new Map<string, number>();

/** Called from the auth middlewares on every authenticated request. */
export function noteVisit(userId: string): void {
  const now = Date.now();
  const last = lastSeenByUser.get(userId);
  if (last !== undefined && now - last < VISIT_WINDOW_MS) {
    lastSeenByUser.set(userId, now);
    return;
  }
  lastSeenByUser.set(userId, now);
  logActivity(userId, "visit");
}

/**
 * Stamp a user as freshly seen WITHOUT logging a visit row. Used by the login
 * hook so a sign-in logs "login" alone, not "login" + an immediate "visit".
 */
export function markSeen(userId: string): void {
  lastSeenByUser.set(userId, Date.now());
}
