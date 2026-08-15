import { motion } from "framer-motion";
import { cn } from "../../../lib/cn";
import type { Tone } from "../tones";
import { resolveChartColor } from "./tone-hex";

interface ColumnSegment {
  value: number;
  /** Explicit hex/hsl fill; wins over `tone`. */
  color?: string;
  /** Tone-vocabulary fill (default `accent`). */
  tone?: Tone;
  label?: string;
}

export interface ChartColumn {
  label: string;
  segments: ColumnSegment[];
}

interface ColumnChartProps {
  columns: ChartColumn[];
  /** Plot height in px, excluding labels (default 120). */
  height?: number;
  maxValue?: number;
  /** Value → display string for tooltips (default `String`). */
  formatValue?: (value: number) => string;
  className?: string;
}

/**
 * Vertical stacked columns (activity-per-month style). DOM-based so it stays
 * responsive; wide series scroll horizontally inside the component. Columns
 * grow in on mount.
 */
export function ColumnChart({
  columns,
  height = 120,
  maxValue,
  formatValue = String,
  className,
}: ColumnChartProps) {
  const computedMax =
    maxValue ?? Math.max(...columns.map((c) => c.segments.reduce((s, seg) => s + seg.value, 0)), 1);

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="flex min-w-full items-end gap-1.5">
        {columns.map((col) => {
          const total = col.segments.reduce((s, seg) => s + seg.value, 0);
          const tooltip = [
            `${col.label}: ${formatValue(total)}`,
            ...col.segments
              .filter((seg) => seg.value > 0 && seg.label)
              .map((seg) => `${seg.label}: ${formatValue(seg.value)}`),
          ].join("\n");
          return (
            <div
              key={col.label}
              className="flex min-w-6 flex-1 flex-col items-stretch gap-1"
              title={tooltip}
            >
              {/* Stack grows bottom-up: render segments top-down inside a
                  bottom-aligned flex column. */}
              <div className="flex flex-col justify-end" style={{ height }}>
                {total === 0 ? (
                  <div className="h-px rounded-full bg-white/10" />
                ) : (
                  [...col.segments]
                    .filter((seg) => seg.value > 0)
                    .map((seg, i) => (
                      <motion.div
                        // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                        key={`${i}-${seg.label ?? ""}`}
                        className="w-full rounded-[2px] first:rounded-t"
                        style={{ backgroundColor: resolveChartColor(seg.color, seg.tone) }}
                        initial={{ height: 0 }}
                        animate={{ height: (seg.value / computedMax) * height }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                      />
                    ))
                )}
              </div>
              <span className="truncate text-center text-3xs text-fg-muted">{col.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
