// Player-inactivity rules shared by the admin page (web) and the
// agent-verification endpoint (server). A member sitting at 0% availability
// coverage for INACTIVE_AFTER_DAYS moves out of the main admin table into the
// collapsed "Inactive players" card — computed, never stored, so any new
// signal revives them instantly. Signals that reset the clock: a marked
// can/maybe day (RSVP-yes nights are merged into availability upstream) and a
// recorded match (being at a night counts, even for players who never open
// the app). Admins are never archived.
//
// Lives in core for the same reason history/score-config does: the server's
// /api/agent/admin/inactivity snapshot must answer exactly like the admin
// page, or the two would silently disagree.

export const INACTIVE_AFTER_DAYS = 14;

/** Availability coverage of the editable window: marked-day counts + size. */
export type CoverageCounts = { can: number; maybe: number; total: number };

/** Whole days between two YYYY-MM-DD date keys (to - from). */
export function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  return Math.round(
    (new Date(`${toKey}T00:00Z`).getTime() - new Date(`${fromKey}T00:00Z`).getTime()) / 86_400_000,
  );
}

/**
 * How many days this user has been sitting at 0% coverage. Zero whenever any
 * coverage exists (a single future mark keeps the clock parked); otherwise
 * days since their latest signal — last marked day or last recorded match —
 * and for players with no signal at all, days since the account was created.
 * A future-dated signal (a mark beyond the coverage window) clamps to 0.
 */
export function daysAtZeroCoverage(opts: {
  coverage: CoverageCounts;
  latestMarkedDay: string | undefined;
  lastPlayedDay: string | undefined;
  createdAt: string | Date;
  todayKey: string;
}): number {
  if (opts.coverage.can + opts.coverage.maybe > 0) return 0;
  const signals = [opts.latestMarkedDay, opts.lastPlayedDay].filter(
    (s): s is string => s !== undefined,
  );
  const latest =
    signals.length > 0
      ? signals.sort().at(-1)
      : new Date(opts.createdAt).toISOString().slice(0, 10);
  if (!latest) return 0;
  return Math.max(0, daysBetweenDateKeys(latest, opts.todayKey));
}

/**
 * The archiving rule itself: at 0% coverage for the threshold, and not an
 * admin. Callers pass the user's role string as stored (nullable upstream).
 */
export function isInactiveMember(
  role: string | null | undefined,
  coverage: CoverageCounts,
  zeroDays: number,
): boolean {
  return role !== "admin" && coverage.can + coverage.maybe === 0 && zeroDays >= INACTIVE_AFTER_DAYS;
}
