import type { ProfileNightItem } from "@boardgames/core/protocol";
import { BarChartH } from "../../ui/charts";
import { weekdayBreakdown } from "./night-stats.ts";

/** Mon–Sun distribution of nights, attended vs missed. */
export function WeekdayBreakdown({ items }: { items: readonly ProfileNightItem[] }) {
  const buckets = weekdayBreakdown(items).filter((b) => b.attended + b.missed > 0);
  if (buckets.length === 0) return null;
  return (
    <BarChartH
      labelWidthClassName="w-10"
      bars={buckets.map((b) => ({
        label: b.label,
        segments: [
          { value: b.attended, tone: "emerald", label: "attended" },
          { value: b.missed, tone: "neutral", label: "missed" },
        ],
      }))}
    />
  );
}
