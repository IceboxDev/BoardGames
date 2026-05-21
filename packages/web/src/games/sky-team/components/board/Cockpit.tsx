import {
  BASE_SLOT_DEFS,
  BRAKES_ORDER,
  FLAPS_ORDER,
} from "@boardgames/core/games/sky-team/scenarios";
import type { PlayerIndex, SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardSurface } from "../../../../components/board";
import ArtificialHorizon from "./ArtificialHorizon";
import AxisArc from "./AxisArc";
import { BottomPanelChrome, ConcentrationSlots } from "./BottomPanel";
import BrakeArc from "./BrakeArc";
import BrakeRow from "./BrakeRow";
import ChainArrows from "./ChainArrows";
import "./cockpit.css";
import CockpitBackground from "./CockpitBackground";
import EngineRow, { EngineAxisMarker } from "./EngineRow";
import FlapsStrip from "./FlapsStrip";
import { COCKPIT_VIEWBOX } from "./geometry";
import InstrumentSlots from "./InstrumentSlots";
import LandingGearStrip from "./LandingGearStrip";
import TopHud from "./TopHud";

interface Props {
  view: SkyTeamPlayerView;
  selectedDieId: number | null;
  coffeeAdjust: number;
  onSelectSlot: (slot: SlotId) => void;
}

/**
 * Sky Team cockpit. Composes the SVG decorative layers (background, horizon,
 * arcs, approach, speed gauge) underneath a fan of HTML overlay tiles that
 * carry the lab's chrome (gradients, sliders, mugs, coffee cups).
 */
export default function Cockpit({ view, selectedDieId, coffeeAdjust, onSelectSlot }: Props) {
  const canPlace = (slot: SlotId): boolean => {
    if (selectedDieId == null) return false;
    if (view.phase !== "placement") return false;
    if (view.toPlace !== view.viewerIndex) return false;
    const def = BASE_SLOT_DEFS[slot];
    const myIdx = view.viewerIndex as PlayerIndex;
    if (def.eligibility === "pilot" && myIdx !== 0) return false;
    if (def.eligibility === "copilot" && myIdx !== 1) return false;
    if (view.slots[slot].die != null) return false;
    if (def.ordered) {
      const chain = FLAPS_ORDER.includes(slot) ? FLAPS_ORDER : BRAKES_ORDER;
      const idx = chain.indexOf(slot);
      for (let i = 0; i < idx; i++) {
        if (!view.slots[chain[i]].switchOn) return false;
      }
    }
    if (def.allowedValues) {
      const die = view.myDice.find((d) => d.id === selectedDieId);
      if (!die) return false;
      const adjusted = die.value + coffeeAdjust;
      if (adjusted < 1 || adjusted > 6) return false;
      if (!def.allowedValues.includes(adjusted as 1 | 2 | 3 | 4 | 5 | 6)) return false;
    }
    return true;
  };

  const myTurn = view.toPlace === view.viewerIndex && view.phase === "placement";

  return (
    <div
      className={[
        "cockpit-root cockpit-frame relative mx-auto w-full max-w-[720px]",
        "aspect-[720/1000] transition-shadow",
        myTurn ? "ring-2 ring-yellow-400/40" : "",
      ].join(" ")}
    >
      <BoardSurface
        viewBox={COCKPIT_VIEWBOX}
        aria-label="Sky Team cockpit"
        overlays={
          <>
            <TopHud view={view} />
            <BottomPanelChrome view={view} />
            <LandingGearStrip view={view} canPlace={canPlace} onSelect={onSelectSlot} />
            <FlapsStrip view={view} canPlace={canPlace} onSelect={onSelectSlot} />
            <BrakeRow view={view} canPlace={canPlace} onSelect={onSelectSlot} />
            <EngineRow view={view} canPlace={canPlace} onSelect={onSelectSlot} />
            <InstrumentSlots view={view} canPlace={canPlace} onSelect={onSelectSlot} />
            <ConcentrationSlots view={view} canPlace={canPlace} onSelect={onSelectSlot} />
          </>
        }
      >
        <CockpitBackground />
        <ArtificialHorizon view={view} />
        <AxisArc view={view} />
        <BrakeArc view={view} />
        <ChainArrows />
        <EngineAxisMarker />
      </BoardSurface>
    </div>
  );
}
