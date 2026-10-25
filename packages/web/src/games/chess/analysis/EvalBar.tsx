import type { Color } from "@boardgames/core/games/chess/engine/types";
import { formatScore, type Score, winPercent } from "./grade";

const WHITE_FILL = "#f4f1ea";
const BLACK_FILL = "#2b2724";

/**
 * The evaluation bar beside the board: White's share fills from White's side
 * (the bottom when White is at the bottom).
 */
export function EvalBar({
  score,
  orientation,
  height,
}: {
  score: Score | null;
  orientation: Color;
  height: number;
}) {
  const white = score ? winPercent(score) : 50;
  const whiteAtBottom = orientation === "w";
  const text = score ? formatScore(score) : "…";
  return (
    // biome-ignore lint/a11y/useSemanticElements: a drawn two-colour bar; <meter> can't be styled like this.
    <div
      className="relative w-6 shrink-0 overflow-hidden rounded-ui-md ring-1 ring-line"
      style={{ height, background: BLACK_FILL }}
      role="meter"
      aria-label={`Evaluation ${text}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(white)}
    >
      <div
        className="absolute inset-x-0 transition-[height] duration-300"
        style={{
          height: `${white}%`,
          background: WHITE_FILL,
          [whiteAtBottom ? "bottom" : "top"]: 0,
        }}
      />
      <span
        className="absolute inset-x-0 text-center text-xs font-bold"
        style={{
          [white >= 50 === whiteAtBottom ? "bottom" : "top"]: 4,
          color: white >= 50 ? BLACK_FILL : WHITE_FILL,
          writingMode: "vertical-rl",
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** A mark on the graph: a graded move, in its grade's colour. */
export interface GraphTick {
  /** The position the move made. */
  readonly ply: number;
  readonly color: string;
}

/**
 * White's win chance across the game; click or drag to go to a move. Graded
 * moves are dotted on the line; positions not analysed yet sit on the
 * middle line.
 */
export function EvalGraph({
  scores,
  current,
  onSelect,
  ticks = [],
  onHover,
}: {
  scores: readonly (Score | undefined)[];
  current: number;
  onSelect: (ply: number) => void;
  ticks?: readonly GraphTick[];
  /** The position under the pointer, `null` when it leaves. */
  onHover?: (ply: number | null) => void;
}) {
  const n = scores.length;
  if (n < 2) return null;
  const W = 400;
  const H = 80;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (s: Score | undefined) => H - ((s ? winPercent(s) : 50) / 100) * H;
  const points = scores.map((s, i) => `${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(" ");
  const plyAt = (e: { clientX: number; currentTarget: SVGSVGElement }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ply = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
    return Math.max(0, Math.min(n - 1, ply));
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-20 w-full cursor-pointer touch-none rounded-ui-md bg-fill"
      role="img"
      aria-label="Evaluation over the game"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onSelect(plyAt(e));
      }}
      onPointerMove={(e) => {
        const ply = plyAt(e);
        onHover?.(ply);
        if (e.buttons === 1) onSelect(ply);
      }}
      onPointerLeave={() => onHover?.(null)}
    >
      <polygon points={`0,${H} ${points} ${W},${H}`} fill={WHITE_FILL} fillOpacity={0.85} />
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="currentColor" strokeOpacity={0.25} />
      {ticks.map((t) => (
        <circle
          key={t.ply}
          cx={x(t.ply)}
          cy={y(scores[t.ply])}
          r={3.5}
          fill={t.color}
          stroke={BLACK_FILL}
          strokeWidth={1}
        />
      ))}
      <line
        x1={x(current)}
        y1={0}
        x2={x(current)}
        y2={H}
        stroke="rgb(250 204 21)"
        strokeWidth={2}
      />
    </svg>
  );
}
