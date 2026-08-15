import type { ProfileNightItem } from "@boardgames/core/protocol";
import { ColumnChart } from "../../ui/charts";
import { monthlyAttendance } from "./night-stats.ts";

/** Nights per month — attended stacked over missed (column = nights held). */
export function MonthlyAttendanceChart({ items }: { items: readonly ProfileNightItem[] }) {
  const buckets = monthlyAttendance(items);
  if (buckets.length < 2) return null;
  return (
    <ColumnChart
      height={110}
      columns={buckets.map((b) => ({
        label: b.label,
        segments: [
          { value: b.attended, tone: "emerald", label: "attended" },
          { value: b.missed, tone: "neutral", label: "missed" },
        ],
      }))}
    />
  );
}
