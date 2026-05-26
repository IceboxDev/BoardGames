import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { SPEED_ARC } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

const LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
// Labels shifted left vs the lab — last position at 92% (was 98) so the
// orange "after 12" marker has room past it.
const LABEL_OFFSETS_PCT = [2, 11, 20, 30, 40, 47, 55, 64, 73, 83, 92] as const;

const BLUE_COLOR = "#3b82f6";
const ORANGE_COLOR = "#f97316";
const SUM_COLOR = "#facc15"; // yellow-400

// Blue play-arrow positions (4 slots). Each entry's `t` is between adjacent
// label pairs (4-5, 5-6, 6-7, 7-8). Index 0 corresponds to bluePos=4 (the
// scenario start), each landing-gear placement advances bluePos by 1 and
// shifts the solid marker one entry to the right.
const BLUE_MARKER_TS = [0.25, 0.35, 0.435, 0.51] as const;
const BLUE_POS_BASE = 4;

// Orange fast-forward positions (5 slots). Pairs 8-9, 9-10, 10-11, 11-12,
// "past 12". Each flaps placement advances orangePos by 1.
const ORANGE_MARKER_TS = [0.595, 0.685, 0.78, 0.875, 0.97] as const;
const ORANGE_POS_BASE = 8;

/**
 * Speed half-circle arc — numbers 2..12 along the band with blue play /
 * orange fast-forward markers showing the current advance thresholds. The
 * solid marker = current threshold (the lowest speed that actually moves
 * the plane); outlined markers = future thresholds you could shift to by
 * placing more landing-gear / flaps dice.
 *
 * When BOTH engine dice are placed, the label at `pilot + copilot` is
 * highlighted (yellow) so the resolved speed is unambiguous against the
 * blue/orange threshold markers — at a glance the player can see if the
 * sum sits below, between, or above the markers.
 */
export default function SpeedArc({ view }: Props) {
  const pathId = useId();
  const { chord, rx, ry, thickness } = SPEED_ARC;
  const cx = (chord.left.x + chord.right.x) / 2;
  const cy = chord.left.y;
  const arcPath = `M ${chord.left.x} ${chord.left.y} A ${rx} ${ry} 0 0 0 ${chord.right.x} ${chord.right.y}`;

  // Closed band path with rounded corners (linejoin=round).
  const halfT = thickness / 2;
  const outerR = rx + halfT;
  const innerR = rx - halfT;
  const outerLeft = { x: cx - outerR, y: cy };
  const outerRight = { x: cx + outerR, y: cy };
  const innerLeft = { x: cx - innerR, y: cy };
  const innerRight = { x: cx + innerR, y: cy };
  const bandPath =
    `M ${outerLeft.x} ${outerLeft.y}` +
    ` A ${outerR} ${outerR} 0 0 0 ${outerRight.x} ${outerRight.y}` +
    ` L ${innerRight.x} ${innerRight.y}` +
    ` A ${innerR} ${innerR} 0 0 1 ${innerLeft.x} ${innerLeft.y}` +
    " Z";

  // Sample point + tangent angle on the half-circle.
  const sample = (t: number) => {
    const phi = t * Math.PI;
    const x = cx - rx * Math.cos(phi);
    const y = cy + ry * Math.sin(phi);
    const dx = rx * Math.sin(phi);
    const dy = ry * Math.cos(phi);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { x, y, angle };
  };

  const blueActiveIdx = view.speedGauge.bluePos - BLUE_POS_BASE;
  const orangeActiveIdx = view.speedGauge.orangePos - ORANGE_POS_BASE;

  const pilotEngine = view.slots["pilot-engine"]?.die?.value ?? null;
  const copilotEngine = view.slots["copilot-engine"]?.die?.value ?? null;
  // Show the intermediate sum the moment a single engine die is committed —
  // a one-die value previews the running total against the blue/orange
  // thresholds before the second die lands. On the FINAL APPROACH the
  // brake arc owns this highlight instead (`BrakeArc` lights up the same
  // sum against the brake threshold), so we skip it here.
  const engineSum = view.isFinalRound
    ? null
    : pilotEngine != null && copilotEngine != null
      ? pilotEngine + copilotEngine
      : pilotEngine != null
        ? pilotEngine
        : copilotEngine != null
          ? copilotEngine
          : null;

  return (
    <BoardLayer name="speed-arc" z={3}>
      <defs>
        <path id={pathId} d={arcPath} fill="none" />
      </defs>
      <path
        d={bandPath}
        fill="#15191d"
        stroke="#15191d"
        strokeWidth={12}
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.3))" }}
      />
      {LABELS.map((text, i) => {
        const labelNumber = Number.parseInt(text, 10);
        const isSum = engineSum != null && labelNumber === engineSum;
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: speed labels are stable indexed positions
            key={`speed-${i}`}
            fill={isSum ? SUM_COLOR : "white"}
            fontSize={isSum ? 22 : 18}
            fontWeight={900}
            textAnchor="middle"
            dominantBaseline="central"
            paintOrder="stroke"
            stroke={isSum ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)"}
            strokeWidth={isSum ? 4 : 3}
            style={isSum ? { filter: "drop-shadow(0 0 4px rgba(250, 204, 21, 0.75))" } : undefined}
          >
            <textPath href={`#${pathId}`} startOffset={`${LABEL_OFFSETS_PCT[i]}%`}>
              {text}
            </textPath>
          </text>
        );
      })}

      {BLUE_MARKER_TS.map((t, idx) => {
        const isCurrent = idx === blueActiveIdx;
        const isPast = idx < blueActiveIdx;
        if (isPast) return null; // hide passed positions
        const { x, y, angle } = sample(t);
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: marker order is stable
            key={`blue-${idx}`}
            transform={`translate(${x}, ${y}) rotate(${angle})`}
            opacity={isCurrent ? 1 : 0.35}
            style={isCurrent ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" } : undefined}
          >
            <polygon
              points="-7,-8 -7,8 8,0"
              fill={isCurrent ? BLUE_COLOR : "transparent"}
              stroke={BLUE_COLOR}
              strokeWidth={isCurrent ? 1 : 1.4}
              strokeLinejoin="round"
            />
          </g>
        );
      })}

      {ORANGE_MARKER_TS.map((t, idx) => {
        const isCurrent = idx === orangeActiveIdx;
        const isPast = idx < orangeActiveIdx;
        if (isPast) return null;
        const { x, y, angle } = sample(t);
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: marker order is stable
            key={`orange-${idx}`}
            transform={`translate(${x}, ${y}) rotate(${angle})`}
            opacity={isCurrent ? 1 : 0.35}
            style={isCurrent ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" } : undefined}
          >
            <polygon
              points="-10,-7 -10,7 -2,0"
              fill={isCurrent ? ORANGE_COLOR : "transparent"}
              stroke={ORANGE_COLOR}
              strokeWidth={isCurrent ? 1 : 1.4}
              strokeLinejoin="round"
            />
            <polygon
              points="-2,-7 -2,7 8,0"
              fill={isCurrent ? ORANGE_COLOR : "transparent"}
              stroke={ORANGE_COLOR}
              strokeWidth={isCurrent ? 1 : 1.4}
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </BoardLayer>
  );
}
