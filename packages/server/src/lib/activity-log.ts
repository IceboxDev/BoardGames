// Member activity logging — the write side of the admin activity drawer.
//
// Every call is fire-and-forget: activity logging must never fail, slow down,
// or change the behavior of the request that triggered it. Failures are
// logged to the console and swallowed.
//
// The vocabulary — each `type` and the shape of its `meta` — is
// `ActivityMetaSchemas` in core (protocol/http/activity-events.ts), so a call
// site can only log a known type with a matching meta, and the drawer can't
// ship without a label for it.
//
// What to log: something the MEMBER did (a mutation they made, a surface they
// opened). Never log from a GET handler — reads happen for many reasons (a
// modal's accent colour, a prefetch, a cache refill) and each would read as a
// visit. Surfaces are page-view beacons, sent by the client when shown.
//
// Order: the trail sorts by `logged_at_ms`, stamped HERE, synchronously, when
// the event is handled — not by insertion order, which the un-awaited INSERTs
// don't preserve (migration 0047).

import type {
  ActivityMetaInput,
  SettingsChanges,
  WritableActivityType,
} from "@boardgames/core/protocol";
import { getDb } from "../db.ts";

let lastStamp = 0;

/**
 * Epoch ms for a new event, strictly increasing within this process: two
 * events handled in the same millisecond still sort in the order they were
 * handled (the second one reads 1 ms later — invisible at minute precision).
 */
export function nextActivityStamp(now: number = Date.now()): number {
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

function insert(userId: string, type: string, meta: object, stamp: number): Promise<void> {
  return getDb()
    .execute({
      sql: "INSERT INTO activity_log (user_id, type, meta_json, logged_at_ms) VALUES (?, ?, ?, ?)",
      args: [userId, type, JSON.stringify(meta), stamp],
    })
    .then(
      () => undefined,
      (err: unknown) => {
        console.error(`[activity] failed to log ${type} for ${userId}:`, err);
      },
    );
}

/** The meta argument: optional when every field of the type's meta is. */
type MetaArg<T extends WritableActivityType> =
  Record<never, never> extends ActivityMetaInput<T>
    ? [meta?: ActivityMetaInput<T>]
    : [meta: ActivityMetaInput<T>];

/** Insert one activity row. Never throws; never awaited by callers. */
export function logActivity<T extends WritableActivityType>(
  userId: string,
  type: T,
  ...[meta]: MetaArg<T>
): void {
  void insert(userId, type, meta ?? {}, nextActivityStamp());
}

// ── visit tracking ────────────────────────────────────────────────────
//
// A "visit" is the first authenticated API request a user makes after
// VISIT_WINDOW_MS of silence — one row per browsing session rather than one
// per request. The throttle is in memory, which keeps the hot auth middleware
// write-free for already-seen users. A user this process hasn't seen yet (a
// cold start, a deploy) costs one indexed probe of their newest row, so a
// restart doesn't log a phantom "Visited the site" for everyone mid-session.

const VISIT_WINDOW_MS = 30 * 60 * 1000;
const lastSeenByUser = new Map<string, number>();

/** Resolves once the pending cold-start probe (if any) has settled — for tests. */
let pendingProbe: Promise<void> = Promise.resolve();
export function visitProbeSettled(): Promise<void> {
  return pendingProbe;
}

/** Called from the auth middlewares on every authenticated request. */
export function noteVisit(userId: string): void {
  const now = Date.now();
  const last = lastSeenByUser.get(userId);
  lastSeenByUser.set(userId, now);
  if (last !== undefined) {
    if (now - last >= VISIT_WINDOW_MS) void insert(userId, "visit", {}, nextActivityStamp(now));
    return;
  }
  // Stamp now, before the probe: the visit must sort ahead of whatever this
  // same request logs while the probe is in flight.
  const stamp = nextActivityStamp(now);
  pendingProbe = getDb()
    .execute({
      sql: "SELECT MAX(sort_ms) AS last FROM activity_log WHERE user_id = ? AND sort_ms < ?",
      args: [userId, stamp],
    })
    .then(
      (res) => {
        const previous = res.rows[0]?.last;
        if (typeof previous === "number" && stamp - previous < VISIT_WINDOW_MS) return;
        return insert(userId, "visit", {}, stamp);
      },
      // Can't tell — err on the side of the old behaviour and log it.
      () => insert(userId, "visit", {}, stamp),
    );
}

/**
 * Stamp a user as freshly seen WITHOUT logging a visit row. Used by the login
 * hook so a sign-in logs "login" alone, not "login" + an immediate "visit".
 */
export function markSeen(userId: string): void {
  lastSeenByUser.set(userId, Date.now());
}

/** Forget every in-memory visit stamp — tests only (simulates a restart). */
export function resetVisitTracking(): void {
  lastSeenByUser.clear();
}

// ── settings diffs ────────────────────────────────────────────────────

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * The fields a settings save actually changed, as `{ field: { from, to } }` —
 * what a `*-settings` activity row records. Empty when the save was a no-op,
 * which callers treat as "nothing to log".
 */
export function settingsChanges(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
): SettingsChanges {
  const changes: SettingsChanges = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    // An absent field reads as null, so "unset" → "null" is no change.
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (canonical(from) !== canonical(to)) changes[key] = { from, to };
  }
  return changes;
}
