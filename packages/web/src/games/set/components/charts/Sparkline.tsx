interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  highlightLast?: boolean;
  invertY?: boolean;
}

export default function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "#818cf8",
  highlightLast = true,
  invertY = false,
}: SparklineProps) {
  if (data.length < 2) return null;

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

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg aria-hidden="true" width={width} height={height} className="block">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={`${points[0].split(",")[0]},${pad + h} ${points.join(" ")} ${lastX},${pad + h}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {highlightLast && <circle cx={lastX} cy={lastY} r={2.5} fill={color} />}
    </svg>
  );
}
