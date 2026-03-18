import type { SkillProfile } from "../../logic/analytics";

interface RadarChartProps {
  profile: SkillProfile;
  previousProfile?: SkillProfile;
  size?: number;
}

const AXES: { key: keyof SkillProfile; label: string }[] = [
  { key: "speed", label: "Speed" },
  { key: "anticipation", label: "Anticipation" },
  { key: "accuracy", label: "Accuracy" },
  { key: "consistency", label: "Consistency" },
  { key: "boardReading", label: "Board Reading" },
];

function polarToCart(cx: number, cy: number, r: number, angleIdx: number, total: number) {
  const angle = (Math.PI * 2 * angleIdx) / total - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function profileToPoints(profile: SkillProfile, cx: number, cy: number, maxR: number) {
  return AXES.map((a, i) => {
    const v = profile[a.key] / 100;
    return polarToCart(cx, cy, v * maxR, i, AXES.length);
  });
}

export default function RadarChart({ profile, previousProfile, size = 240 }: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 30;

  const gridLevels = [25, 50, 75, 100];

  const currentPoints = profileToPoints(profile, cx, cy, maxR);
  const currentPoly = currentPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const prevPoly = previousProfile
    ? profileToPoints(previousProfile, cx, cy, maxR)
        .map((p) => `${p.x},${p.y}`)
        .join(" ")
    : null;

  return (
    <svg aria-hidden="true" width={size} height={size} className="block">
      {gridLevels.map((level) => {
        const r = (level / 100) * maxR;
        const pts = AXES.map((_, i) => polarToCart(cx, cy, r, i, AXES.length));
        return (
          <polygon
            key={level}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#374151"
            strokeWidth={0.5}
          />
        );
      })}

      {AXES.map((_, i) => {
        const end = polarToCart(cx, cy, maxR, i, AXES.length);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
          <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#374151" strokeWidth={0.5} />
        );
      })}

      {prevPoly && (
        <polygon
          points={prevPoly}
          fill="rgba(156,163,175,0.1)"
          stroke="#9ca3af"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}

      <polygon points={currentPoly} fill="rgba(129,140,248,0.2)" stroke="#818cf8" strokeWidth={2} />

      {currentPoints.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#818cf8" />
      ))}

      {AXES.map((a, i) => {
        const labelR = maxR + 16;
        const pos = polarToCart(cx, cy, labelR, i, AXES.length);
        const val = profile[a.key];
        return (
          <text
            key={a.key}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#d1d5db"
            fontSize={10}
          >
            {a.label} ({val})
          </text>
        );
      })}
    </svg>
  );
}
