import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { AXIS_ARC } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

const LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
// Same uneven offsets as sky-team-lab/index.html:124-154 — letter-width-tuned.
const LABEL_OFFSETS_PCT = [2, 11.5, 21, 32, 42, 50, 58, 68, 78, 88.5, 98] as const;

/**
 * Axis arc — shallow ellipse band overlaying the lower half of the horizon
 * dial, with numbers 2..12 along the band. A red/yellow marker dot tracks the
 * current axis position (`view.axis.position` in [-spinAt..+spinAt]).
 *
 * Matches `sky-team-lab` `.axis-arc` 1:1: elliptical path (chord ≈ 456 wide,
 * rx 228, ry 83), stroke 36, labels via <textPath>.
 */
export default function AxisArc({ view }: Props) {
  const pathId = useId();
  const { chord, rx, ry, thickness } = AXIS_ARC;

  // Path: elliptical arc from chord-left to chord-right, dipping below.
  const arcPath = `M ${chord.left.x} ${chord.left.y} A ${rx} ${ry} 0 0 0 ${chord.right.x} ${chord.right.y}`;

  // Marker: map view.axis.position (-spinAt..+spinAt) → t (0..1), then to a
  // point on the ellipse.
  const max = view.axis.spinAt;
  const tNow = (view.axis.position + max) / (max * 2);
  const tClamped = Math.max(0, Math.min(1, tNow));
  // Parametric ellipse — chord-left is at θ=π (left of ellipse), chord-right
  // at θ=0 (right). Going clockwise through bottom is θ from π → 2π (or -π → 0
  // if we go the other way). Lab path uses sweep=0, large=0, going through
  // the bottom — so t=0 at θ=π, t=1 at θ=0 (or 2π), with the parameter
  // sweeping through 3π/2 (bottom) at t=0.5.
  // Ellipse centred horizontally on the chord midpoint; chord runs across its
  // top so the arc dips downward. Parametrise with θ = t·π so t=0 is at
  // chord-left, t=0.5 is at the bottom, t=1 is at chord-right.
  const cx = (chord.left.x + chord.right.x) / 2;
  const cy = chord.left.y;
  const theta = tClamped * Math.PI;
  const markerX = cx - rx * Math.cos(theta);
  const markerY = cy + ry * Math.sin(theta);

  const isSpinning = Math.abs(view.axis.position) >= max;

  return (
    <BoardLayer name="axis-arc" z={3}>
      <defs>
        <path id={pathId} d={arcPath} fill="none" />
      </defs>
      {/* Band — thick stroke gives the visual width */}
      <use
        href={`#${pathId}`}
        stroke="#15191d"
        strokeWidth={thickness}
        strokeLinecap="butt"
        fill="none"
        style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.3))" }}
      />
      {/* Number labels along the arc */}
      {LABELS.map((text, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: axis labels are stable indexed positions
          key={`axis-${i}`}
          fill="white"
          fontSize={18}
          fontWeight={900}
          textAnchor="middle"
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={3}
        >
          <textPath href={`#${pathId}`} startOffset={`${LABEL_OFFSETS_PCT[i]}%`}>
            {text}
          </textPath>
        </text>
      ))}
      {/* Current-position marker */}
      <circle
        cx={markerX}
        cy={markerY}
        r={11}
        fill={isSpinning ? "rgb(239 68 68)" : "rgb(250 204 21)"}
        stroke="white"
        strokeWidth={2}
        pointerEvents="none"
      />
    </BoardLayer>
  );
}
