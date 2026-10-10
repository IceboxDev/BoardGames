import type { GoReviewAnalysis } from "@boardgames/core/protocol";

const W = 600;
const H = 120;

interface Props {
  readonly analysis: GoReviewAnalysis;
  /** Moves played in the position shown (0 = start). */
  readonly at: number;
  readonly onSelect: (moves: number) => void;
  /** The colour that played each move (index = move − 1): handicap games start with White. */
  readonly movers: readonly (0 | 1)[];
}

/**
 * Black's win chance across the game, 50% in the middle. Big mistakes are
 * dots; clicking anywhere jumps the board to that move.
 */
export default function AnalysisGraph({ analysis, at, onSelect, movers }: Props) {
  const n = analysis.moves.length;
  const x = (i: number) => (n === 0 ? 0 : (i / n) * W);
  const y = (winrate: number) => H - winrate * H;
  const points = [analysis.start.winrate, ...analysis.moves.map((m) => m.winrate)];
  const line = points
    .map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(w).toFixed(1)}`)
    .join("");
  const area = `${line}L${W} ${H}L0 ${H}Z`;
  const mistakes = analysis.moves.filter((m) => m.loss >= 3);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Black's win chance by move — arrow keys step through the game"
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={at}
      className="h-28 w-full cursor-pointer overflow-hidden rounded-ui-md bg-fill-soft"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onSelect(Math.max(0, at - 1));
        else if (e.key === "ArrowRight") onSelect(Math.min(n, at + 1));
      }}
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        onSelect(Math.round(((e.clientX - box.left) / box.width) * n));
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden="true"
      >
        <path d={area} className="fill-fg-strong/15" />
        <line
          x1={0}
          y1={H / 2}
          x2={W}
          y2={H / 2}
          className="stroke-line-strong"
          strokeDasharray="4 4"
        />
        <path
          d={line}
          className="fill-none stroke-fg-strong"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {mistakes.map((m) => (
          <circle
            key={m.move}
            cx={x(m.move)}
            cy={y(m.winrate)}
            r={3}
            className={movers[m.move - 1] === 0 ? "fill-amber-400" : "fill-sky-400"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line
          x1={x(at)}
          y1={0}
          x2={x(at)}
          y2={H}
          className="stroke-accent-400"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
