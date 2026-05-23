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

// Blue play marker — solid at "between 4 and 5", outlines at the next three
// label-pairs (5-6, 6-7, 7-8).
const BLUE_MARKERS: ReadonlyArray<{ t: number; filled: boolean }> = [
  { t: 0.25, filled: true },
  { t: 0.35, filled: false },
  { t: 0.435, filled: false },
  { t: 0.51, filled: false },
];

// Orange fast-forward marker — solid at "between 8 and 9", outlines at the
// next four (9-10, 10-11, 11-12, past-12).
const ORANGE_MARKERS: ReadonlyArray<{ t: number; filled: boolean }> = [
  { t: 0.595, filled: true },
  { t: 0.685, filled: false },
  { t: 0.78, filled: false },
  { t: 0.875, filled: false },
  { t: 0.97, filled: false },
];

/**
 * Speed half-circle arc — numbers 2..12 along the band with blue play /
 * orange fast-forward markers showing speed-gauge positions. The dial-tilt
 * AXIS arc lives separately on the horizon bezel; see `AxisArc.tsx`.
 */
export default function SpeedArc(_props: Props) {
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
      {LABELS.map((text, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: speed labels are stable indexed positions
          key={`speed-${i}`}
          fill="white"
          fontSize={18}
          fontWeight={900}
          textAnchor="middle"
          dominantBaseline="central"
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={3}
        >
          <textPath href={`#${pathId}`} startOffset={`${LABEL_OFFSETS_PCT[i]}%`}>
            {text}
          </textPath>
        </text>
      ))}

      {BLUE_MARKERS.map(({ t, filled }) => {
        const { x, y, angle } = sample(t);
        return (
          <g
            key={`blue-${t}`}
            transform={`translate(${x}, ${y}) rotate(${angle})`}
            opacity={filled ? 1 : 0.35}
            style={filled ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" } : undefined}
          >
            <polygon
              points="-7,-8 -7,8 8,0"
              fill={filled ? BLUE_COLOR : "transparent"}
              stroke={BLUE_COLOR}
              strokeWidth={filled ? 1 : 1.4}
              strokeLinejoin="round"
            />
          </g>
        );
      })}

      {ORANGE_MARKERS.map(({ t, filled }) => {
        const { x, y, angle } = sample(t);
        return (
          <g
            key={`orange-${t}`}
            transform={`translate(${x}, ${y}) rotate(${angle})`}
            opacity={filled ? 1 : 0.35}
            style={filled ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" } : undefined}
          >
            <polygon
              points="-10,-7 -10,7 -2,0"
              fill={filled ? ORANGE_COLOR : "transparent"}
              stroke={ORANGE_COLOR}
              strokeWidth={filled ? 1 : 1.4}
              strokeLinejoin="round"
            />
            <polygon
              points="-2,-7 -2,7 8,0"
              fill={filled ? ORANGE_COLOR : "transparent"}
              stroke={ORANGE_COLOR}
              strokeWidth={filled ? 1 : 1.4}
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </BoardLayer>
  );
}
