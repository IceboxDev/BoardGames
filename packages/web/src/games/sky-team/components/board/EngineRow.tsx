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
 * The two engine tiles flanking the centre, with a "+" axis marker between.
 * Tiles render as HTML overlays; the "+" stays in SVG.
 *
 * Note: this component is split — its `<text>` lives in `<BoardSurface>`
 * children (SVG), but the tile overlays must come through `overlays`. Use
 * `<EngineRow.SvgMarker />` for the SVG bit and `<EngineRow />` for the tile
 * overlays.
 */
export default function EngineRow({ view, canPlace, onSelect }: Props) {
  return (
    <>
      <CockpitSlot
        view={view}
        slot="pilot-engine"
        label="Engine"
        canPlace={canPlace}
        onSelect={onSelect}
      />
      <CockpitSlot
        view={view}
        slot="copilot-engine"
        label="Engine"
        canPlace={canPlace}
        onSelect={onSelect}
      />
    </>
  );
}

/** The "+" marker between the two engine tiles. Rendered in SVG (centre cluster). */
export function EngineAxisMarker() {
  return (
    <BoardLayer name="engine-axis-marker" z={2}>
      <text
        x={ENGINE_ROW_AXIS_MARKER.x}
        y={ENGINE_ROW_AXIS_MARKER.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={36}
        fontWeight={900}
        fill="rgb(255 255 255 / 0.85)"
        style={{ textShadow: "0 2px 2px rgba(0,0,0,0.35)" }}
        pointerEvents="none"
      >
        +
      </text>
    </BoardLayer>
  );
}
