import { LANDING_GEAR_SLOTS } from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import CockpitSlot from "./CockpitSlot";

interface Props {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

const LABELS = {
  "landing-gear-1": "Gear 1",
  "landing-gear-2": "Gear 2",
  "landing-gear-3": "Gear 3",
} as const;

/** Left strip — pilot landing-gear slots stacked in the lower half. Rendered
 *  as HTML overlays; the parent `<Cockpit>` mounts this inside `<BoardSurface>`
 *  `overlays`. */
export default function LandingGearStrip({ view, canPlace, onSelect }: Props) {
  return (
    <>
      {LANDING_GEAR_SLOTS.map((slot) => (
        <CockpitSlot
          key={slot}
          view={view}
          slot={slot}
          label={LABELS[slot as keyof typeof LABELS]}
          canPlace={canPlace}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
