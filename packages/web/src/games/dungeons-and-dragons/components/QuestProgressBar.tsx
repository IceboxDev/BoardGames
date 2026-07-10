import type { CampaignCheckpoint, CampaignCheckpointKind } from "@boardgames/core/protocol";
import { useState } from "react";

// Display-only quest map: the campaign's checkpoints laid out on a torch-lit
// rail from first steps (crimson) to the finale (gold). Each checkpoint is a
// wax-seal diamond; selecting one reveals its DM-eyes description below. No
// notion of "party position" yet — that's a future slice.

const KIND_LABEL: Record<CampaignCheckpointKind, string> = {
  quest: "Quest",
  battle: "Battle",
  revelation: "Revelation",
  location: "Location",
  treasure: "Treasure",
  finale: "Finale",
};

const KIND_CHIP: Record<CampaignCheckpointKind, string> = {
  quest: "bg-amber-400/15 text-amber-200 ring-amber-400/40",
  battle: "bg-rose-500/15 text-rose-200 ring-rose-400/40",
  revelation: "bg-purple-500/15 text-purple-200 ring-purple-400/40",
  location: "bg-sky-500/15 text-sky-200 ring-sky-400/40",
  treasure: "bg-yellow-500/15 text-yellow-100 ring-yellow-400/40",
  finale: "bg-amber-400/25 text-amber-100 ring-amber-300/60",
};

type Props = {
  checkpoints: CampaignCheckpoint[];
  /** Controlled selection (the game screen drives the waypoint folder). */
  selected?: number;
  onSelect?: (index: number) => void;
  /** Hide the detail box below the rail (the caller renders its own). */
  showDetail?: boolean;
};

export function QuestProgressBar({
  checkpoints,
  selected: controlledSelected,
  onSelect,
  showDetail = true,
}: Props) {
  const [internalSelected, setInternalSelected] = useState(0);
  const selected = controlledSelected ?? internalSelected;
  const select = (i: number) => {
    if (onSelect) onSelect(i);
    else setInternalSelected(i);
  };
  const current = checkpoints[selected];
  if (checkpoints.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Rail + seals. Horizontal padding keeps the end diamonds (0% / 100%)
          from overhanging the card. */}
      <div className="relative px-2 py-2.5">
        <div className="dnd-quest-rail h-2 rounded-full bg-gradient-to-r from-dnd-ember-deep via-dnd-ember to-amber-400/90" />
        <div className="absolute inset-x-2 inset-y-0">
          {checkpoints.map((cp, i) => {
            const pct = checkpoints.length === 1 ? 50 : (i / (checkpoints.length - 1)) * 100;
            const isSelected = i === selected;
            const isFinale = cp.kind === "finale";
            return (
              // biome-ignore lint/correctness/noRestrictedElements: bespoke board-piece control — a wax-seal diamond positioned on the quest rail; Button/Chip chrome doesn't fit.
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: checkpoints are a static, display-only list for the card's lifetime — never reordered or edited.
                key={`${i}-${cp.title}`}
                type="button"
                aria-label={`Waypoint ${i + 1}: ${cp.title}`}
                aria-pressed={isSelected}
                onClick={() => select(i)}
                className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-2"
                style={{ left: `${pct}%` }}
              >
                <span
                  className={`block rotate-45 rounded-[3px] border transition-all duration-150 ${
                    isFinale
                      ? "dnd-checkpoint-seal-finale h-4 w-4 border-amber-200"
                      : "dnd-checkpoint-seal h-3 w-3 border-amber-300/70"
                  } ${
                    isSelected ? "scale-125 bg-amber-300" : "bg-dnd-ink group-hover:bg-amber-400/40"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected waypoint detail. */}
      {showDetail && current && (
        <div className="rounded-xl border border-amber-400/15 bg-black/25 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-serif-body shrink-0 rounded-full px-2 py-0.5 text-3xs font-bold uppercase tracking-label ring-1 ${KIND_CHIP[current.kind]}`}
            >
              {KIND_LABEL[current.kind]}
            </span>
            <span className="text-3xs text-amber-300/50">
              {selected + 1} of {checkpoints.length}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-amber-100">
              {current.title}
            </span>
          </div>
          {current.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-amber-200/65">
              {current.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
