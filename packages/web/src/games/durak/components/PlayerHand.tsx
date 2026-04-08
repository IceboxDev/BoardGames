import { sortHand } from "@boardgames/core/games/durak/deck";
import type { Action, Card as CardData, Suit } from "@boardgames/core/games/durak/types";
import { useMemo } from "react";
import { CardFan } from "../../../components/card-fan";
import Card from "./Card";

interface PlayerHandProps {
  hand: CardData[];
  trumpSuit: Suit;
  legalActions: Action[];
  selectedCardId: number | null;
  onSelectCard: (cardId: number | null) => void;
  disabled: boolean;
}

export default function PlayerHand({
  hand,
  trumpSuit,
  legalActions,
  selectedCardId,
  onSelectCard,
  disabled,
}: PlayerHandProps) {
  const sorted = useMemo(() => sortHand(hand, trumpSuit), [hand, trumpSuit]);

  // Cards that can be played in any action
  const playableCardIds = useMemo(() => {
    const ids = new Set<number>();
    for (const a of legalActions) {
      if ("cardId" in a) ids.add(a.cardId);
    }
    return ids;
  }, [legalActions]);

  return (
    <CardFan
      cards={sorted}
      getCardId={(c) => c.id}
      renderCard={(card, { isHovered }) => {
        const isSelected = selectedCardId === card.id;
        const isPlayable = playableCardIds.has(card.id);
        return (
          <Card
            card={card}
            trumpSuit={trumpSuit}
            size="hand"
            selected={isSelected}
            glowing={!disabled && isPlayable && !isSelected && isHovered}
          />
        );
      }}
      renderPreview={(card) => <Card card={card} trumpSuit={trumpSuit} size="hand" />}
      onCardClick={(card) => {
        const isPlayable = playableCardIds.has(card.id);
        if (disabled || !isPlayable) return;
        onSelectCard(selectedCardId === card.id ? null : card.id);
      }}
      isPlayable={(card) => playableCardIds.has(card.id)}
      disabled={disabled}
    />
  );
}
