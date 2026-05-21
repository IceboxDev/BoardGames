import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
import CockpitSlot from "./CockpitSlot";

interface Props {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

const SLOTS_AND_LABELS: ReadonlyArray<readonly [SlotId, string]> = [
  ["pilot-radio", "Radio"],
  ["copilot-radio-1", "Radio 1"],
  ["copilot-radio-2", "Radio 2"],
  ["pilot-axis", "Axis"],
  ["copilot-axis", "Axis"],
];

/**
 * Axis + Radio slots that sit around the artificial-horizon dial. The axis
 * slots flank the horizon; the radio slots sit just above it. Drawn as one
 * layer so the z-order is consistent.
 */
export default function InstrumentSlots({ view, canPlace, onSelect }: Props) {
  return (
    <BoardLayer name="instrument-slots" z={4}>
      {SLOTS_AND_LABELS.map(([slot, label]) => (
        <CockpitSlot
          key={slot}
          view={view}
          slot={slot}
          label={label}
          canPlace={canPlace}
          onSelect={onSelect}
        />
      ))}
    </BoardLayer>
  );
}
