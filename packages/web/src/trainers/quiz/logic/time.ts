import { addDays } from "@boardgames/core/quiz/srs";

// "3 days ago" for a timestamp — the trainer's one relative-time spelling,
// shared by the recent-misses list and the archive's "continue reading".

export function relativeDays(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

/** "Today", "Yesterday", else "Monday, 5 Oct" in the viewer's locale. */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}
