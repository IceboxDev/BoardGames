import { CONCENTRATION_SLOTS } from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardOverlay } from "../../../../components/board";
import CockpitSlot from "./CockpitSlot";
import { CABIN_PANEL } from "./geometry";
import MugBlock from "./MugBlock";

interface SlotProps {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

const LABELS: Record<SlotId, string> = {
  "pilot-axis": "Axis",
  "pilot-engine": "Engine",
  "pilot-radio": "Radio",
  "copilot-axis": "Axis",
  "copilot-engine": "Engine",
  "copilot-radio-1": "Radio 1",
  "copilot-radio-2": "Radio 2",
  "concentration-1": "Concentration 1",
  "concentration-2": "Concentration 2",
  "concentration-3": "Concentration 3",
  "landing-gear-1": "Gear 1",
  "landing-gear-2": "Gear 2",
  "landing-gear-3": "Gear 3",
  "flaps-1": "Flap 1",
  "flaps-2": "Flap 2",
  "flaps-3": "Flap 3",
  "flaps-4": "Flap 4",
  "brakes-2": "Brake 2",
  "brakes-4": "Brake 4",
  "brakes-6": "Brake 6",
};

/** The three concentration (coffee) tiles inside the cabin panel — HTML overlays. */
export function ConcentrationSlots({ view, canPlace, onSelect }: SlotProps) {
  return (
    <>
      {CONCENTRATION_SLOTS.map((slot) => (
        <CockpitSlot
          key={slot}
          view={view}
          slot={slot}
          label={LABELS[slot]}
          canPlace={canPlace}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

interface ChromeProps {
  view: SkyTeamPlayerView;
}

/**
 * Cabin panel — the polygon-clipped recessed compartment running across the
 * bottom of the board. Holds the right-triangle mug stack (coffee tokens)
 * on its tall-left section. Concentration tiles sit on top via separate
 * overlays so the clip-path doesn't crop them.
 *
 * Matches `sky-team-lab/index.html:206-264` + the `.cabin-panel` CSS rules
 * verbatim (clip-path polygon, recessed-compartment shadow stack).
 */
export function BottomPanelChrome({ view }: ChromeProps) {
  return (
    <BoardOverlay
      className="cockpit-cabin-shell"
      at={{ x: CABIN_PANEL.x, y: CABIN_PANEL.y }}
      anchor="top-left"
      width={CABIN_PANEL.w}
      height={CABIN_PANEL.h}
    >
      <div className="cockpit-cabin" role="img" aria-label="Cabin">
        <MugBlock count={view.coffeeTokens} />
        <div />
      </div>
    </BoardOverlay>
  );
}
