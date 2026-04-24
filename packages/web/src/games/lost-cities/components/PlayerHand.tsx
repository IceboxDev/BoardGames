import { sortHand } from "@boardgames/core/games/lost-cities/deck";
import type { Card as CardData } from "@boardgames/core/games/lost-cities/types";
import { CardFan } from "../../../components/card-fan";
import Card from "./Card";

interface PlayerHandProps {
  hand: CardData[];
  selectedCardId: number | null;
  onSelectCard: (card: CardData) => void;
  disabled: boolean;
}

export default function PlayerHand({
  hand,
  selectedCardId,
  onSelectCard,
  disabled,
}: PlayerHandProps) {
  const sorted = sortHand(hand);

  return (
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
  );
}
