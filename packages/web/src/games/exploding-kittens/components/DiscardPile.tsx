import type { Card as CardData } from "@boardgames/core/games/exploding-kittens/types";
import Card, { CardPlaceholder } from "./Card";

interface DiscardPileProps {
  cards: CardData[];
  selectable?: boolean;
  onSelect?: (cardId: number) => void;
}

export default function DiscardPile({ cards, selectable = false, onSelect }: DiscardPileProps) {
  if (selectable && onSelect) {
    return (
      <div>
        <p className="mb-2 text-sm text-gray-400">Discard Pile — Pick a card ({cards.length})</p>
        <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto rounded-lg border border-gray-700 p-3">
          {cards.map((card) => (
            <Card key={card.id} card={card} onClick={() => onSelect(card.id)} size="sm" glowing />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="mb-2 text-sm text-gray-400">Discard</p>
      {cards.length > 0 ? (
        <div className="relative">
          <Card card={cards[0]} disabled />
          {cards.length > 1 && (
            <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-600 text-[10px] font-bold text-white">
              {cards.length}
            </span>
          )}
        </div>
      ) : (
        <CardPlaceholder />
      )}
    </div>
  );
}
