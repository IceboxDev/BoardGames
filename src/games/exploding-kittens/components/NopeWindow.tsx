import { getLegalActions } from "../logic/rules";
import type { Action, GameState } from "../logic/types";
import { CARD_LABELS } from "../logic/types";

interface NopeWindowProps {
  state: GameState;
  onAction: (action: Action) => void;
}

export default function NopeWindow({ state, onAction }: NopeWindowProps) {
  const nw = state.nopeWindow;
  if (!nw) return null;

  const legalActions = getLegalActions(state);
  const canNope = legalActions.some((a) => a.type === "nope");
  const nopeAction = legalActions.find((a) => a.type === "nope");

  const sourcePlayer = state.players[nw.sourcePlayerIndex];
  const sourceName = sourcePlayer.type === "human" ? "You" : `AI ${nw.sourcePlayerIndex}`;

  let effectLabel: string;
  if (nw.effectType === "pair") effectLabel = "Pair Combo (steal)";
  else if (nw.effectType === "triple") effectLabel = "Triple Combo (named steal)";
  else if (nw.effectType === "five-different") effectLabel = "5-Different Combo";
  else effectLabel = CARD_LABELS[nw.effectType];

  return (
    <div className="rounded-xl border border-yellow-700/50 bg-yellow-950/40 p-4">
      <div className="mb-3 text-center">
        <p className="text-sm font-medium text-yellow-300">✋ Nope Window</p>
        <p className="mt-1 text-xs text-gray-400">
          {sourceName} played <span className="font-semibold text-white">{effectLabel}</span>
        </p>
        {nw.nopeChain.length > 0 && (
          <p className="mt-1 text-xs text-yellow-400">
            Nope chain: {nw.nopeChain.length}× (action will be{" "}
            {nw.nopeChain.length % 2 === 0 ? "resolved" : "cancelled"} if no more Nopes)
          </p>
        )}
      </div>

      <div className="flex justify-center gap-3">
        {canNope && nopeAction && (
          <button
            type="button"
            onClick={() => onAction(nopeAction)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
          >
            Play Nope!
          </button>
        )}
        <button
          type="button"
          onClick={() => onAction({ type: "pass-nope" })}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-600"
        >
          Pass
        </button>
      </div>
    </div>
  );
}
