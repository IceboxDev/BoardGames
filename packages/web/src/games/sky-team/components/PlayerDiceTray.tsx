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

/**
 * Pilot/Co-Pilot dice tray. Fixed-height three-column layout — opponent
 * dice on the LEFT, the player's own dice (large) centred in the MIDDLE,
 * and reroll / coffee / status controls on the RIGHT. The tray is rendered
 * for every phase (briefing, rolling, placement) so the layout below the
 * cockpit doesn't pop in/out — the centre column just sits empty during
 * briefing until the engine rolls.
 */
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
    <div className="flex h-40 items-stretch gap-3 rounded-md border-2 border-white/10 bg-surface-950/80 p-3">
      {/* LEFT: opponent dice — small + hidden. Stack of indicators showing
          how many of the opponent's dice are still unplaced. */}
      <aside className="flex w-28 shrink-0 flex-col items-center justify-center gap-2 rounded bg-surface-900/40 p-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-fg-muted">
          Opponent ({view.opponentDiceCount})
        </span>
        <div className="flex max-w-full flex-wrap justify-center gap-1">
          {Array.from({ length: view.opponentDiceCount }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: opaque hidden dice with no other identity
            <HiddenDie key={`hidden-${i}`} color={oppColor} size="sm" />
          ))}
        </div>
      </aside>

      {/* CENTER: your dice — the core mechanic. Large, centred, taking most
          of the vertical space. Empty during briefing/rolling, populated
          once the engine deals out `myDice`. */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-4">
        {view.myDice.length > 0 ? (
          view.myDice.map((d) => {
            if (rerollMode) {
              const sel = rerollSelection.has(d.id);
              return (
                <Die
                  key={d.id}
                  die={d}
                  size="lg"
                  selected={sel}
                  onClick={() => onToggleRerollDie(d.id)}
                />
              );
            }
            return (
              <Die
                key={d.id}
                die={d}
                size="lg"
                selected={selectedDieId === d.id}
                onClick={() => onSelectDie(d.id)}
              />
            );
          })
        ) : (
          <span className="text-xs italic text-fg-disabled">
            {view.phase === "briefing"
              ? "Waiting for the briefing — dice roll once you're both ready."
              : "Rolling dice…"}
          </span>
        )}
      </div>

      {/* RIGHT: reroll button (top), then a fixed-height status / coffee
          adjuster row underneath. Both rows are rendered always so the
          column height matches the centre regardless of state. */}
      <aside className="flex w-44 shrink-0 flex-col items-stretch justify-center gap-2 rounded bg-surface-900/40 p-2">
        <div className="flex h-7 items-center justify-center">
          {view.rerollTokens > 0 && view.phase === "placement" ? (
            <button
              type="button"
              className={[
                "rounded border px-2 py-0.5 text-2xs font-semibold",
                rerollMode
                  ? "border-emerald-300 bg-emerald-700 text-white"
                  : "border-emerald-600 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800",
              ].join(" ")}
              onClick={onToggleRerollMode}
            >
              {rerollMode ? "Cancel reroll" : `Reroll (${view.rerollTokens})`}
            </button>
          ) : (
            <span className="text-3xs uppercase tracking-wider text-fg-disabled">
              Rerolls: {view.rerollTokens}
            </span>
          )}
        </div>

        <div className="flex h-10 items-center justify-center gap-2 rounded bg-surface-900 px-2 text-xs">
          {rerollMode ? (
            <>
              <span className="text-fg-secondary">Sel: {rerollSelection.size}</span>
              <button
                type="button"
                disabled={rerollSelection.size === 0}
                className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white disabled:bg-surface-700 disabled:text-fg-muted"
                onClick={() => onSpendReroll([...rerollSelection])}
              >
                Roll
              </button>
            </>
          ) : selectedDie ? (
            <>
              <button
                type="button"
                className="h-6 w-6 rounded bg-surface-700 text-white disabled:opacity-30"
                disabled={coffeeAdjust <= -view.coffeeTokens || (adjustedValue ?? 1) <= 1}
                onClick={() => onAdjustCoffee(coffeeAdjust - 1)}
              >
                −
              </button>
              <span className="font-mono text-xs">
                ☕ {selectedDie.value}
                {coffeeAdjust !== 0 ? (
                  <span className="text-yellow-300">
                    {" → "}
                    {adjustedValue}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="h-6 w-6 rounded bg-surface-700 text-white disabled:opacity-30"
                disabled={coffeeAdjust >= view.coffeeTokens || (adjustedValue ?? 6) >= 6}
                onClick={() => onAdjustCoffee(coffeeAdjust + 1)}
              >
                +
              </button>
            </>
          ) : (
            <span className="text-3xs text-fg-disabled">Pick a die →</span>
          )}
        </div>
      </aside>
    </div>
  );
}
