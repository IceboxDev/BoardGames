import { cn } from "../../../../lib/cn";
import type { RaceSeries } from "../../logic/review";
import type { CoverTone } from "../WordGrid";

// The race: agents each side still has to find after every turn, one stepped
// line per side falling to the finish line at 0 — so the first team's extra
// agent shows as the head start it costs. The shown turn's column is lit; it
// stretches to its row (strokes keep their width); clicking a column shows
// that turn.

const STROKE: Record<CoverTone, string> = {
  red: "stroke-cn-red",
  blue: "stroke-cn-blue",
  tan: "stroke-cn-tan",
  ink: "stroke-fg-strong",
  green: "stroke-cn-green",
};

const FILL: Record<CoverTone, string> = {
  red: "fill-cn-red",
  blue: "fill-cn-blue",
  tan: "fill-cn-tan",
  ink: "fill-fg-strong",
  green: "fill-cn-green",
};

const W = 600;
const H = 64;
const PAD = { t: 6, b: 10 };

export function RaceChart({
  series,
  turnTones,
  shown,
  onShow,
}: {
  series: readonly RaceSeries[];
  /** Each turn's side colour, for the column ticks. */
  turnTones: readonly CoverTone[];
  shown: number | null;
  onShow: (turn: number) => void;
}) {
  const turns = Math.max(1, turnTones.length);
  const top = Math.max(1, ...series.map((s) => s.total));
  const colW = W / turns;
  const x = (i: number) => i * colW;
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-16 min-w-0 flex-1"
      role="img"
      aria-label={series
        .map((s) => `${s.label}: ${s.points.at(-1)} of ${s.total} left to find`)
        .join(", ")}
    >
      {shown !== null && (
        <rect x={x(shown)} y={0} width={colW} height={H} className="fill-fg-strong/10" />
      )}
      {/* The finish line: no agents left to find. */}
      <line
        x1={0}
        x2={W}
        y1={y(0)}
        y2={y(0)}
        className="stroke-fg-muted opacity-50"
        strokeDasharray="3 4"
        vectorEffect="non-scaling-stroke"
      />
      {series.map((s) => {
        // Each turn's result lands at the end of its column.
        const d = s.points.map((v, i) => (i === 0 ? `M0,${y(v)}` : `H${x(i)} V${y(v)}`)).join(" ");
        return (
          <path
            key={s.label}
            d={d}
            fill="none"
            className={STROKE[s.tone]}
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {turnTones.map((tone, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one column per turn, in order
        <g key={`turn-${i}`}>
          <rect
            x={x(i) + colW * 0.3}
            y={H - 4}
            width={colW * 0.4}
            height={3}
            className={cn(FILL[tone], shown === i ? "opacity-100" : "opacity-40")}
          />
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the turn list beside the chart is the keyboard path */}
          <rect
            x={x(i)}
            y={0}
            width={colW}
            height={H}
            fill="transparent"
            className="cursor-pointer"
            onClick={() => onShow(i)}
          />
        </g>
      ))}
    </svg>
  );
}
