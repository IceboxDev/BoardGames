import { sortHand } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { Action, CardId, Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { useMemo } from "react";
import { CardFan } from "../../../components/card-fan";
import { playableCards } from "../logic/legal";
import SensoCard from "./SensoCard";

interface Props {
  hand: CardId[];
  trump: Clan;
  legalActions: Action[];
  selected: CardId | null;
  onSelect: (card: CardId | null) => void;
  /** Not this seat's turn to play a card. */
  disabled: boolean;
}

export default function PlayerHand({
  hand,
  trump,
  legalActions,
  selected,
  onSelect,
  disabled,
}: Props) {
  const sorted = useMemo(() => sortHand(hand, trump), [hand, trump]);
  const playable = useMemo(() => playableCards(legalActions), [legalActions]);

  return (
    <CardFan
      cards={sorted}
      getCardId={(c) => c}
      renderCard={(card, { isHovered }) => (
        <SensoCard
          card={card}
          size="hand"
          trump={trump}
          selected={selected === card}
          glowing={!disabled && playable.has(card) && selected !== card && isHovered}
          disabled={!disabled && !playable.has(card)}
        />
      )}
      renderPreview={(card) => <SensoCard card={card} size="hand" trump={trump} />}
      onCardClick={(card) => {
        if (disabled || !playable.has(card)) return;
        onSelect(selected === card ? null : card);
      }}
      isPlayable={(card) => playable.has(card)}
      disabled={disabled}
    />
  );
}
