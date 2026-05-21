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
