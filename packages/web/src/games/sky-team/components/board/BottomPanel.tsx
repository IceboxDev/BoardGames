import { CONCENTRATION_SLOTS } from "@boardgames/core/games/sky-team/scenarios";
import type { SkyTeamPlayerView, SlotId } from "@boardgames/core/games/sky-team/types";
import { BoardLayer, BoardOverlay } from "../../../../components/board";
import CockpitSlot from "./CockpitSlot";
import { BOTTOM_PANEL } from "./geometry";

interface SlotProps {
  view: SkyTeamPlayerView;
  canPlace: (slot: SlotId) => boolean;
  onSelect: (slot: SlotId) => void;
}

const LABELS = {
  "concentration-1": "C1",
  "concentration-2": "C2",
  "concentration-3": "C3",
} as const;

/**
 * SVG portion of the bottom panel: the three concentration slots. Rendered
 * inside the <BoardSurface> as a layer.
 */
export function ConcentrationSlots({ view, canPlace, onSelect }: SlotProps) {
  return (
    <BoardLayer name="concentration-slots" z={5}>
      {CONCENTRATION_SLOTS.map((slot) => (
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

interface ChromeProps {
  view: SkyTeamPlayerView;
}

/**
 * HTML portion of the bottom panel: cabin chrome with coffee tokens and
 * reroll counter. Rendered as a <BoardOverlay> sibling of the <svg>.
 */
export function BottomPanelChrome({ view }: ChromeProps) {
  return (
    <BoardOverlay
      at={{ x: BOTTOM_PANEL.x + BOTTOM_PANEL.w / 2, y: BOTTOM_PANEL.y + BOTTOM_PANEL.h / 2 }}
      anchor="center"
      width={BOTTOM_PANEL.w}
      height={BOTTOM_PANEL.h}
    >
      <div className="flex h-full w-full items-center justify-between rounded-xl border-2 border-slate-700/40 bg-slate-300/40 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
            Coffee
          </span>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => {
              const filled = i < view.coffeeTokens;
              return (
                <div
                  key={`mug-slot-${i}`}
                  className={[
                    "relative h-7 w-9 rounded-sm rounded-b-md transition-colors",
                    filled ? "bg-slate-800 text-white" : "bg-slate-200 text-slate-400",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute -right-2 top-1 h-4 w-3 rounded-r-md border-2 border-l-0",
                      filled ? "border-slate-800" : "border-slate-200",
                    ].join(" ")}
                  />
                  <span className="absolute inset-0 grid place-items-center text-[10px] font-extrabold">
                    {filled ? "+1" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-700">
          Rerolls <span className="font-mono text-emerald-700">{view.rerollTokens}</span>
        </div>
      </div>
    </BoardOverlay>
  );
}
