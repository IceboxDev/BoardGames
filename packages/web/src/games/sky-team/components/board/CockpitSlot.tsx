import {
  BASE_SLOT_DEFS,
  BRAKES_ORDER,
  CONCENTRATION_SLOTS,
  FLAPS_ORDER,
  LANDING_GEAR_SLOTS,
  RADIO_SLOTS,
} from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardOverlay } from "../../../../components/board";
import AtcHeadset from "./AtcHeadset";
import CockpitSlider from "./CockpitSlider";
import CoffeeCup from "./CoffeeCup";
import { SLOT_GEOMETRY } from "./geometry";
import JetEngine from "./JetEngine";
import Plane from "./Plane";
import SkyTeamTile, { type TileVariant, tileValueLabel } from "./SkyTeamTile";

const VARIANT_BY_ELIGIBILITY: Record<"pilot" | "copilot" | "both", TileVariant> = {
  pilot: "pilot",
  copilot: "copilot",
  both: "mixed",
};

const SLIDER_SLOTS: ReadonlySet<SlotId> = new Set<SlotId>([
  ...LANDING_GEAR_SLOTS,
  ...FLAPS_ORDER,
  ...BRAKES_ORDER,
]);

const CONCENTRATION_SET: ReadonlySet<SlotId> = new Set<SlotId>(CONCENTRATION_SLOTS);
const RADIO_SET: ReadonlySet<SlotId> = new Set<SlotId>(RADIO_SLOTS);

// Slots that render no text label — icons / svgs will land here later.
const NO_LABEL_SLOTS: ReadonlySet<SlotId> = new Set<SlotId>([
  "pilot-engine",
  "copilot-engine",
  "pilot-axis",
  "copilot-axis",
  "pilot-radio",
  "copilot-radio-1",
  "copilot-radio-2",
]);

const SLIDER_W = 78;
const SLIDER_H = 30;
const TILE_TO_SLIDER_GAP = 4;

interface Props {
  view: SkyTeamPlayerView;
  slot: SlotId;
  label: string;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

/**
 * One cockpit control slot — an interactive HTML tile, optionally with a
 * hardware-mock slider beneath. Positioned via two `<BoardOverlay>`s so each
 * primitive sits in its own container-query shell.
 */
export default function CockpitSlot({ view, slot, label, canPlace, onSelect }: Props) {
  const bounds = SLOT_GEOMETRY[slot];
  const def = BASE_SLOT_DEFS[slot];
  const state = view.slots[slot];
  const allowed = def.allowedValues;
  const variant = VARIANT_BY_ELIGIBILITY[def.eligibility];
  const selectable = canPlace(slot);
  const hasDie = state.die != null;
  const hasSlider = SLIDER_SLOTS.has(slot);
  const isConcentration = CONCENTRATION_SET.has(slot);
  const isRadio = RADIO_SET.has(slot);
  const isPilotAxis = slot === "pilot-axis";
  const isCopilotAxis = slot === "copilot-axis";
  const isEngine = slot === "pilot-engine" || slot === "copilot-engine";
  const constraintText = allowed ? allowed.join("/") : undefined;
  // Concentration tiles render only the coffee-cup icon. Engine + axis slots
  // render blank until their svgs land.
  const tileLabel = allowed
    ? tileValueLabel(allowed)
    : isConcentration || NO_LABEL_SLOTS.has(slot)
      ? undefined
      : label;

  const sliderX = bounds.x + bounds.w / 2 - SLIDER_W / 2;
  const sliderY = bounds.y + bounds.h + TILE_TO_SLIDER_GAP;

  return (
    <>
      <BoardOverlay
        className="cockpit-tile-shell"
        at={{ x: bounds.x, y: bounds.y }}
        anchor="top-left"
        width={bounds.w}
        height={bounds.h}
      >
        <SkyTeamTile
          variant={variant}
          label={tileLabel}
          // Slider slots render their die exactly like every other slot —
          // it stays on the tile until the engine returns all dice at end of
          // round. The slider underneath additionally goes green/armed, and
          // stays armed after the die leaves (switchOn persists).
          placedDie={state.die}
          selectable={selectable && !hasDie}
          onSelect={selectable ? () => onSelect(slot) : undefined}
          className={isPilotAxis || isCopilotAxis || isEngine ? "cockpit-tile--framed" : undefined}
          aria-label={`${label}${constraintText ? ` (${constraintText})` : ""}${hasDie ? ` — die ${state.die?.value}` : ""}`}
        >
          {isConcentration ? (
            <CoffeeCup />
          ) : isRadio ? (
            <AtcHeadset />
          ) : isPilotAxis ? (
            <Plane rotate={-45} color="#8df0d0" className="cockpit-tile__plane" />
          ) : isCopilotAxis ? (
            <Plane rotate={45} color="#ffd83a" className="cockpit-tile__plane" />
          ) : isEngine ? (
            <JetEngine className="cockpit-tile__engine" />
          ) : null}
        </SkyTeamTile>
      </BoardOverlay>
      {hasSlider ? (
        <BoardOverlay
          className="cockpit-slider-shell"
          at={{ x: sliderX, y: sliderY }}
          anchor="top-left"
          width={SLIDER_W}
          height={SLIDER_H}
        >
          <CockpitSlider active={hasDie || state.switchOn === true} />
        </BoardOverlay>
      ) : null}
    </>
  );
}
