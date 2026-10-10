import type { MoveGrade } from "@boardgames/core/games/connect-4/solver/analysis";
import { type PointerEvent, useId, useState } from "react";
import { MicroLabel } from "../../../../components/ui";
import type { PlyPoint } from "../../logic/analysis-model";
import { DISC_COLORS, seatInk } from "../board/palette";
import { GRADES } from "./grades";

const W = 600;
const H = 120;
/** Room above and below the strongest win so the line never touches the edge. */
const PAD = 10;

interface Props {
  points: readonly PlyPoint[];
  grades: Readonly<Record<number, MoveGrade>>;
  ply: number;
  onSelect: (ply: number) => void;
  /** One line about a ply, for the readout ("Move 7 · Red column 2 · now ="). */
  describe: (ply: number) => string;
}

const x = (ply: number, n: number) => (n === 0 ? 0 : (ply / n) * W);
const y = (value: number) => H / 2 - value * (H / 2 - PAD);

/** The line through known points as a step chart (a position holds until the next move); unknown breaks it. */
function stepPath(points: readonly PlyPoint[]): string {
  const n = points.length - 1;
  let d = "";
  let drawing = false;
  for (const p of points) {
    if (p.value === null) {
      drawing = false;
      continue;
    }
    const px = x(p.ply, n).toFixed(1);
    const py = y(p.value).toFixed(1);
    d += drawing ? `H${px}V${py}` : `M${px} ${py}`;
    drawing = true;
  }
  return d;
}

/** The same, closed down to the draw line, for the shaded areas. */
function areaPath(points: readonly PlyPoint[]): string {
  const n = points.length - 1;
  let d = "";
  let run: PlyPoint[] = [];
  const close = () => {
    if (run.length === 0) return;
    const last = run[run.length - 1];
    d += `M${x(run[0].ply, n).toFixed(1)} ${H / 2}`;
    for (const [i, p] of run.entries()) {
      const py = y(p.value ?? 0).toFixed(1);
      d += i === 0 ? `V${py}` : `H${x(p.ply, n).toFixed(1)}V${py}`;
    }
    // A lone point still gets a sliver, to the next ply.
    const end = run.length === 1 ? Math.min(n, last.ply + 1) : last.ply;
    d += `H${x(end, n).toFixed(1)}V${H / 2}Z`;
    run = [];
  };
  for (const p of points) {
    if (p.value === null) close();
    else run.push(p);
  }
  close();
  return d;
}

/**
 * Who was winning, move by move: Red's wins above the line, Yellow's below,
 * a draw on it; the further out, the sooner the win. Glowing marks are the
 * slips. Click or drag to jump; arrow keys step.
 */
export function OutcomeGraph({ points, grades, ply, onSelect, describe }: Props) {
  const n = points.length - 1;
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const area = areaPath(points);
  const plyAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n, Math.round(((e.clientX - box.left) / box.width) * n)));
  };
  const slips = Object.values(grades).filter(
    (g) => g.grade === "inaccuracy" || g.grade === "mistake" || g.grade === "blunder",
  );
  const cursor = points[ply]?.value;

  return (
    <section className="flex flex-col gap-2" aria-label="Advantage">
      <div className="flex items-baseline justify-between gap-3">
        <MicroLabel>Advantage</MicroLabel>
        <span className="min-w-0 truncate font-mono text-2xs text-fg-muted">
          {describe(hover ?? ply)}
        </span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Who was winning, move by move — arrow keys step through the game"
        aria-valuemin={0}
        aria-valuemax={n}
        aria-valuenow={ply}
        aria-valuetext={describe(ply)}
        className="group relative h-28 w-full cursor-crosshair touch-none rounded-ui-md focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-400/60"
        onKeyDown={(e) => {
          const by = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
          if (e.key === "Home") onSelect(0);
          else if (e.key === "End") onSelect(n);
          else if (by !== 0) onSelect(Math.max(0, Math.min(n, ply + by)));
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onSelect(plyAt(e));
        }}
        onPointerMove={(e) => {
          setHover(plyAt(e));
          if (e.buttons === 1) onSelect(plyAt(e));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`${id}-red`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={DISC_COLORS[0].fill} stopOpacity={0.55} />
              <stop offset="0.5" stopColor={DISC_COLORS[0].fill} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id={`${id}-yellow`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.5" stopColor={DISC_COLORS[1].fill} stopOpacity={0.04} />
              <stop offset="1" stopColor={DISC_COLORS[1].fill} stopOpacity={0.5} />
            </linearGradient>
            <clipPath id={`${id}-top`}>
              <rect x={0} y={0} width={W} height={H / 2} />
            </clipPath>
            <clipPath id={`${id}-bottom`}>
              <rect x={0} y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          {/* Faint guides: the edges of each side's half. */}
          {[PAD, H - PAD].map((gy) => (
            <line
              key={gy}
              x1={0}
              y1={gy}
              x2={W}
              y2={gy}
              className="stroke-line-soft"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${id}-red)`} clipPath={`url(#${id}-top)`} />
          <path d={area} fill={`url(#${id}-yellow)`} clipPath={`url(#${id}-bottom)`} />
          <line
            x1={0}
            y1={H / 2}
            x2={W}
            y2={H / 2}
            className="stroke-line-strong"
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={stepPath(points)}
            className="fill-none stroke-fg-strong"
            strokeOpacity={0.75}
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
          {hover !== null && hover !== ply && (
            <line
              x1={x(hover, n)}
              y1={0}
              x2={x(hover, n)}
              y2={H}
              className="stroke-fg-muted"
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <line
            x1={x(ply, n)}
            y1={0}
            x2={x(ply, n)}
            y2={H}
            className="stroke-accent-400"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Marks as HTML, so they stay round however the graph is stretched. */}
        {slips.map((g) => {
          const value = points[g.index + 1]?.value;
          if (value === null || value === undefined) return null;
          const fill = GRADES[g.grade].fill;
          return (
            <span
              key={g.index}
              aria-hidden
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${(x(g.index + 1, n) / W) * 100}%`,
                top: `${(y(value) / H) * 100}%`,
                background: fill,
                boxShadow: `0 0 0 2px var(--color-surface-950), 0 0 10px ${fill}`,
              }}
            />
          );
        })}
        {cursor !== null && cursor !== undefined && (
          <span
            aria-hidden
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-300 ring-2 ring-surface-950"
            style={{ left: `${(x(ply, n) / W) * 100}%`, top: `${(y(cursor) / H) * 100}%` }}
          />
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 left-1.5 text-2xs font-medium uppercase tracking-label opacity-70"
          style={{ color: seatInk(0) }}
        >
          Red
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1.5 text-2xs font-medium uppercase tracking-label opacity-70"
          style={{ color: seatInk(1) }}
        >
          Yellow
        </span>
      </div>
    </section>
  );
}
