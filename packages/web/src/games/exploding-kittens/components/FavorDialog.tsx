import { sortHand } from "@boardgames/core/games/exploding-kittens/deck";
import type { Action, GameState } from "@boardgames/core/games/exploding-kittens/types";
import { GameDialogPanel } from "../../../components/game-layout";
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
    <GameDialogPanel
      tone="warning"
      title="🙏 Favor"
      subtitle={`${fromName} demands a favor. Choose a card to give.`}
    >
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
    </GameDialogPanel>
  );
}
