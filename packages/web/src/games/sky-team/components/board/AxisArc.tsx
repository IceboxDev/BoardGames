import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardArc, BoardLayer } from "../../../../components/board";
import { AXIS_ARC } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * The 2..12 axis arc wrapping the lower half of the artificial-horizon dial.
 * Labels follow the arc via SVG <textPath>. A red marker dot highlights the
 * current axis position (`view.axis.position` is in range -spinAt..+spinAt;
 * we map it linearly onto the arc).
 */
export default function AxisArc({ view }: Props) {
  const max = view.axis.spinAt;
  // Map -max..+max → 0..1 (arc start = -max, arc end = +max)
  const tNow = (view.axis.position + max) / (max * 2);
  const tClamped = Math.max(0, Math.min(1, tNow));

  // The labels 2..12 form 11 evenly-spaced ticks along the arc.
  const labels = Array.from({ length: 11 }, (_, i) => ({
    at: i / 10,
    text: String(i + 2),
  }));

  // Marker position on the arc (centre angle interpolated start→end).
  const angleDeg = AXIS_ARC.startDeg + (AXIS_ARC.endDeg - AXIS_ARC.startDeg) * tClamped;
  const angleRad = (angleDeg * Math.PI) / 180;
  const markerX = AXIS_ARC.center.x + AXIS_ARC.radius * Math.cos(angleRad);
  const markerY = AXIS_ARC.center.y + AXIS_ARC.radius * Math.sin(angleRad);

  const isSpinning = Math.abs(view.axis.position) >= max;

  return (
    <BoardLayer name="axis-arc" z={3}>
      <BoardArc
        center={AXIS_ARC.center}
        radius={AXIS_ARC.radius}
        startDeg={AXIS_ARC.startDeg}
        endDeg={AXIS_ARC.endDeg}
        thickness={32}
        labels={labels}
        labelFontSize={18}
      />
      {/* Current axis marker */}
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
