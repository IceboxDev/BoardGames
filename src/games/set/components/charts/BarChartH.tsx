interface Segment {
  value: number;
  color: string;
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
}

export default function BarChartH({ bars, maxValue }: BarChartHProps) {
  const computedMax =
    maxValue ?? Math.max(...bars.map((b) => b.segments.reduce((s, seg) => s + seg.value, 0)), 1);

  return (
    <div className="space-y-1.5">
      {bars.map((bar, i) => {
        const total = bar.segments.reduce((s, seg) => s + seg.value, 0);
        const _pct = (total / computedMax) * 100;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
            key={i}
            className="flex items-center gap-2 text-xs"
          >
            <span className="w-8 text-right text-gray-500 shrink-0 tabular-nums">{bar.label}</span>
            <div className="flex-1 h-5 bg-gray-800 rounded overflow-hidden flex">
              {bar.segments.map((seg, j) => {
                const segPct = (seg.value / computedMax) * 100;
                if (segPct <= 0) return null;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                    key={j}
                    className="h-full relative group"
                    style={{ width: `${segPct}%`, backgroundColor: seg.color }}
                    title={
                      seg.label
                        ? `${seg.label}: ${(seg.value / 1000).toFixed(1)}s`
                        : `${(seg.value / 1000).toFixed(1)}s`
                    }
                  />
                );
              })}
            </div>
            <span className="w-12 text-right text-gray-500 tabular-nums shrink-0">
              {(total / 1000).toFixed(1)}s
            </span>
            {bar.annotation && (
              <span className="w-6 text-gray-600 text-center shrink-0" title="Board size">
                {bar.annotation}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
