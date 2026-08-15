import type { Tone } from "../tones";
import { resolveChartColor } from "./tone-hex";

interface Segment {
  value: number;
  /** Explicit hex/hsl fill; wins over `tone`. */
  color?: string;
  /** Tone-vocabulary fill (default `accent`). */
  tone?: Tone;
  label?: string;
}

interface Bar {
  label: string;
  segments: Segment[];
  annotation?: string;
}

interface BarChartHProps {
  bars: Bar[];
  maxValue?: number;
  /** Value → display string for tooltips and the total column. */
  formatValue?: (value: number) => string;
  /** Width class of the row-label column (default `w-8`). */
  labelWidthClassName?: string;
}

/** Horizontal stacked bars — one row per label, segments share one scale. */
export function BarChartH({
  bars,
  maxValue,
  formatValue = String,
  labelWidthClassName = "w-8",
}: BarChartHProps) {
  const computedMax =
    maxValue ?? Math.max(...bars.map((b) => b.segments.reduce((s, seg) => s + seg.value, 0)), 1);

  return (
    <div className="space-y-1.5">
      {bars.map((bar, i) => {
        const total = bar.segments.reduce((s, seg) => s + seg.value, 0);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
            key={i}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className={`${labelWidthClassName} text-right text-fg-muted shrink-0 tabular-nums`}
            >
              {bar.label}
            </span>
            <div className="flex-1 h-5 bg-surface-800 rounded overflow-hidden flex">
              {bar.segments.map((seg, j) => {
                const segPct = (seg.value / computedMax) * 100;
                if (segPct <= 0) return null;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                    key={j}
                    className="h-full relative group"
                    style={{
                      width: `${segPct}%`,
                      backgroundColor: resolveChartColor(seg.color, seg.tone),
                    }}
                    title={
                      seg.label ? `${seg.label}: ${formatValue(seg.value)}` : formatValue(seg.value)
                    }
                  />
                );
              })}
            </div>
            <span className="w-12 text-right text-fg-muted tabular-nums shrink-0">
              {formatValue(total)}
            </span>
            {bar.annotation && (
              <span className="w-6 text-fg-disabled text-center shrink-0" title="Board size">
                {bar.annotation}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
