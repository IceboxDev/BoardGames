import { BRAKES_ORDER } from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import CockpitSlot from "./CockpitSlot";

interface Props {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

const LABELS = {
  "brakes-2": "Brake 2",
  "brakes-4": "Brake 4",
  "brakes-6": "Brake 6",
} as const;

/** Three ordered pilot brake tiles (2/4/6) below the brake arc. HTML overlays. */
export default function BrakeRow({ view, canPlace, onSelect }: Props) {
  return (
    <>
      {BRAKES_ORDER.map((slot) => (
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
