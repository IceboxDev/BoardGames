import { sortHand } from "@boardgames/core/games/lost-cities/deck";
import { canPlayToExpedition } from "@boardgames/core/games/lost-cities/rules";
import type { Card as CardData, Expeditions } from "@boardgames/core/games/lost-cities/types";
import { CardFan } from "../../../components/card-fan";
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
    <div className="flex flex-col items-center w-full">
      {selectedCard && !disabled && (
        <div className="flex gap-2 mb-2 animate-card-enter">
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

      <CardFan
        cards={sorted}
        getCardId={(c) => c.id}
        renderCard={(card, { isHovered }) => (
          <Card
            card={card}
            size="hand"
            selected={card.id === selectedCardId}
            glowing={!disabled && isHovered}
          />
        )}
        renderPreview={(card) => <Card card={card} size="hand" />}
        onCardClick={(card) => onSelectCard(card)}
        disabled={disabled}
      />
    </div>
  );
}
