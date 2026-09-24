import type { TrainerHistory } from "@boardgames/core/protocol";
import { Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

// Twelve weeks of study days, GitHub-style: one column per week, Monday at
// the top, emerald deepening with the day's review count. Every cell has an
// sr-only sentence, so the picture is readable without colour or a mouse.

import { buildHeatmap, cellSentence, HEATMAP_WEEKS, type HeatLevel } from "./heatmap";

const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: "bg-fill-soft",
  1: "bg-emerald-500/25",
  2: "bg-emerald-500/45",
  3: "bg-emerald-500/70",
  4: "bg-emerald-400",
};

const WEEKDAY_LABELS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "" },
  { key: "sun", label: "Sun" },
];

type Props = {
  days: TrainerHistory["days"];
  today: string;
  weeks?: number;
  className?: string;
};

export function StudyHeatmap({ days, today, weeks = HEATMAP_WEEKS, className }: Props) {
  const columns = buildHeatmap(days, today, weeks);
  const studied = columns.reduce(
    (n, col) => n + col.cells.filter((c) => !c.future && c.count > 0).length,
    0,
  );
  const spanDays = columns.reduce((n, col) => n + col.cells.filter((c) => !c.future).length, 0);
  return (
    <Surface variant="raised" padding="lg" className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg-strong">Study days</h2>
        <span className="text-2xs tabular-nums text-fg-muted">
          {studied} of the last {spanDays} days
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-1 pl-8">
            {columns.map((col) => (
              <span key={col.monday} className="w-3 text-3xs leading-none text-fg-muted">
                {col.monthLabel ? <span className="block w-8">{col.monthLabel}</span> : null}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <div className="flex w-7 flex-col gap-1">
              {WEEKDAY_LABELS.map((wd) => (
                <span
                  key={wd.key}
                  className="h-3 text-3xs leading-3 text-fg-muted"
                  aria-hidden="true"
                >
                  {wd.label}
                </span>
              ))}
            </div>
            <ol className="flex gap-1" aria-label="Reviews per day, last 12 weeks">
              {columns.map((col) => (
                <li key={col.monday} className="flex flex-col gap-1">
                  {col.cells.map((cell) => (
                    <span
                      key={cell.date}
                      data-level={cell.level}
                      title={cellSentence(cell)}
                      className={cn(
                        "block h-3 w-3 rounded-sm",
                        LEVEL_CLASS[cell.level],
                        cell.future && "opacity-30",
                        cell.date === today && "ring-1 ring-fg-strong/50",
                      )}
                    >
                      <span className="sr-only">{cellSentence(cell)}</span>
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <div
        className="flex items-center justify-end gap-1 text-3xs text-fg-muted"
        aria-hidden="true"
      >
        Less
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={cn("block h-2.5 w-2.5 rounded-sm", LEVEL_CLASS[level])} />
        ))}
        More
      </div>
    </Surface>
  );
}
