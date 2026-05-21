import { FLAPS_ORDER } from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
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
} as const;

/** Right side strip — copilot flap slots stacked vertically (ordered chain). */
export default function FlapsStrip({ view, canPlace, onSelect }: Props) {
  return (
    <BoardLayer name="flaps-strip" z={5} aria-label="Flaps">
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
    </BoardLayer>
  );
}
