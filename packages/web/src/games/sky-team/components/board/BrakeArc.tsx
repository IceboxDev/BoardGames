import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardArc, BoardLayer } from "../../../../components/board";
import { BRAKE_ARC } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * Brake threshold arc 2..6. The current brake threshold (= `brakeTrack.pos +
 * brakeThresholdOffset` in the final round) is highlighted by a red marker.
 */
export default function BrakeArc({ view }: Props) {
  const threshold = view.brakeTrack.pos + view.scenario.brakeThresholdOffset;
  // Threshold runs from offset (track pos 0) → offset+3 (track pos 3). Map to 0..1 along the arc.
  const tClamped = Math.max(0, Math.min(1, (threshold - 2) / 4));

  const labels = ["2", "3", "4", "5", "6"].map((text, i) => ({ at: i / 4, text }));

  const angleDeg = BRAKE_ARC.startDeg + (BRAKE_ARC.endDeg - BRAKE_ARC.startDeg) * tClamped;
  const angleRad = (angleDeg * Math.PI) / 180;
  const markerX = BRAKE_ARC.center.x + BRAKE_ARC.radius * Math.cos(angleRad);
  const markerY = BRAKE_ARC.center.y + BRAKE_ARC.radius * Math.sin(angleRad);

  return (
    <BoardLayer name="brake-arc" z={3}>
      <BoardArc
        center={BRAKE_ARC.center}
        radius={BRAKE_ARC.radius}
        startDeg={BRAKE_ARC.startDeg}
        endDeg={BRAKE_ARC.endDeg}
        thickness={32}
        labels={labels}
        labelFontSize={18}
      />
      <circle
        cx={markerX}
        cy={markerY}
        r={10}
        fill="rgb(239 68 68)"
        stroke="white"
        strokeWidth={2}
        pointerEvents="none"
      />
    </BoardLayer>
  );
}
