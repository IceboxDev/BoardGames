import { sortHand } from "../logic/deck";
import { canPlayToExpedition } from "../logic/rules";
import type { Card as CardData, Expeditions } from "../logic/types";
import Card from "./Card";

interface PlayerHandProps {
  hand: CardData[];
  expeditions: Expeditions;
  selectedCardId: number | null;
  onSelectCard: (card: CardData) => void;
  onPlayToExpedition: () => void;
  onDiscard: () => void;
  disabled: boolean;
}

export default function PlayerHand({
  hand,
  expeditions,
  selectedCardId,
  onSelectCard,
  onPlayToExpedition,
  onDiscard,
  disabled,
}: PlayerHandProps) {
  const sorted = sortHand(hand);
  const selectedCard =
    selectedCardId != null ? (hand.find((c) => c.id === selectedCardId) ?? null) : null;
  const canPlay = selectedCard
    ? canPlayToExpedition(selectedCard, expeditions[selectedCard.color])
    : false;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex gap-1 justify-center w-full max-w-lg">
        {sorted.map((card) => (
          <div key={card.id} className="flex-1 min-w-0 max-w-20">
            <Card
              card={card}
              size="hand"
              selected={card.id === selectedCardId}
              onClick={() => onSelectCard(card)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      {selectedCard && !disabled && (
        <div className="flex gap-2 animate-card-enter">
          {canPlay && (
            <button
              type="button"
              onClick={onPlayToExpedition}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold transition hover:bg-emerald-500"
            >
              Play to Expedition
            </button>
          )}
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-1.5 rounded-lg bg-gray-600 text-white text-sm font-semibold transition hover:bg-gray-500"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}
