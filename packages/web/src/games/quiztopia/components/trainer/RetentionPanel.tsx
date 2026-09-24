import type { CategoryOverview, TrainerHistory } from "@boardgames/core/protocol";
import { useMemo, useState } from "react";
import { MicroLabel, SegmentedControl, Surface } from "../../../../components/ui";
import { BarChartH, LineChart } from "../../../../components/ui/charts";
import { cn } from "../../../../lib/cn";
import { districtByN } from "../../bands";
import { formatHeatDate } from "./heatmap";

// The hub's second chart panel: one line over the study days (accuracy,
// review count or new cards learned — the viewer picks) and the twelve
// districts' mastery as horizontal bars, so a weak district is visible at
// a glance next to the city that shows only "due or not".

type Metric = "accuracy" | "reviews" | "learned";

const METRICS: { value: Metric; label: string; title: string }[] = [
  { value: "accuracy", label: "Accuracy", title: "Share of reviews graded “knew it”" },
  { value: "reviews", label: "Reviews", title: "Cards reviewed per day" },
  { value: "learned", label: "Learned", title: "New cards introduced per day" },
];

const METRIC_TONE = { accuracy: "emerald", reviews: "accent", learned: "sky" } as const;
const METRIC_Y = { accuracy: "% knew it", reviews: "reviews", learned: "new cards" } as const;

function shortDate(dateKey: string): string {
  return formatHeatDate(dateKey).replace(/,?\s*\d{4}$/, "");
}

type Props = {
  days: TrainerHistory["days"];
  categories: readonly CategoryOverview[];
  className?: string;
};

export function RetentionPanel({ days, categories, className }: Props) {
  const [metric, setMetric] = useState<Metric>("accuracy");

  const data = useMemo(() => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const points: { x: number; y: number; label: string }[] = [];
    for (const d of sorted) {
      let y: number | null = null;
      if (metric === "accuracy") {
        const graded = d.good + d.again;
        y = graded > 0 ? Math.round((d.good / graded) * 100) : null;
      } else if (metric === "reviews") y = d.reviews;
      else y = d.newIntroduced;
      if (y !== null) points.push({ x: points.length, y, label: shortDate(d.date) });
    }
    return points;
  }, [days, metric]);

  const bars = useMemo(
    () =>
      categories.map((c) => {
        const d = districtByN(c.n);
        return {
          label: d.label,
          segments: [{ value: Math.round(c.mastery * 100), tone: d.tone, label: d.en }],
        };
      }),
    [categories],
  );

  return (
    <Surface variant="raised" padding="lg" className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-strong">Progress</h2>
        <SegmentedControl
          options={METRICS}
          value={metric}
          onChange={setMetric}
          size="xs"
          shape="pill"
          aria-label="Progress metric"
        />
      </div>
      <LineChart data={data} tone={METRIC_TONE[metric]} yLabel={METRIC_Y[metric]} height={160} />
      <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
        <MicroLabel>Mastery by district</MicroLabel>
        <BarChartH bars={bars} maxValue={100} formatValue={(v) => `${Math.round(v)}%`} />
      </div>
    </Surface>
  );
}
