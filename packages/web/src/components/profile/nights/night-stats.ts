// Pure aggregations over the per-night attendance items
// (`ProfileNightItem[]`, newest first) — everything the attendance page
// draws. Attendance semantics come pre-derived from the server
// (`lib/nights-attended.ts` rule); this module only counts and groups.

import type { ProfileNightItem } from "@boardgames/core/protocol";

export interface NightTotals {
  total: number;
  attended: number;
  /** Nights this user hosted. */
  hosted: number;
  /** Date key of the most recent hosted night, or null. */
  lastHostedDateKey: string | null;
  /** Recorded matches the user played across all nights. */
  gamesPlayed: number;
  /** Mean games played on attended nights, or null with no attended nights. */
  avgGamesPerAttendedNight: number | null;
}

export function nightTotals(items: readonly ProfileNightItem[], userId: string): NightTotals {
  let attended = 0;
  let hosted = 0;
  let lastHostedDateKey: string | null = null;
  let gamesPlayed = 0;
  for (const night of items) {
    if (night.attended) attended++;
    gamesPlayed += night.matchesPlayedByUser;
    if (night.host?.userId === userId) {
      hosted++;
      // Items are newest first, so the first hosted night is the latest.
      if (lastHostedDateKey === null) lastHostedDateKey = night.dateKey;
    }
  }
  return {
    total: items.length,
    attended,
    hosted,
    lastHostedDateKey,
    gamesPlayed,
    avgGamesPerAttendedNight: attended > 0 ? gamesPlayed / attended : null,
  };
}

export interface AttendanceStreaks {
  /** Consecutive most-recent nights attended (0 when the last night was missed). */
  current: number;
  longest: number;
}

export function attendanceStreaks(items: readonly ProfileNightItem[]): AttendanceStreaks {
  const chronological = [...items].reverse();
  let longest = 0;
  let run = 0;
  for (const night of chronological) {
    run = night.attended ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  // `run` ends on the newest night, so it IS the current streak.
  return { current: run, longest };
}

export interface AttendanceMonthBucket {
  key: string;
  label: string;
  attended: number;
  missed: number;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Chronological month buckets over nights, gap months included. */
export function monthlyAttendance(items: readonly ProfileNightItem[]): AttendanceMonthBucket[] {
  if (items.length === 0) return [];
  const byKey = new Map<string, AttendanceMonthBucket>();
  let minKey = "";
  let maxKey = "";
  for (const night of items) {
    const key = night.dateKey.slice(0, 7);
    if (!minKey || key < minKey) minKey = key;
    if (!maxKey || key > maxKey) maxKey = key;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { key, label: "", attended: 0, missed: 0 };
      byKey.set(key, bucket);
    }
    if (night.attended) bucket.attended++;
    else bucket.missed++;
  }

  const out: AttendanceMonthBucket[] = [];
  let [y, m] = minKey.split("-").map((s) => Number.parseInt(s, 10));
  const [maxY, maxM] = maxKey.split("-").map((s) => Number.parseInt(s, 10));
  while (y < maxY || (y === maxY && m <= maxM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const bucket = byKey.get(key) ?? { key, label: "", attended: 0, missed: 0 };
    bucket.label =
      m === 1 || out.length === 0
        ? `${MONTH_NAMES[m - 1]} ’${String(y).slice(2)}`
        : MONTH_NAMES[m - 1];
    out.push(bucket);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface WeekdayBucket {
  label: string;
  attended: number;
  missed: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Mon–Sun distribution of nights (local-midnight parse of the date key). */
export function weekdayBreakdown(items: readonly ProfileNightItem[]): WeekdayBucket[] {
  const buckets = WEEKDAYS.map((label) => ({ label, attended: 0, missed: 0 }));
  for (const night of items) {
    const [y, m, d] = night.dateKey.split("-").map((s) => Number.parseInt(s, 10));
    if (!y || !m || !d) continue;
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // Mon = 0
    if (night.attended) buckets[dow].attended++;
    else buckets[dow].missed++;
  }
  return buckets;
}

export interface HostGroup {
  key: string;
  hostUserId: string | null;
  name: string;
  /** Address of the group's most recent night (compact-format upstream). */
  latestAddress: string | null;
  attended: number;
  total: number;
}

/** Nights grouped by host ("location" = host + address; no locations table). */
export function hostGroups(items: readonly ProfileNightItem[]): HostGroup[] {
  const byKey = new Map<string, HostGroup>();
  for (const night of items) {
    const key = night.host ? (night.host.userId ?? `name:${night.host.name}`) : "no-host";
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        hostUserId: night.host?.userId ?? null,
        name: night.host?.name ?? "No host recorded",
        latestAddress: night.address, // newest-first ⇒ first seen is latest
        attended: 0,
        total: 0,
      };
      byKey.set(key, group);
    }
    group.total++;
    if (night.attended) group.attended++;
    if (group.latestAddress === null && night.address !== null) {
      group.latestAddress = night.address;
    }
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export interface RsvpBehavior {
  yes: number;
  no: number;
  noResponse: number;
  /** Of the yes RSVPs: stamped automatically at lock time vs clicked. */
  autoYes: number;
  manualYes: number;
  /** RSVP'd yes on a night with recorded matches AND actually played. */
  yesAndPlayed: number;
  /** RSVP'd yes on a night with recorded matches, of which the above played. */
  yesWithMatches: number;
  /** The deliberate attribution gap: RSVP'd yes, night has matches, none theirs. */
  yesButNoMatch: number;
}

export function rsvpBehavior(items: readonly ProfileNightItem[]): RsvpBehavior {
  const behavior: RsvpBehavior = {
    yes: 0,
    no: 0,
    noResponse: 0,
    autoYes: 0,
    manualYes: 0,
    yesAndPlayed: 0,
    yesWithMatches: 0,
    yesButNoMatch: 0,
  };
  for (const night of items) {
    if (night.rsvp === "yes") {
      behavior.yes++;
      if (night.rsvpAuto) behavior.autoYes++;
      else behavior.manualYes++;
      if (night.totalMatches > 0) {
        behavior.yesWithMatches++;
        if (night.matchesPlayedByUser > 0) behavior.yesAndPlayed++;
        else behavior.yesButNoMatch++;
      }
    } else if (night.rsvp === "no") {
      behavior.no++;
    } else {
      behavior.noResponse++;
    }
  }
  return behavior;
}
