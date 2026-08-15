import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import { ColumnChart } from "../../ui/charts";
import { monthlyBuckets } from "./summary-stats.ts";

/** Matches per month as stacked won/lost/other columns; respects filters. */
export function MonthlyActivityChart({ items }: { items: readonly ProfileMatchSummaryItem[] }) {
  const buckets = monthlyBuckets(items);
  if (buckets.length < 2) return null;
  return (
    <ColumnChart
      height={110}
      columns={buckets.map((b) => ({
        label: b.label,
        segments: [
          { value: b.wins, tone: "emerald", label: "won" },
          { value: b.placed, tone: "amber", label: "placed" },
          { value: b.losses, tone: "rose", label: "lost" },
          { value: b.other, tone: "neutral", label: "other" },
        ],
      }))}
    />
  );
}
