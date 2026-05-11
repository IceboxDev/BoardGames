import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import Die, { HiddenDie } from "./Die";

interface Props {
  view: SkyTeamPlayerView;
  selectedDieId: number | null;
  coffeeAdjust: number;
  onSelectDie: (id: number) => void;
  onAdjustCoffee: (delta: number) => void;
  onSpendReroll: (selectedIds: number[]) => void;
  rerollMode: boolean;
  rerollSelection: Set<number>;
  onToggleRerollMode: () => void;
  onToggleRerollDie: (id: number) => void;
}

export default function PlayerDiceTray({
  view,
  selectedDieId,
  coffeeAdjust,
  onSelectDie,
  onAdjustCoffee,
  onSpendReroll,
  rerollMode,
  rerollSelection,
  onToggleRerollMode,
  onToggleRerollDie,
}: Props) {
  const oppColor = view.viewerIndex === 0 ? "orange" : "blue";
  const selectedDie = view.myDice.find((d) => d.id === selectedDieId);
  const adjustedValue =
    selectedDie != null ? Math.max(1, Math.min(6, selectedDie.value + coffeeAdjust)) : null;

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-slate-700 bg-slate-950/80 p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>Opponent's dice ({view.opponentDiceCount})</span>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: view.opponentDiceCount }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: opaque hidden dice with no other identity
          <HiddenDie key={`hidden-${i}`} color={oppColor} size="sm" />
        ))}
      </div>

      <div className="my-1 h-px bg-slate-700" />

      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>Your dice ({view.myDice.length})</span>
        <div className="flex gap-2">
          {view.rerollTokens > 0 && view.phase === "placement" ? (
            <button
              type="button"
              className={[
                "rounded border px-2 py-0.5 text-[10px]",
                rerollMode
                  ? "border-emerald-300 bg-emerald-700 text-white"
                  : "border-emerald-600 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800",
              ].join(" ")}
              onClick={onToggleRerollMode}
            >
              {rerollMode ? "Cancel" : `Reroll (${view.rerollTokens})`}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view.myDice.map((d) => {
          if (rerollMode) {
            const sel = rerollSelection.has(d.id);
            return (
              <Die key={d.id} die={d} selected={sel} onClick={() => onToggleRerollDie(d.id)} />
            );
          }
          return (
            <Die
              key={d.id}
              die={d}
              selected={selectedDieId === d.id}
              onClick={() => onSelectDie(d.id)}
            />
          );
        })}
      </div>

      {rerollMode ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-slate-400">Selected: {rerollSelection.size}</span>
          <button
            type="button"
            disabled={rerollSelection.size === 0}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white disabled:bg-slate-700 disabled:text-slate-500"
            onClick={() => onSpendReroll([...rerollSelection])}
          >
            Roll
          </button>
        </div>
      ) : null}

      {!rerollMode && selectedDie ? (
        <div className="flex items-center gap-2 rounded bg-slate-900 p-2 text-xs">
          <span className="text-slate-400">Coffee adjust:</span>
          <button
            type="button"
            className="h-6 w-6 rounded bg-slate-700 text-white disabled:opacity-30"
            disabled={coffeeAdjust <= -view.coffeeTokens || (adjustedValue ?? 1) <= 1}
            onClick={() => onAdjustCoffee(coffeeAdjust - 1)}
          >
            −
          </button>
          <span className="font-mono">
            {selectedDie.value}
            {coffeeAdjust !== 0 ? (
              <span className="text-yellow-300">
                {" → "}
                {adjustedValue}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            className="h-6 w-6 rounded bg-slate-700 text-white disabled:opacity-30"
            disabled={coffeeAdjust >= view.coffeeTokens || (adjustedValue ?? 6) >= 6}
            onClick={() => onAdjustCoffee(coffeeAdjust + 1)}
          >
            +
          </button>
          <span className="ml-1 text-slate-500">
            (uses {Math.abs(coffeeAdjust)}
            {Math.abs(coffeeAdjust) === 1 ? " token" : " tokens"})
          </span>
        </div>
      ) : null}
    </div>
  );
}
