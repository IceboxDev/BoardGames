import { BASE_SLOT_DEFS } from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import type { BoardSlotVariant } from "../../../../components/board";
import { BoardSlot } from "../../../../components/board";
import { SLOT_GEOMETRY } from "./geometry";
import PlayerCockpitDie from "./PlayerCockpitDie";

interface Props {
  view: SkyTeamPlayerView;
  slot: SlotId;
  label: string;
  /** Selectability predicate from the parent <Cockpit>. */
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

const VARIANT_BY_ELIGIBILITY: Record<"pilot" | "copilot" | "both", BoardSlotVariant> = {
  pilot: "pilot",
  copilot: "copilot",
  both: "mixed",
};

function constraintLabel(slot: SlotId): string | undefined {
  const allowed = BASE_SLOT_DEFS[slot].allowedValues;
  return allowed ? allowed.join("/") : undefined;
}

/**
 * Cockpit-specific wrapper around <BoardSlot>. Reads the slot's state from
 * `view`, picks the variant from `BASE_SLOT_DEFS`, draws the label + value
 * constraint + placed die in viewBox coords.
 *
 * One <CockpitSlot> per logical slot id; geometry comes from SLOT_GEOMETRY.
 */
export default function CockpitSlot({ view, slot, label, canPlace, onSelect }: Props) {
  const bounds = SLOT_GEOMETRY[slot];
  const def = BASE_SLOT_DEFS[slot];
  const state = view.slots[slot];
  const constraint = constraintLabel(slot);
  const variant = VARIANT_BY_ELIGIBILITY[def.eligibility];
  const selectable = canPlace(slot);
  const filled = state.die != null;

  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  // Slots with an allowedValues constraint (gears, flaps, brakes) show the
  // constraint as their visible label — that's the actionable info. The
  // descriptive label ("Gear 1") still ships in aria-label for screen readers.
  const showAsConstraint = constraint != null;
  const visibleText = showAsConstraint ? constraint : label;
  const textSize = showAsConstraint
    ? Math.min(bounds.w, bounds.h) * 0.36
    : Math.min(bounds.w, bounds.h) * 0.2;

  return (
    <BoardSlot
      bounds={bounds}
      variant={variant}
      selectable={selectable}
      selected={filled}
      aria-label={`${label}${constraint ? ` (${constraint})` : ""}${filled ? ` — die ${state.die?.value}` : ""}`}
      onSelect={selectable ? () => onSelect(slot) : undefined}
    >
      {filled && state.die ? (
        <PlayerCockpitDie
          die={state.die}
          cx={cx}
          cy={cy + (state.switchOn != null ? -4 : 0)}
          size={Math.min(bounds.w, bounds.h) * 0.62}
        />
      ) : (
        <text
          x={cx}
          y={cy + (state.switchOn != null ? -4 : 2)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={textSize}
          fontWeight={900}
          letterSpacing={showAsConstraint ? 0 : 1}
          fill={showAsConstraint ? "rgb(248 250 252 / 0.95)" : "rgb(226 232 240 / 0.92)"}
          style={showAsConstraint ? undefined : { textTransform: "uppercase" }}
          pointerEvents="none"
        >
          {visibleText}
        </text>
      )}
      {state.switchOn != null ? (
        <circle
          cx={cx}
          cy={bounds.y + bounds.h - 8}
          r={4}
          fill={state.switchOn ? "rgb(74 222 128)" : "rgb(30 41 59)"}
          stroke={state.switchOn ? "rgb(134 239 172)" : "rgb(71 85 105)"}
          strokeWidth={1.5}
          pointerEvents="none"
        />
      ) : null}
    </BoardSlot>
  );
}
