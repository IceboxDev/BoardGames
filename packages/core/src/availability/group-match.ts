// Group date finder — "when are THESE people free?".
//
// The admin picks a group in lock mode; every candidate date is scored by how
// many of the group marked it. A maybe counts as available but ranks below a
// can. An admin away note counts as missing, but only where the member left
// no mark of their own (their mark wins — the calendar's rule). The RSVP
// yes/no merging already happened server-side in the aggregate map.

import { nightKeysOf } from "../protocol/common.ts";

export type GroupMatchTier = "all" | "most" | "none";

export interface GroupDayMatch {
  date: string;
  can: string[];
  maybe: string[];
  /** Picked members with no mark that day (includes `away`). */
  missing: string[];
  /** The subset of `missing` an admin noted as away. */
  away: string[];
  tier: GroupMatchTier;
  /** The night key a new lock on this date takes, or null when both slots are taken. */
  nightKey: string | null;
}

export interface GroupMatchInput {
  /** Picked member ids. */
  group: readonly string[];
  /** Dates to score (`YYYY-MM-DD`), in calendar order. */
  dates: readonly string[];
  /** Per date, who marked it and how (the admin aggregate map's shape). */
  availability: Readonly<
    Record<string, readonly { userId: string; status: "can" | "maybe" }[] | undefined>
  >;
  /** Admin away notes per member. */
  awayByUser?: Readonly<Record<string, readonly string[] | undefined>>;
  /** Night keys already locked (`date` / `date_2`). */
  lockedNightKeys?: ReadonlySet<string>;
}

/** "Most" means everyone but one — and only once a group is big enough for that to matter. */
const MOST_MIN_GROUP = 3;

/** Every date scored, keyed by date. Empty when the group is empty. */
export function scoreGroupDates(input: GroupMatchInput): Record<string, GroupDayMatch> {
  const { group, dates, availability, awayByUser, lockedNightKeys } = input;
  const out: Record<string, GroupDayMatch> = {};
  if (group.length === 0) return out;

  const awaySets = new Map<string, Set<string>>();
  for (const id of group) awaySets.set(id, new Set(awayByUser?.[id] ?? []));

  for (const date of dates) {
    const marks = new Map<string, "can" | "maybe">();
    for (const entry of availability[date] ?? []) marks.set(entry.userId, entry.status);

    const can: string[] = [];
    const maybe: string[] = [];
    const missing: string[] = [];
    const away: string[] = [];
    for (const id of group) {
      const mark = marks.get(id);
      if (mark === "can") can.push(id);
      else if (mark === "maybe") maybe.push(id);
      else {
        missing.push(id);
        if (awaySets.get(id)?.has(date)) away.push(id);
      }
    }

    const tier: GroupMatchTier =
      missing.length === 0
        ? "all"
        : missing.length === 1 && group.length >= MOST_MIN_GROUP
          ? "most"
          : "none";
    const nightKey = nightKeysOf(date).find((key) => !lockedNightKeys?.has(key)) ?? null;
    out[date] = { date, can, maybe, missing, away, tier, nightKey };
  }
  return out;
}

/**
 * The dates worth offering, best first: most of the group available, then
 * most of them a firm "can", then the earliest. Dates with no free night
 * slot and dates nobody in the group marked are left out.
 */
export function rankGroupDates(scored: Readonly<Record<string, GroupDayMatch>>): GroupDayMatch[] {
  return Object.values(scored)
    .filter((m) => m.nightKey !== null && m.can.length + m.maybe.length > 0)
    .sort(
      (a, b) =>
        b.can.length + b.maybe.length - (a.can.length + a.maybe.length) ||
        b.can.length - a.can.length ||
        a.date.localeCompare(b.date),
    );
}
