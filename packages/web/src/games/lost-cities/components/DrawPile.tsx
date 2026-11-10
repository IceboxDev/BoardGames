import { scorePlayer } from "@boardgames/core/games/lost-cities/scoring";
import { cn } from "../../../lib/cn";
import { artUrl } from "../logic/art";
import type { BoardState } from "./GameBoard";

/** The left rail: the deck (drawn from in the draw step), turn and totals. */
export default function DrawPile({
  state,
  names,
  canDraw,
  onDraw,
}: {
  state: BoardState;
  names: [string, string];
  canDraw: boolean;
  onDraw?: () => void;
}) {
  const back = artUrl("back");
  const totals = [scorePlayer(state.expeditions[0]).total, scorePlayer(state.expeditions[1]).total];
  return (
    <div className="flex flex-col gap-4">
      <span className="text-3xs font-semibold uppercase tracking-eyebrow text-fg-muted">
        Turn {state.turnCount + 1}
      </span>
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={!canDraw}
          onClick={canDraw ? onDraw : undefined}
          aria-label={`Draw from the deck (${state.drawPileCount} left)`}
          className={cn(
            "aspect-card w-24 overflow-hidden rounded-card-md bg-surface-800 shadow-md ring-1 ring-black",
            canDraw && "cursor-pointer ring-2 ring-accent-400 shadow-glow-accent",
          )}
        >
          {back && (
            <img src={back} alt="" className="h-full w-full object-cover" draggable={false} />
          )}
        </button>
        <span className="text-xs text-fg-secondary tabular-nums">
          {state.drawPileCount} cards · ≈ {Math.ceil(state.drawPileCount / 2)} turns each
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {names.map((name, i) => (
          <div
            key={name + String(i)}
            className="flex items-baseline justify-between gap-2 rounded-card-md border border-line-soft bg-fill-soft px-3 py-2.5"
          >
            <span className="truncate font-fantasy text-xs font-semibold uppercase tracking-label text-fg-secondary">
              {name}
            </span>
            <b className="font-card text-2xl font-bold tabular-nums text-fg-strong">{totals[i]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
