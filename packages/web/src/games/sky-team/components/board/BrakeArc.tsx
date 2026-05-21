import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { BRAKE_ARC } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

const LABELS = ["2", "3", "4", "5", "6"] as const;
const LABEL_OFFSETS_PCT = [6, 28, 50, 72, 94] as const;

/**
 * Brake-threshold arc — a quadratic-bezier U-curve (concave-up) with numbers
 * 2..6 along the band. A red marker highlights the current threshold value
 * (= brakeTrack.pos + brakeThresholdOffset).
 *
 * Matches `sky-team-lab` `.brake-arc` 1:1: path `M start Q control end`
 * (control point below the chord), stroke 38, labels via <textPath>.
 */
export default function BrakeArc({ view }: Props) {
  const pathId = useId();
  const { start, control, end, thickness } = BRAKE_ARC;

  const arcPath = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;

  const threshold = view.brakeTrack.pos + view.scenario.brakeThresholdOffset;
  const tClamped = Math.max(0, Math.min(1, (threshold - 2) / 4));
  // Sample the quadratic Bezier at t.
  const sample = (t: number) => {
    const mt = 1 - t;
    return {
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    };
  };
  const m = sample(tClamped);

  return (
    <BoardLayer name="brake-arc" z={3}>
      <defs>
        <path id={pathId} d={arcPath} fill="none" />
      </defs>
      <use
        href={`#${pathId}`}
        stroke="#15191d"
        strokeWidth={thickness}
        strokeLinecap="butt"
        fill="none"
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
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={3}
        >
          <textPath href={`#${pathId}`} startOffset={`${LABEL_OFFSETS_PCT[i]}%`}>
            {text}
          </textPath>
        </text>
      ))}
      <circle
        cx={m.x}
        cy={m.y}
        r={10}
        fill="rgb(239 68 68)"
        stroke="white"
        strokeWidth={2}
        pointerEvents="none"
      />
    </BoardLayer>
  );
}
