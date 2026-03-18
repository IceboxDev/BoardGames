import { useState } from "react";
import { getLegalActions } from "../logic/rules";
import type { Action, GameState } from "../logic/types";

interface DefuseDialogProps {
  state: GameState;
  onAction: (action: Action) => void;
}

export default function DefuseDialog({ state, onAction }: DefuseDialogProps) {
  const ec = state.explosionContext;
  if (!ec) return null;

  const legalActions = getLegalActions(state);
  const defuseActions = legalActions.filter(
    (a): a is Action & { type: "play-defuse" } => a.type === "play-defuse",
  );
  const canDie = legalActions.some((a) => a.type === "skip-defuse");

  if (state.phase === "exploding") {
    return (
      <div className="rounded-xl border border-red-700/50 bg-red-950/50 p-6 text-center">
        <div className="mb-4">
          <span className="text-5xl">💣</span>
        </div>
        <p className="text-lg font-bold text-red-300">You drew an Exploding Kitten!</p>
        <p className="mt-1 text-sm text-gray-400">
          {defuseActions.length > 0
            ? "Play a Defuse card to survive!"
            : "You have no Defuse cards..."}
        </p>

        <div className="mt-4 flex justify-center gap-3">
          {defuseActions.map((a) => (
            <button
              type="button"
              key={a.cardId}
              onClick={() => onAction(a)}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500"
            >
              🔧 Defuse!
            </button>
          ))}
          {canDie && (
            <button
              type="button"
              onClick={() => onAction({ type: "skip-defuse" })}
              className="rounded-lg bg-gray-700 px-4 py-2.5 text-sm text-gray-300 transition hover:bg-gray-600"
            >
              Accept fate 💀
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export function ReinsertDialog({
  state,
  onAction,
}: {
  state: GameState;
  onAction: (action: Action) => void;
}) {
  const [position, setPosition] = useState(0);
  const deckSize = state.drawPile.length;

  return (
    <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/40 p-6 text-center">
      <p className="text-sm font-medium text-emerald-300">🔧 Kitten Defused!</p>
      <p className="mt-1 text-xs text-gray-400">
        Choose where to secretly reinsert the Exploding Kitten.
      </p>

      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 w-full max-w-xs">
          <span className="text-xs text-gray-500 w-8">Top</span>
          <input
            type="range"
            min={0}
            max={deckSize}
            value={position}
            onChange={(e) => setPosition(parseInt(e.target.value, 10))}
            className="flex-1 accent-emerald-500"
          />
          <span className="text-xs text-gray-500 w-12">Bottom</span>
        </div>
        <p className="text-xs text-gray-400">
          Position: {position} of {deckSize} (
          {position === 0 ? "top" : position === deckSize ? "bottom" : `${position} from top`})
        </p>
        <button
          type="button"
          onClick={() => onAction({ type: "reinsert-kitten", position })}
          className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          Place Kitten Here
        </button>
      </div>
    </div>
  );
}
