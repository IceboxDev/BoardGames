import { FLAPS_ORDER } from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import CockpitSlot from "./CockpitSlot";

interface Props {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

const LABELS = {
  "flaps-1": "Flap 1",
  "flaps-2": "Flap 2",
  "flaps-3": "Flap 3",
  "flaps-4": "Flap 4",
} as const;

/** Right strip — copilot flap slots (ordered chain). Rendered as HTML overlays
 *  that the parent `<Cockpit>` mounts via `<BoardSurface>` `overlays`. */
export default function FlapsStrip({ view, canPlace, onSelect }: Props) {
  return (
    <>
      {FLAPS_ORDER.map((slot) => (
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
