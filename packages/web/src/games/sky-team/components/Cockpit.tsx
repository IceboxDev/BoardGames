import {
  BASE_SLOT_DEFS,
  BRAKES_ORDER,
  CONCENTRATION_SLOTS,
  FLAPS_ORDER,
  LANDING_GEAR_SLOTS,
} from "@boardgames/core/games/sky-team/scenarios";
import type { PlayerIndex, SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import CockpitTracks from "./CockpitTracks";
import Slot from "./Slot";

interface Props {
  view: SkyTeamPlayerView;
  selectedDieId: number | null;
  coffeeAdjust: number;
  onSelectSlot: (slot: SlotId) => void;
}

function constraintLabel(slot: SlotId): string | undefined {
  const allowed = BASE_SLOT_DEFS[slot].allowedValues;
  return allowed ? allowed.join("/") : undefined;
}

function variantFor(slot: SlotId): "blue" | "orange" | "neutral" {
  const eligibility = BASE_SLOT_DEFS[slot].eligibility;
  if (eligibility === "pilot") return "blue";
  if (eligibility === "copilot") return "orange";
  return "neutral";
}

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
        "grid grid-cols-1 gap-3 lg:grid-cols-[1fr_minmax(360px,1fr)_1fr] transition-shadow",
        myTurn ? "ring-2 ring-yellow-400/30 rounded-lg" : "",
      ].join(" ")}
    >
      <PilotColumn view={view} canPlace={canPlace} onSelect={onSelectSlot} />
      <CenterColumn view={view} canPlace={canPlace} onSelect={onSelectSlot} />
      <CopilotColumn view={view} canPlace={canPlace} onSelect={onSelectSlot} />
    </div>
  );
}

interface ColumnProps {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

function renderSlot(
  view: SkyTeamPlayerView,
  slot: SlotId,
  label: string,
  canPlace: ColumnProps["canPlace"],
  onSelect: ColumnProps["onSelect"],
) {
  const state = view.slots[slot];
  const def = BASE_SLOT_DEFS[slot];
  const switchOn =
    def.eligibility === "pilot" &&
    (LANDING_GEAR_SLOTS.includes(slot) || BRAKES_ORDER.includes(slot))
      ? state.switchOn
      : def.eligibility === "copilot" && FLAPS_ORDER.includes(slot)
        ? state.switchOn
        : undefined;
  return (
    <Slot
      key={slot}
      state={state}
      label={label}
      constraint={constraintLabel(slot)}
      variant={variantFor(slot)}
      switchOn={switchOn}
      selectable={canPlace(slot)}
      onClick={() => onSelect(slot)}
    />
  );
}

function PilotColumn({ view, canPlace, onSelect }: ColumnProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-sky-700 bg-sky-950/40 p-3">
      <h3 className="text-center text-xs font-bold uppercase tracking-wider text-sky-300">Pilot</h3>
      <div className="grid grid-cols-2 gap-2">
        {renderSlot(view, "pilot-axis", "Axis", canPlace, onSelect)}
        {renderSlot(view, "pilot-engine", "Engine", canPlace, onSelect)}
        {renderSlot(view, "pilot-radio", "Radio", canPlace, onSelect)}
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Landing Gear</div>
        <div className="grid grid-cols-3 gap-2">
          {LANDING_GEAR_SLOTS.map((s, i) =>
            renderSlot(view, s, `Gear ${i + 1}`, canPlace, onSelect),
          )}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Brakes</div>
        <div className="grid grid-cols-3 gap-2">
          {BRAKES_ORDER.map((s, i) => renderSlot(view, s, `Brake ${i + 1}`, canPlace, onSelect))}
        </div>
      </div>
    </div>
  );
}

function CenterColumn({ view, canPlace, onSelect }: ColumnProps) {
  return (
    <div className="flex flex-col gap-3">
      <CockpitTracks view={view} />
      <div className="rounded-md border-2 border-slate-700 bg-slate-950/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Concentration</span>
          <span className="text-xs">
            ☕ <span className="font-mono">{view.coffeeTokens}</span> /{" "}
            <span className="text-slate-400">3</span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {CONCENTRATION_SLOTS.map((s, i) => renderSlot(view, s, `C${i + 1}`, canPlace, onSelect))}
        </div>
        <div className="mt-2 text-[10px] text-slate-400">
          Reroll tokens: <span className="font-mono text-emerald-300">{view.rerollTokens}</span>
        </div>
      </div>
    </div>
  );
}

function CopilotColumn({ view, canPlace, onSelect }: ColumnProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-orange-700 bg-orange-950/40 p-3">
      <h3 className="text-center text-xs font-bold uppercase tracking-wider text-orange-300">
        Co-Pilot
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {renderSlot(view, "copilot-axis", "Axis", canPlace, onSelect)}
        {renderSlot(view, "copilot-engine", "Engine", canPlace, onSelect)}
        {renderSlot(view, "copilot-radio-1", "Radio 1", canPlace, onSelect)}
        {renderSlot(view, "copilot-radio-2", "Radio 2", canPlace, onSelect)}
      </div>
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">
          Flaps (in order)
        </div>
        <div className="grid grid-cols-3 gap-2">
          {FLAPS_ORDER.map((s, i) => renderSlot(view, s, `Flap ${i + 1}`, canPlace, onSelect))}
        </div>
      </div>
    </div>
  );
}
