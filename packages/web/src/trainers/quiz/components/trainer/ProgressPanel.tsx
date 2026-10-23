import type { DomainOverview, TrainerHistory } from "@boardgames/core/protocol";
import { daysBetween } from "@boardgames/core/quiz/srs";
import { useMemo, useState } from "react";
import { MicroLabel, SegmentedControl, Surface } from "../../../../components/ui";
import { LineChart } from "../../../../components/ui/charts";
import { cn } from "../../../../lib/cn";
import { formatHeatDate } from "./heatmap";

// The hub's progress panel: one line over the study days (accuracy, review
// count or new cards learned — the viewer picks) and, under it, the whole
// bank in three counts — seen, learned, mastered — as one stacked bar.
// Per-domain progress lives on the domain tiles themselves.

type Metric = "accuracy" | "reviews" | "learned";

const METRICS: { value: Metric; label: string; title: string }[] = [
  { value: "accuracy", label: "Accuracy", title: "Share of reviews graded “knew it”" },
  { value: "reviews", label: "Reviews", title: "Cards reviewed per day" },
  { value: "learned", label: "Learned", title: "New cards introduced per day" },
];

const METRIC_TONE = { accuracy: "emerald", reviews: "accent", learned: "sky" } as const;
const METRIC_Y = { accuracy: "knew it", reviews: "reviews", learned: "new cards" } as const;
const percent = (v: number) => `${v}%`;

/** The accuracy band with ~10 points of air, clamped to 0–100 %. */
function accuracyDomain(points: readonly { y: number }[]): [number, number] {
  if (points.length === 0) return [0, 100];
  const ys = points.map((p) => p.y);
  const lo = Math.max(0, Math.min(...ys) - 10);
  const hi = Math.min(100, Math.max(...ys) + 10);
  return [lo, Math.max(hi, lo + 10)];
}

function shortDate(dateKey: string): string {
  return formatHeatDate(dateKey).replace(/,?\s*\d{4}$/, "");
}

type Props = {
  days: TrainerHistory["days"];
  domains: readonly DomainOverview[];
  className?: string;
};

export function ProgressPanel({ days, domains, className }: Props) {
  const [metric, setMetric] = useState<Metric>("accuracy");

  const data = useMemo(() => {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date;
    const points: { x: number; y: number; label: string }[] = [];
    for (const d of sorted) {
      let y: number | null = null;
      if (metric === "accuracy") {
        const graded = d.good + d.again;
        y = graded > 0 ? Math.round((d.good / graded) * 100) : null;
      } else if (metric === "reviews") y = d.reviews;
      else y = d.newIntroduced;
      // x is the calendar day, so a week off reads as a gap, not a step.
      if (y !== null && first)
        points.push({ x: daysBetween(first, d.date), y, label: shortDate(d.date) });
    }
    return points;
  }, [days, metric]);

  const totals = useMemo(() => {
    let seen = 0;
    let learned = 0;
    let mastered = 0;
    let total = 0;
    for (const c of domains) {
      seen += c.seen;
      learned += c.known;
      mastered += c.mature;
      total += c.total;
    }
    return { seen, learned, mastered, total };
  }, [domains]);

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
      <LineChart
        data={data}
        tone={METRIC_TONE[metric]}
        yLabel={METRIC_Y[metric]}
        height={160}
        // Accuracy zooms to its own band (padded, inside 0–100 %) so a
        // trend is visible; counts start from zero.
        yDomain={
          metric === "accuracy" ? accuracyDomain(data) : [0, Math.max(1, ...data.map((p) => p.y))]
        }
        formatY={metric === "accuracy" ? percent : undefined}
      />
      <BankTotals {...totals} />
    </Surface>
  );
}

const TOTALS = [
  {
    key: "mastered",
    label: "Mastered",
    title: `Known with a gap of three weeks or more`,
    dot: "bg-emerald-400",
  },
  { key: "learned", label: "Learned", title: "Graduated to review", dot: "bg-emerald-400/50" },
  { key: "seen", label: "Seen", title: "Studied at least once", dot: "bg-fg-muted/40" },
] as const;

/** The whole bank in three nested counts: mastered ⊂ learned ⊂ seen, of every fact. */
function BankTotals(props: { seen: number; learned: number; mastered: number; total: number }) {
  const { seen, learned, mastered, total } = props;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <MicroLabel>Your progress so far</MicroLabel>
        <span className="text-2xs tabular-nums text-fg-muted">{total.toLocaleString()} facts</span>
      </div>
      {/* Nested, not stacked: each layer starts at zero, so the bar reads
          as "how far each has got" with mastered in front. */}
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-fill"
        aria-hidden="true"
      >
        <span
          className="absolute inset-y-0 left-0 bg-fg-muted/40"
          style={{ width: `${pct(seen)}%` }}
        />
        <span
          className="absolute inset-y-0 left-0 bg-emerald-400/50"
          style={{ width: `${pct(learned)}%` }}
        />
        <span
          className="absolute inset-y-0 left-0 bg-emerald-400"
          style={{ width: `${pct(mastered)}%` }}
        />
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {TOTALS.map((t) => (
          <div key={t.key} className="flex flex-col" title={t.title}>
            <dt className="flex items-center gap-1.5 text-2xs text-fg-muted">
              <span className={cn("h-2 w-2 rounded-full", t.dot)} aria-hidden="true" />
              {t.label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums text-fg-strong">
              {props[t.key].toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
