import { addDays } from "@boardgames/core/games/quiztopia/srs";
import type { TrainerHistory } from "@boardgames/core/protocol";

// The study-day heatmap's data: twelve Monday-to-Sunday weeks ending in
// today's week, one cell per day with its review count and colour level.
// Pure, so the grid is testable without rendering it.

export const HEATMAP_WEEKS = 12;

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  date: string;
  count: number;
  level: HeatLevel;
  future: boolean;
}

export interface HeatmapColumn {
  /** Monday's date key — the column's identity. */
  monday: string;
  cells: HeatmapCell[];
  /** Short month name when this column starts a new month. */
  monthLabel: string | null;
}

export function heatLevel(count: number): HeatLevel {
  if (count <= 0) return 0;
  if (count < 5) return 1;
  if (count < 15) return 2;
  if (count < 30) return 3;
  return 4;
}

function utcDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

/** Monday = 0 … Sunday = 6. */
function weekdayIndex(dateKey: string): number {
  return (utcDate(dateKey).getUTCDay() + 6) % 7;
}

function monthName(dateKey: string): string {
  return utcDate(dateKey).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}

export function formatHeatDate(dateKey: string): string {
  return utcDate(dateKey).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildHeatmap(
  days: TrainerHistory["days"],
  today: string,
  weeks = HEATMAP_WEEKS,
): HeatmapColumn[] {
  const byDate = new Map(days.map((d) => [d.date, d.reviews]));
  const start = addDays(today, -(weekdayIndex(today) + 7 * (weeks - 1)));
  const columns: HeatmapColumn[] = [];
  let prevMonth: string | null = null;
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(start, w * 7);
    const cells: HeatmapCell[] = [];
    for (let r = 0; r < 7; r++) {
      const date = addDays(monday, r);
      const future = date > today;
      const count = future ? 0 : (byDate.get(date) ?? 0);
      cells.push({ date, count, level: heatLevel(count), future });
    }
    const month = monday.slice(0, 7);
    columns.push({ monday, cells, monthLabel: month !== prevMonth ? monthName(monday) : null });
    prevMonth = month;
  }
  return columns;
}

export function cellSentence(cell: HeatmapCell): string {
  const when = formatHeatDate(cell.date);
  if (cell.future) return `${when}: not yet`;
  if (cell.count === 0) return `${when}: no reviews`;
  return `${when}: ${cell.count} ${cell.count === 1 ? "review" : "reviews"}`;
}
