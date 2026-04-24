import { sortHand } from "@boardgames/core/games/exploding-kittens/deck";
import type { Card as CardData } from "@boardgames/core/games/exploding-kittens/types";
import { useMemo } from "react";
import { CardFan } from "../../../components/card-fan";
import Card from "./Card";

interface PlayerHandProps {
  hand: CardData[];
  selectedIds: Set<number>;
  onToggleCard: (card: CardData) => void;
  disabled: boolean;
}

export default function PlayerHand({ hand, selectedIds, onToggleCard, disabled }: PlayerHandProps) {
  const sorted = useMemo(() => sortHand(hand), [hand]);

  if (hand.length === 0) {
    return <p className="text-center text-sm text-gray-600">No cards in hand</p>;
  }

  return (
    <CardFan
      cards={sorted}
      getCardId={(c) => c.id}
      renderCard={(card) => (
        <Card card={card} size="hand" selected={selectedIds.has(card.id)} disabled={disabled} />
      )}
      renderPreview={(card) => <Card card={card} size="hand" />}
      onCardClick={onToggleCard}
      disabled={disabled}
    />
  );
}
