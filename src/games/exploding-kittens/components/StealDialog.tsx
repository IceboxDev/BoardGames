import { getLegalActions } from "../logic/rules";
import type { Action, CardType, GameState } from "../logic/types";
import { CARD_COLORS, CARD_EMOJI, CARD_LABELS } from "../logic/types";

interface StealDialogProps {
  state: GameState;
  onAction: (action: Action) => void;
}

export default function StealDialog({ state, onAction }: StealDialogProps) {
  const legalActions = getLegalActions(state);

  if (state.phase === "choosing-target") {
    const targets = legalActions.filter(
      (a): a is Action & { type: "select-target" } => a.type === "select-target",
    );

    const isForFavor = state.favorContext !== null;
    const isNamed = state.stealContext?.isNamedSteal ?? false;

    return (
      <div className="rounded-xl border border-purple-700/50 bg-purple-950/40 p-4">
        <p className="mb-1 text-sm font-medium text-purple-300">
          {isForFavor
            ? "🙏 Choose Favor Target"
            : isNamed
              ? "🎯 Choose Steal Target (Named)"
              : "🎯 Choose Steal Target"}
        </p>
        <p className="mb-3 text-xs text-gray-400">
          Select a player to {isForFavor ? "demand a favor from" : "steal from"}
        </p>

        <div className="flex gap-3">
          {targets.map((t) => {
            const player = state.players[t.targetIndex];
            return (
              <button
                type="button"
                key={t.targetIndex}
                onClick={() => onAction(t)}
                className="rounded-lg bg-purple-800/60 px-4 py-3 text-sm text-white transition hover:bg-purple-700"
              >
                <div className="font-medium">
                  {player.type === "human" ? "You" : `AI ${t.targetIndex}`}
                </div>
                <div className="text-xs text-gray-400">{player.hand.length} cards</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (state.phase === "choosing-card-name") {
    const nameActions = legalActions.filter(
      (a): a is Action & { type: "name-card-type" } => a.type === "name-card-type",
    );

    return (
      <div className="rounded-xl border border-purple-700/50 bg-purple-950/40 p-4">
        <p className="mb-1 text-sm font-medium text-purple-300">🎯 Name a Card</p>
        <p className="mb-3 text-xs text-gray-400">If the target has this card, you steal it.</p>

        <div className="flex flex-wrap gap-2">
          {nameActions.map((a) => (
            <button
              type="button"
              key={a.cardType}
              onClick={() => onAction(a)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition hover:scale-105"
              style={{ backgroundColor: CARD_COLORS[a.cardType as CardType] }}
            >
              <span>{CARD_EMOJI[a.cardType as CardType]}</span>
              <span>{CARD_LABELS[a.cardType as CardType]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
