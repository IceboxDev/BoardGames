// Shared date display formatters. Dates on the wire are either a date key
// ("YYYY-MM-DD", calendar nights — parsed as LOCAL midnight so the day never
// drifts across timezones) or an opaque timestamp string (match `playedAt`,
// `memberSince`). Both are parsed leniently — a value we can't parse is shown
// verbatim rather than as "Invalid Date".

/** Display styles for a "YYYY-MM-DD" date key. */
export type DayKeyStyle =
  /** "Sat, Jul 12" — compact list/inline label (default). */
  | "short"
  /** "Saturday, July 12, 2026" — full heading with year. */
  | "full"
  /** "Saturday, July 12" — weekday heading without year. */
  | "weekday"
  /** "12 Jul 2026" — numeric-day-first, with year. */
  | "compact";

const DAY_KEY_OPTIONS: Record<DayKeyStyle, Intl.DateTimeFormatOptions> = {
  short: { weekday: "short", month: "short", day: "numeric" },
  full: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  weekday: { weekday: "long", month: "long", day: "numeric" },
  compact: { day: "numeric", month: "short", year: "numeric" },
};

/** Parse a "YYYY-MM-DD" date key as local midnight, or null if malformed. */
export function parseDateKey(dateKey: string): Date | null {
  const [y, m, d] = dateKey.split("-").map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Format a "YYYY-MM-DD" date key for display. Falls back to the raw key. */
export function formatDayKey(dateKey: string, style: DayKeyStyle = "short"): string {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  return date.toLocaleDateString(undefined, DAY_KEY_OPTIONS[style]);
}

/** "Jul 2026" from any parseable timestamp string (member-since). */
export function formatMonthYear(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** "Jul 12, 2026" from any parseable timestamp string (match played-at). */
export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
