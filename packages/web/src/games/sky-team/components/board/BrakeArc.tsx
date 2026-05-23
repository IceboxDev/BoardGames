import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { BRAKE_ARC } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

const LABELS = ["2", "3", "4", "5", "6"] as const;
const LABEL_OFFSETS_PCT = [14, 32, 50, 68, 86] as const;

const STOP_COLOR = "#ef4444"; // red-500

/**
 * Stop-icon positions along the brake arc (parameter t ≈ path-offset for our
 * shallow curve). Solid square = current threshold; outlines = future spots.
 *  - t=0.05  : left of label "2"
 *  - t=0.23  : between 2 and 3
 *  - t=0.59  : between 4 and 5
 *  - t=0.95  : right of label "6"
 */
const STOP_MARKERS: ReadonlyArray<{ t: number; filled: boolean }> = [
  { t: 0.05, filled: true },
  { t: 0.23, filled: false },
  { t: 0.59, filled: false },
  { t: 0.95, filled: false },
];

/**
 * Brake-threshold arc — black band with numbers 2..6 and a row of red stop
 * markers. The single solid marker is the current threshold; the outlined
 * ones are the future positions, dimmed for contrast. Each marker rotates
 * to follow the curve's tangent direction.
 */
export default function BrakeArc(_props: Props) {
  const pathId = useId();
  const { start, control, end, thickness } = BRAKE_ARC;

  // Hidden centerline path — kept for <textPath> label positioning.
  const arcPath = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;

  // Closed band path with rounded corners. Offsets the start/end perpendicular
  // to the local tangent and the control along the vertical (a good
  // approximation for our shallow curve). The four corners get chamfered by
  // `stroke-linejoin="round"` on a same-colour stroke; the ends stay flat.
  const halfT = thickness / 2;
  // Tangent at start = (control - start) direction; outward normal is the
  // 90°-CW rotation in screen y-down — pointing toward the curve apex below.
  const tSx = control.x - start.x;
  const tSy = control.y - start.y;
  const mS = Math.sqrt(tSx * tSx + tSy * tSy);
  const nSx = -tSy / mS;
  const nSy = tSx / mS;
  // Tangent at end = (end - control) direction; outward normal same convention.
  const tEx = end.x - control.x;
  const tEy = end.y - control.y;
  const mE = Math.sqrt(tEx * tEx + tEy * tEy);
  const nEx = -tEy / mE;
  const nEy = tEx / mE;
  // At the control point the tangent is parallel to (end-start) which is
  // horizontal for our brake arc, so outward normal is straight down.
  const outerStart = { x: start.x + halfT * nSx, y: start.y + halfT * nSy };
  const innerStart = { x: start.x - halfT * nSx, y: start.y - halfT * nSy };
  const outerEnd = { x: end.x + halfT * nEx, y: end.y + halfT * nEy };
  const innerEnd = { x: end.x - halfT * nEx, y: end.y - halfT * nEy };
  const outerControl = { x: control.x, y: control.y + halfT };
  const innerControl = { x: control.x, y: control.y - halfT };
  const bandPath =
    `M ${outerStart.x} ${outerStart.y}` +
    ` Q ${outerControl.x} ${outerControl.y} ${outerEnd.x} ${outerEnd.y}` +
    ` L ${innerEnd.x} ${innerEnd.y}` +
    ` Q ${innerControl.x} ${innerControl.y} ${innerStart.x} ${innerStart.y}` +
    " Z";

  // Sample the quadratic Bezier at parameter t — point + tangent angle.
  // dP/dt = 2(1-t)(control-start) + 2t(end-control).
  const sample = (t: number) => {
    const mt = 1 - t;
    const x = mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x;
    const y = mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y;
    const dx = 2 * mt * (control.x - start.x) + 2 * t * (end.x - control.x);
    const dy = 2 * mt * (control.y - start.y) + 2 * t * (end.y - control.y);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { x, y, angle };
  };

  return (
    <BoardLayer name="brake-arc" z={3}>
      <defs>
        <path id={pathId} d={arcPath} fill="none" />
      </defs>
      <path
        d={bandPath}
        fill="#15191d"
        stroke="#15191d"
        strokeWidth={12}
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.28))" }}
      />
      {LABELS.map((text, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: brake labels are stable indexed positions
          key={`brake-${i}`}
          fill="white"
          fontSize={20}
          fontWeight={900}
          textAnchor="middle"
          dominantBaseline="central"
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={3}
        >
          <textPath href={`#${pathId}`} startOffset={`${LABEL_OFFSETS_PCT[i]}%`}>
            {text}
          </textPath>
        </text>
      ))}
      {STOP_MARKERS.map(({ t, filled }, i) => {
        const { x, y, angle } = sample(t);
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: stable indexed brake marker positions
            key={`stop-${i}`}
            transform={`translate(${x}, ${y}) rotate(${angle})`}
            opacity={filled ? 1 : 0.35}
            style={filled ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" } : undefined}
          >
            <rect
              x={-6}
              y={-6}
              width={12}
              height={12}
              rx={2}
              ry={2}
              fill={filled ? STOP_COLOR : "transparent"}
              stroke={STOP_COLOR}
              strokeWidth={filled ? 1 : 1.6}
            />
          </g>
        );
      })}
    </BoardLayer>
  );
}
