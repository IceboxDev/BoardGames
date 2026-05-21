import { getLegalActions } from "@boardgames/core/games/exploding-kittens/rules";
import type { Action, CardType, GameState } from "@boardgames/core/games/exploding-kittens/types";
import {
  CARD_COLORS,
  CARD_EMOJI,
  CARD_LABELS,
} from "@boardgames/core/games/exploding-kittens/types";
import { Button } from "../../../components/ui/Button";
import { getCardImageUrl, getSkinsForType } from "../assets/card-art";

interface StealDialogProps {
  state: GameState;
  onAction: (action: Action) => void;
}

function CardButton({ cardType, onClick }: { cardType: CardType; onClick: () => void }) {
  const skins = getSkinsForType(cardType);
  const skin = skins.length > 0 ? skins[0] : null;

  return (
    // Card-shaped clickable surface — picks a card-type by image+label.
    // biome-ignore lint/correctness/noRestrictedElements: card-shaped clickable card-type picker
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[90px] flex-col items-center gap-1 rounded-xl p-1.5 transition hover:scale-105 hover:bg-white/10"
    >
      {skin ? (
        <img
          src={getCardImageUrl(skin.file)}
          alt={CARD_LABELS[cardType]}
          className="h-[120px] w-full rounded-lg object-cover ring-1 ring-white/20 transition group-hover:ring-2 group-hover:ring-purple-400"
          draggable={false}
        />
      ) : (
        <div
          className="flex h-[120px] w-full flex-col items-center justify-center rounded-lg ring-1 ring-white/20 transition group-hover:ring-2 group-hover:ring-purple-400"
          style={{ backgroundColor: CARD_COLORS[cardType] }}
        >
          <span className="text-2xl">{CARD_EMOJI[cardType]}</span>
        </div>
      )}
      <span className="text-center text-[10px] font-medium leading-tight text-gray-300 group-hover:text-white">
        {CARD_LABELS[cardType]}
      </span>
    </button>
  );
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
              <Button
                key={t.targetIndex}
                variant="secondary"
                size="md"
                onClick={() => onAction(t)}
                className="!flex-col !items-start !bg-purple-800/60 !border-purple-700/60 hover:!bg-purple-700"
              >
                <div className="font-medium">
                  {player.type === "human" ? "You" : `AI ${t.targetIndex}`}
                </div>
                <div className="text-xs text-gray-400">{player.hand.length} cards</div>
              </Button>
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

        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {nameActions.map((a) => (
            <CardButton
              key={a.cardType}
              cardType={a.cardType as CardType}
              onClick={() => onAction(a)}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}
