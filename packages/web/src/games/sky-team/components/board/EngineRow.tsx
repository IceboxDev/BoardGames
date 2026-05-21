import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
import CockpitSlot from "./CockpitSlot";
import { ENGINE_ROW_AXIS_MARKER } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

/**
 * The two engine slots flanking the centre, with a "+" axis marker between
 * them indicating where pilot/copilot engine values combine into speed.
 */
export default function EngineRow({ view, canPlace, onSelect }: Props) {
  return (
    <BoardLayer name="engine-row" z={5}>
      <CockpitSlot
        view={view}
        slot="pilot-engine"
        label="Engine"
        canPlace={canPlace}
        onSelect={onSelect}
      />
      <text
        x={ENGINE_ROW_AXIS_MARKER.x}
        y={ENGINE_ROW_AXIS_MARKER.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={32}
        fontWeight={900}
        fill="rgb(255 255 255 / 0.85)"
        pointerEvents="none"
      >
        +
      </text>
      <CockpitSlot
        view={view}
        slot="copilot-engine"
        label="Engine"
        canPlace={canPlace}
        onSelect={onSelect}
      />
    </BoardLayer>
  );
}
