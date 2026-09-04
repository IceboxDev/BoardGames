import { useId } from "react";
import type { Tone } from "../tones";
import { resolveChartColor } from "./tone-hex";
import { useThemeVersion } from "./use-theme-version";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Explicit hex/hsl stroke; wins over `tone`. */
  color?: string;
  /** Tone-vocabulary stroke (default `accent`). */
  tone?: Tone;
  highlightLast?: boolean;
  invertY?: boolean;
}

/** Tiny inline trend line with a soft gradient fill under the stroke. */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  color,
  tone,
  highlightLast = true,
  invertY = false,
}: SparklineProps) {
  useThemeVersion(); // re-render on themechange so the stroke re-resolves
  const gradientId = useId();
  if (data.length < 2) return null;
  const stroke = resolveChartColor(color, tone);

  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  let min = Math.min(...data);
  let max = Math.max(...data);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    let yNorm = (v - min) / (max - min);
    if (invertY) yNorm = 1 - yNorm;
    const y = pad + (1 - yNorm) * h;
    return `${x},${y}`;
  });

  const last = data[data.length - 1];
  let lastYNorm = (last - min) / (max - min);
  if (invertY) lastYNorm = 1 - lastYNorm;
  const lastX = pad + w;
  const lastY = pad + (1 - lastYNorm) * h;

  return (
    <svg aria-hidden="true" width={width} height={height} className="block">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`${points[0].split(",")[0]},${pad + h} ${points.join(" ")} ${lastX},${pad + h}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {highlightLast && <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />}
    </svg>
  );
}
