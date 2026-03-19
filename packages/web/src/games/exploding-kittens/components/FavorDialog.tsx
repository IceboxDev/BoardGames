import { sortHand } from "@boardgames/core/games/exploding-kittens/deck";
import type { Action, GameState } from "@boardgames/core/games/exploding-kittens/types";
import Card from "./Card";

interface FavorDialogProps {
  state: GameState;
  onAction: (action: Action) => void;
}

export default function FavorDialog({ state, onAction }: FavorDialogProps) {
  const fc = state.favorContext;
  if (!fc) return null;

  const target = state.players[fc.targetPlayer];
  const fromPlayer = state.players[fc.fromPlayer];
  const fromName = fromPlayer.type === "human" ? "You" : `AI ${fc.fromPlayer}`;
  const hand = sortHand(target.hand);

  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 p-4">
      <p className="mb-1 text-sm font-medium text-amber-300">🙏 Favor</p>
      <p className="mb-3 text-xs text-gray-400">
        {fromName} demands a favor. Choose a card to give.
      </p>

      <div className="flex flex-wrap gap-2">
        {hand.map((card) => (
          <Card
            key={card.id}
            card={card}
            onClick={() => onAction({ type: "give-card", cardId: card.id })}
            size="sm"
          />
        ))}
      </div>
    </div>
  );
}
