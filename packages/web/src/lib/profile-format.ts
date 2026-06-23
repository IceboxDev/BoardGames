// Small display formatters shared across the profile components. Dates on the
// wire are either a date key ("YYYY-MM-DD", calendar nights) or an opaque
// timestamp string (match `playedAt`, `memberSince`). Both are parsed leniently
// — a value we can't parse is shown verbatim rather than as "Invalid Date".

/** "Sat, Jul 12" from a "YYYY-MM-DD" date key (parsed as local midnight). */
export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "Jul 2026" from any parseable date string (member-since). */
export function formatMonthYear(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** "Jul 12, 2026" from any parseable date string (match played-at). */
export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Initials for an avatar fallback: first letters of the first two words. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
