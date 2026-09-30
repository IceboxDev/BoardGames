import { useState } from "react";
import type { Tone } from "../tones";
import { resolveChartColor } from "./tone-hex";
import { useThemeVersion } from "./use-theme-version";

interface DataPoint {
  /** Position on the x axis: the chart is linear in it (an index, or a day number for a date axis). */
  x: number;
  y: number;
  label?: string;
}

interface LineChartProps {
  data: DataPoint[];
  rollingAvgData?: DataPoint[];
  yLabel?: string;
  /** Explicit hex/hsl stroke; wins over `tone`. */
  color?: string;
  /** Tone-vocabulary stroke (default `accent`). */
  tone?: Tone;
  height?: number;
  /** Lower is better: small values plot at the top (the axis labels follow). */
  invertY?: boolean;
  /** A fixed y range (e.g. `[0, 100]` for a percentage); otherwise it fits the data. */
  yDomain?: readonly [number, number];
  /** Formats y values on the axis and in the hover label. */
  formatY?: (v: number) => string;
}

const GRID_TARGET = 4;

/** Round tick values (1 / 2 / 5 × 10ⁿ) covering [min, max]. */
function niceTicks(min: number, max: number): number[] {
  const raw = (max - min) / GRID_TARGET;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) {
    out.push(Number(v.toPrecision(12)));
  }
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

function defaultFormat(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Line chart with hover points, optional dashed rolling-average overlay. */
export function LineChart({
  data,
  rollingAvgData,
  yLabel,
  color,
  tone,
  height = 200,
  invertY = false,
  yDomain,
  formatY = defaultFormat,
}: LineChartProps) {
  useThemeVersion(); // re-render on themechange so the stroke re-resolves
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const stroke = resolveChartColor(color, tone);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-fg-disabled text-sm" style={{ height }}>
        Not enough data yet
      </div>
    );
  }

  const width = 600;
  const pad = { top: 20, right: 20, bottom: 28, left: 50 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const allY = [...data.map((d) => d.y), ...(rollingAvgData?.map((d) => d.y) ?? [])];
  let ticks: number[];
  if (yDomain) {
    ticks = niceTicks(yDomain[0], yDomain[1]);
  } else {
    let lo = Math.min(...allY);
    let hi = Math.max(...allY);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    ticks = niceTicks(lo, hi);
  }
  const minY = ticks[0];
  const maxY = ticks[ticks.length - 1];

  const xs = data.map((d) => d.x);
  const minX = Math.min(...xs);
  const spanX = Math.max(...xs) - minX || 1;
  const toX = (x: number) => pad.left + ((x - minX) / spanX) * cw;
  const toY = (v: number) => {
    const norm = (v - minY) / (maxY - minY);
    return pad.top + (invertY ? norm : 1 - norm) * ch;
  };

  const linePoints = data.map((d) => `${toX(d.x)},${toY(d.y)}`).join(" ");
  const rollingLine = rollingAvgData
    ? rollingAvgData.map((d) => `${toX(d.x)},${toY(d.y)}`).join(" ")
    : null;

  // X labels: at most ~8, always the last one, never two crowding each other.
  const xLabels: number[] = [];
  const minGap = cw / 8;
  for (let i = data.length - 1; i >= 0; i--) {
    const px = toX(data[i].x);
    if (xLabels.length === 0 || toX(data[xLabels[xLabels.length - 1]].x) - px >= minGap) {
      xLabels.push(i);
    }
  }

  const hovered = hoverIdx !== null ? data[hoverIdx] : undefined;
  const tipY = hovered ? Math.max(0, toY(hovered.y) - 28) : 0;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: height }}
    >
      {ticks.map((v) => {
        const y = toY(v);
        return (
          <g key={v}>
            <line
              x1={pad.left}
              y1={y}
              x2={width - pad.right}
              y2={y}
              className="stroke-line"
              strokeWidth={0.5}
            />
            <text
              x={pad.left - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-fg-muted"
              fontSize={9}
            >
              {formatY(v)}
            </text>
          </g>
        );
      })}

      {yLabel && (
        <text
          x={12}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="fill-fg-secondary"
          fontSize={9}
          transform={`rotate(-90, 12, ${pad.top + ch / 2})`}
        >
          {yLabel}
        </text>
      )}

      <polyline
        points={linePoints}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {rollingLine && (
        <polyline
          points={rollingLine}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />
      )}

      {data.map((d, i) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: chart data point hover
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
          key={i}
          cx={toX(d.x)}
          cy={toY(d.y)}
          r={hoverIdx === i ? 4 : 2}
          fill={hoverIdx === i ? "#fff" : stroke}
          stroke={stroke}
          strokeWidth={1}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx(null)}
          className="cursor-pointer"
        />
      ))}

      {hovered && hoverIdx !== null && (
        <g>
          <rect
            x={Math.max(pad.left, Math.min(toX(hovered.x) - 45, width - pad.right - 90))}
            y={tipY}
            width={90}
            height={22}
            rx={4}
            className="fill-surface-900 stroke-line-strong"
            strokeWidth={0.5}
          />
          <text
            x={Math.max(pad.left + 45, Math.min(toX(hovered.x), width - pad.right - 45))}
            y={tipY + 14}
            textAnchor="middle"
            className="fill-fg-primary"
            fontSize={10}
          >
            {hovered.label ?? `#${hoverIdx + 1}`}: {formatY(hovered.y)}
          </text>
        </g>
      )}

      {xLabels.map((i) => (
        <text
          key={`xl-${i}`}
          x={toX(data[i].x)}
          y={height - 4}
          textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
          className="fill-fg-muted"
          fontSize={8}
        >
          {data[i].label ?? `#${i + 1}`}
        </text>
      ))}
    </svg>
  );
}
