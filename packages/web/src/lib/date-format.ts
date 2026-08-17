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

/**
 * ISO-8601 week number (1–53) for a "YYYY-MM-DD" date key, or null if
 * malformed. Weeks start Monday; week 1 is the week containing the year's
 * first Thursday (so Jan 1–3 can belong to the previous year's week 52/53).
 */
export function isoWeek(dateKey: string): number | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  // Compute in UTC so DST transitions can't shift a midnight across days.
  const date = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - day + 3); // this week's Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
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

/**
 * Parse a SQLite "YYYY-MM-DD HH:MM:SS" (UTC) — or any parseable timestamp —
 * into a local Date, or null. THE single UTC-stamp coercion; callers that
 * need their own formatting (ActivityDrawer's time-of-day) build on this
 * instead of re-implementing the `replace(" ", "T") + "Z"` idiom.
 */
export function parseUtcStamp(stamp: string): Date | null {
  const d = new Date(stamp.includes(" ") ? `${stamp.replace(" ", "T")}Z` : stamp);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "just now" / "5 minutes ago" / "3 hours ago" / "2 days ago" from a SQLite
 * "YYYY-MM-DD HH:MM:SS" (UTC) or any parseable timestamp. Unparseable input
 * degrades to "recently".
 */
export function formatRelativeTime(stamp: string): string {
  const d = parseUtcStamp(stamp);
  if (!d) return "recently";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
