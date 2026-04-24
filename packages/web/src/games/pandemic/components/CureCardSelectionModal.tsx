import type {
  CityCard,
  DiseaseColor,
  GameState,
  LegalAction,
} from "@boardgames/core/games/pandemic/types";
import { useMemo, useState } from "react";
import PandemicCard from "./PandemicCard";

export type DiscoverCureOption = Extract<LegalAction, { kind: "discover_cure" }>;

interface CureCardSelectionModalProps {
  state: GameState;
  options: DiscoverCureOption[];
  onConfirm: (color: DiseaseColor, cardIndices: number[]) => void;
  onCancel: () => void;
}

const COLOR_LABELS: Record<DiseaseColor, string> = {
  blue: "Blue",
  yellow: "Yellow",
  black: "Black",
  red: "Red",
};

const COLOR_SWATCH: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#444",
  red: "#ff3333",
};

/**
 * Modal that lets the current player choose exactly `needed` city cards to
 * discard when discovering a cure. Replaces the old `.slice(0, needed)` logic
 * that silently burned whichever cards happened to come first in hand.
 *
 * When more than one color is curable simultaneously (rare but possible —
 * e.g. the Scientist holding 4 blue + 4 black city cards) the modal shows a
 * color picker across the top so the player can choose which cure to
 * dispatch.
 */
export default function CureCardSelectionModal({
  state,
  options,
  onConfirm,
  onCancel,
}: CureCardSelectionModalProps) {
  const firstOption = options[0];
  // Color and selection are bundled into a single state object so that
  // switching color atomically resets the selection — avoids the
  // useEffect(setSelected, [activeColor]) anti-pattern and keeps the reducer
  // semantics obvious at a glance.
  const [pick, setPick] = useState<{ color: DiseaseColor; selected: Set<number> }>({
    color: firstOption.color,
    selected: new Set(),
  });

  const switchColor = (color: DiseaseColor) => setPick({ color, selected: new Set() });

  const activeOption = useMemo(
    () => options.find((o) => o.color === pick.color) ?? firstOption,
    [options, pick.color, firstOption],
  );

  const hand = state.players[state.currentPlayerIndex].hand;

  const cards = useMemo(() => {
    return activeOption.availableCardIndices
      .map((idx) => {
        const card = hand[idx];
        return card?.kind === "city" ? { idx, card: card as CityCard } : null;
      })
      .filter((c): c is { idx: number; card: CityCard } => c !== null);
  }, [activeOption.availableCardIndices, hand]);

  const needed = activeOption.needed;
  const isComplete = pick.selected.size === needed;

  function toggle(idx: number) {
    setPick((prev) => {
      const next = new Set(prev.selected);
      if (next.has(idx)) {
        next.delete(idx);
      } else if (next.size < needed) {
        next.add(idx);
      }
      return { color: prev.color, selected: next };
    });
  }

  function handleConfirm() {
    if (!isComplete) return;
    onConfirm(pick.color, Array.from(pick.selected));
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-3xl flex-col gap-3 rounded-xl bg-neutral-900 p-5 text-white shadow-xl">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Discover a Cure</h2>
          <div className="text-sm text-white/60">
            Select {needed} cards — {pick.selected.size}/{needed} chosen
          </div>
        </div>

        {options.length > 1 && (
          <div className="flex gap-2">
            {options.map((opt) => {
              const isActive = opt.color === pick.color;
              return (
                <button
                  key={opt.color}
                  type="button"
                  onClick={() => switchColor(opt.color)}
                  className="flex items-center gap-2 rounded-full px-3 py-1 text-sm transition-colors"
                  style={{
                    backgroundColor: isActive ? COLOR_SWATCH[opt.color] : "#2a2a2a",
                    color: isActive && opt.color === "yellow" ? "#000" : "#fff",
                    border: `2px solid ${COLOR_SWATCH[opt.color]}`,
                  }}
                >
                  {COLOR_LABELS[opt.color]}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2 overflow-auto">
          {cards.map(({ idx, card }) => {
            const isSelected = pick.selected.has(idx);
            const atCap = !isSelected && pick.selected.size >= needed;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggle(idx)}
                disabled={atCap}
                className="w-32 rounded-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ height: 90 }}
              >
                <PandemicCard card={card} selected={isSelected} />
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isComplete}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-white/40"
          >
            Discover Cure
          </button>
        </div>
      </div>
    </div>
  );
}
