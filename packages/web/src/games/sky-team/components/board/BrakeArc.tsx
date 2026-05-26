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
const SUM_OK_COLOR = "#facc15"; // yellow-400
const SUM_FAIL_COLOR = "#ef4444"; // red-500

/**
 * Stop-icon positions along the brake arc. The four positions correspond to
 * `brakeTrack.pos` 0 → 3 (each placed brake die bumps `pos` by 1). Position 0
 * is the scenario default; positions 1, 2, 3 are reached by placing one,
 * two, or all three brake dice in the `brakes-2 / 4 / 6` row. The current
 * pos renders solid red; future positions render outlined.
 */
const STOP_MARKER_TS = [0.05, 0.23, 0.59, 0.95] as const;

/**
 * Brake-threshold arc — black band with numbers 2..6 and a row of red stop
 * markers. Just like the speed arc's blue / orange play markers, the solid
 * brake marker shifts whenever a brake die is placed on the `brakes-2/4/6`
 * row (engine sets `brakeTrack.pos += 1`).
 *
 * On the FINAL APPROACH (altitude 0), the `pilot+copilot` engine sum is
 * highlighted on this arc instead of the speed arc — the brake threshold is
 * the only thing that matters for landing, and "failing to brake" (sum ≥
 * threshold) overruns the runway. The highlight shows yellow when the sum
 * stays below the threshold and red when it would overrun, so the players
 * see the result of their placement immediately.
 */
export default function BrakeArc({ view }: Props) {
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

  const brakeActiveIdx = view.brakeTrack.pos;
  const brakeThreshold = view.brakeTrack.pos + view.scenario.brakeThresholdOffset;

  const pilotEngine = view.slots["pilot-engine"]?.die?.value ?? null;
  const copilotEngine = view.slots["copilot-engine"]?.die?.value ?? null;
  // Same "intermediate sum" semantics as the speed arc: light up the running
  // total even when only one engine die has been committed so the team can
  // gauge the next placement against the brake threshold.
  const engineSum =
    pilotEngine != null && copilotEngine != null
      ? pilotEngine + copilotEngine
      : pilotEngine != null
        ? pilotEngine
        : copilotEngine != null
          ? copilotEngine
          : null;
  const showSumHighlight = view.isFinalRound && engineSum != null;
  const sumOverruns = engineSum != null && engineSum >= brakeThreshold;

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
      {LABELS.map((text, i) => {
        const labelNumber = Number.parseInt(text, 10);
        const isSum = showSumHighlight && engineSum === labelNumber;
        const sumColor = sumOverruns ? SUM_FAIL_COLOR : SUM_OK_COLOR;
        return (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: brake labels are stable indexed positions
            key={`brake-${i}`}
            fill={isSum ? sumColor : "white"}
            fontSize={isSum ? 24 : 20}
            fontWeight={900}
            textAnchor="middle"
            dominantBaseline="central"
            paintOrder="stroke"
            stroke={isSum ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.6)"}
            strokeWidth={isSum ? 4 : 3}
            style={
              isSum
                ? {
                    filter: `drop-shadow(0 0 5px ${
                      sumOverruns ? "rgba(239, 68, 68, 0.85)" : "rgba(250, 204, 21, 0.85)"
                    })`,
                  }
                : undefined
            }
          >
            <textPath href={`#${pathId}`} startOffset={`${LABEL_OFFSETS_PCT[i]}%`}>
              {text}
            </textPath>
          </text>
        );
      })}
      {STOP_MARKER_TS.map((t, idx) => {
        const isCurrent = idx === brakeActiveIdx;
        const isPast = idx < brakeActiveIdx;
        if (isPast) return null;
        const { x, y, angle } = sample(t);
        return (
          <g
            // biome-ignore lint/suspicious/noArrayIndexKey: stable indexed brake marker positions
            key={`stop-${idx}`}
            transform={`translate(${x}, ${y}) rotate(${angle})`}
            opacity={isCurrent ? 1 : 0.35}
            style={isCurrent ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" } : undefined}
          >
            <rect
              x={-6}
              y={-6}
              width={12}
              height={12}
              rx={2}
              ry={2}
              fill={isCurrent ? STOP_COLOR : "transparent"}
              stroke={STOP_COLOR}
              strokeWidth={isCurrent ? 1 : 1.6}
            />
          </g>
        );
      })}
    </BoardLayer>
  );
}
