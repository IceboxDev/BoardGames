import type { Card as CardData, ExpeditionColor } from "@boardgames/core/games/lost-cities/types";
import { COLOR_HEX } from "@boardgames/core/games/lost-cities/types";
import Card, { CardPlaceholder } from "./Card";

interface DiscardPileProps {
  color: ExpeditionColor;
  cards: CardData[];
  onClick?: () => void;
  glowing?: boolean;
}

export default function DiscardPile({ color, cards, onClick, glowing = false }: DiscardPileProps) {
  const topCard = cards.length > 0 ? cards[cards.length - 1] : null;
  const hex = COLOR_HEX[color];

  return (
    <div className="flex flex-col items-center gap-0.5">
      {topCard ? (
        <div className="relative">
          <Card card={topCard} size="sm" onClick={onClick} disabled={!onClick} glowing={glowing} />
          {cards.length > 1 && (
            <span
              className="absolute -top-1.5 -right-1.5 text-[0.5rem] font-bold rounded-full w-4 h-4 flex items-center justify-center"
              style={{ backgroundColor: hex, color: "white" }}
            >
              {cards.length}
            </span>
          )}
        </div>
      ) : (
        <CardPlaceholder color={color} size="sm" onClick={onClick} glowing={glowing} />
      )}
    </div>
  );
}
