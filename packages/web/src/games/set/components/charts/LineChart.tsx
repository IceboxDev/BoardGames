import { useState } from "react";

interface DataPoint {
  x: number;
  y: number;
  label?: string;
}

interface LineChartProps {
  data: DataPoint[];
  rollingAvgData?: DataPoint[];
  yLabel?: string;
  color?: string;
  height?: number;
  invertY?: boolean;
}

export default function LineChart({
  data,
  rollingAvgData,
  yLabel,
  color = "#818cf8",
  height = 200,
  invertY = false,
}: LineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-gray-600 text-sm" style={{ height }}>
        Not enough data yet
      </div>
    );
  }

  const width = 600;
  const pad = { top: 20, right: 20, bottom: 28, left: 50 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const allY = [...data.map((d) => d.y), ...(rollingAvgData?.map((d) => d.y) ?? [])];
  let minY = Math.min(...allY);
  let maxY = Math.max(...allY);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const rangeY = maxY - minY;

  const toX = (i: number) => pad.left + (i / (data.length - 1)) * cw;
  const toY = (v: number) => {
    let norm = (v - minY) / rangeY;
    if (invertY) norm = 1 - norm;
    return pad.top + (1 - norm) * ch;
  };

  const linePoints = data.map((d, i) => `${toX(i)},${toY(d.y)}`).join(" ");

  const rollingLine = rollingAvgData
    ? rollingAvgData.map((d) => `${toX(d.x)},${toY(d.y)}`).join(" ")
    : null;

  const gridLines = 4;
  const gridYValues = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = minY + (rangeY * i) / gridLines;
    return invertY ? maxY - (v - minY) : v;
  });

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: height }}
    >
      {gridYValues.map((v, i) => {
        const y = pad.top + (i / gridLines) * ch;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
          <g key={i}>
            <line
              x1={pad.left}
              y1={y}
              x2={width - pad.right}
              y2={y}
              stroke="#374151"
              strokeWidth={0.5}
            />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fill="#6b7280" fontSize={9}>
              {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        );
      })}

      {yLabel && (
        <text
          x={12}
          y={pad.top + ch / 2}
          textAnchor="middle"
          fill="#9ca3af"
          fontSize={9}
          transform={`rotate(-90, 12, ${pad.top + ch / 2})`}
        >
          {yLabel}
        </text>
      )}

      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
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
          cx={toX(i)}
          cy={toY(d.y)}
          r={hoverIdx === i ? 4 : 2}
          fill={hoverIdx === i ? "#fff" : color}
          stroke={color}
          strokeWidth={1}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx(null)}
          className="cursor-pointer"
        />
      ))}

      {hoverIdx !== null && data[hoverIdx] && (
        <g>
          <rect
            x={Math.min(toX(hoverIdx) - 40, width - pad.right - 80)}
            y={toY(data[hoverIdx].y) - 28}
            width={80}
            height={22}
            rx={4}
            fill="#1f2937"
            stroke="#374151"
            strokeWidth={0.5}
          />
          <text
            x={Math.min(toX(hoverIdx), width - pad.right - 40)}
            y={toY(data[hoverIdx].y) - 14}
            textAnchor="middle"
            fill="#e5e7eb"
            fontSize={10}
          >
            {data[hoverIdx].label ?? `#${hoverIdx + 1}`}:{" "}
            {Number.isInteger(data[hoverIdx].y) ? data[hoverIdx].y : data[hoverIdx].y.toFixed(1)}
          </text>
        </g>
      )}

      {data.length <= 30 &&
        data.map((d, i) => {
          if (i % Math.ceil(data.length / 10) !== 0 && i !== data.length - 1) return null;
          return (
            <text
              // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
              key={`xl-${i}`}
              x={toX(i)}
              y={height - 4}
              textAnchor="middle"
              fill="#6b7280"
              fontSize={8}
            >
              {d.label ?? `#${i + 1}`}
            </text>
          );
        })}
    </svg>
  );
}
