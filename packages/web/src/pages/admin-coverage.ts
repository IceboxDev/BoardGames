// Pure helpers extracted from AdminPage.tsx so the coverage math and
// availability-marker counting can be tested without rendering a 1000-line
// page. The page imports back from here; nothing else changes.

import type { AggregateAvailabilityMap, AvailabilityMap } from "../lib/offline-availability";
import { dateKey } from "../lib/offline-availability";
import { build42Days } from "../lib/offline-week";

export type Coverage = { can: number; maybe: number; total: number };

/**
 * Count availability marks (can / maybe) for a single user across the
 * 42-day calendar window that starts at `weekStart` — but only from `today`
 * onward. The raw availability map persists past marks indefinitely, but the
 * dashboard only exposes the window from today, so the counter has to match
 * that or the "X days marked" copy lies.
 */
export function countMarkedInWindow(
  availability: AvailabilityMap | null,
  today: Date,
  weekStart: Date,
): number {
  if (!availability) return 0;
  const todayKey = dateKey(today);
  let count = 0;
  for (const d of build42Days(weekStart)) {
    const key = dateKey(d);
    if (key < todayKey) continue;
    const status = availability[key];
    if (status === "can" || status === "maybe") count += 1;
  }
  return count;
}

/**
 * Compute one user's coverage of an editable date window. `total` is the
 * window size; `can` and `maybe` are how many of those days the user has
 * actually marked.
 */
export function computeCoverage(
  aggregate: AggregateAvailabilityMap,
  userId: string,
  editableDateKeys: string[],
): Coverage {
  let can = 0;
  let maybe = 0;
  for (const key of editableDateKeys) {
    const entries = aggregate[key];
    if (!entries) continue;
    const entry = entries.find((e) => e.userId === userId);
    if (entry?.status === "can") can += 1;
    else if (entry?.status === "maybe") maybe += 1;
  }
  return { can, maybe, total: editableDateKeys.length };
}

// ── Inactivity (archived players) ─────────────────────────────────────
//
// A player who has been at 0% coverage for INACTIVE_AFTER_DAYS moves out of
// the main admin table into the collapsible "Inactive players" card. The
// rules themselves (clock, threshold, admin exemption) live in
// core/availability/inactivity so the server's /api/agent/admin/inactivity
// snapshot answers exactly like this page; re-exported here so existing call
// sites keep one import path. Only the aggregate-map pivot below is web-only.
export {
  daysAtZeroCoverage,
  INACTIVE_AFTER_DAYS,
  isInactiveMember,
} from "@boardgames/core/availability/inactivity";

/**
 * All-time latest can/maybe date key per user, pivoted from the aggregate
 * map. The admin endpoint returns the map unbounded — past dates included —
 * which is what makes the "since when" question answerable client-side.
 */
export function latestMarkedDayByUser(aggregate: AggregateAvailabilityMap): Map<string, string> {
  const out = new Map<string, string>();
  for (const [date, entries] of Object.entries(aggregate)) {
    for (const e of entries) {
      if (e.status !== "can" && e.status !== "maybe") continue;
      const prev = out.get(e.userId);
      if (prev === undefined || date > prev) out.set(e.userId, date);
    }
  }
  return out;
}

/**
 * Better Auth's client returns `{ error }` with a sometimes-sparse envelope —
 * `message` may be empty while `code` and `statusText` carry the actual cause.
 * Pick the most useful string available so admin-side failures don't surface
 * as a generic fallback.
 */
export function formatAuthError(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as { message?: unknown; code?: unknown; statusText?: unknown; status?: unknown };
  const message = typeof e.message === "string" && e.message.trim() ? e.message : null;
  const code = typeof e.code === "string" && e.code ? e.code : null;
  const statusText = typeof e.statusText === "string" && e.statusText ? e.statusText : null;
  const status = typeof e.status === "number" ? e.status : null;
  return message ?? code ?? statusText ?? (status ? `${fallback} (${status})` : fallback);
}
