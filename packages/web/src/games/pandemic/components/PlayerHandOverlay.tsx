import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { GameState, PlayerCard } from "@boardgames/core/games/pandemic/types";
import { useEffect, useState } from "react";
import CardFan from "../../../components/card-fan/CardFan";
import type { GameDispatch } from "../hooks/useGameState";
import PandemicCard from "./PandemicCard";

interface PlayerHandOverlayProps {
  state: GameState;
  dispatch: GameDispatch;
  selectedCardIdx: number | null;
  onSelectCard: (idx: number | null) => void;
}

function getCardId(card: PlayerCard): string {
  if (card.kind === "city") return `city-${card.cityId}`;
  if (card.kind === "event") return `event-${card.event}`;
  return "unknown";
}

export default function PlayerHandOverlay({
  state,
  dispatch,
  selectedCardIdx,
  onSelectCard,
}: PlayerHandOverlayProps) {
  const [handVisible, setHandVisible] = useState(false);
  const [viewingPlayerIdx, setViewingPlayerIdx] = useState(state.currentPlayerIndex);

  // Auto-show on discard phase
  useEffect(() => {
    if (state.phase === "discard") {
      setHandVisible(true);
      setViewingPlayerIdx(state.discardingPlayerIndex ?? state.currentPlayerIndex);
    }
  }, [state.phase, state.discardingPlayerIndex, state.currentPlayerIndex]);

  // Reset to current player on turn change
  useEffect(() => {
    setViewingPlayerIdx(state.currentPlayerIndex);
    onSelectCard(null);
  }, [state.currentPlayerIndex, onSelectCard]);

  const viewingPlayer = state.players[viewingPlayerIdx];
  const isCurrentPlayer = viewingPlayerIdx === state.currentPlayerIndex;
  const hand = viewingPlayer?.hand ?? [];
  const isDisabled = !isCurrentPlayer || state.result !== null;

  function handleCardClick(card: PlayerCard) {
    if (!isCurrentPlayer) return;

    const cardIdx = hand.indexOf(card);
    if (cardIdx < 0) return;

    if (state.phase === "discard") {
      dispatch({ kind: "discard_card", cardIdx });
      return;
    }

    if (state.phase === "actions") {
      onSelectCard(selectedCardIdx === cardIdx ? null : cardIdx);
    }
  }

  function handlePlayerTab(idx: number) {
    if (viewingPlayerIdx === idx) {
      setHandVisible((v) => !v);
    } else {
      setViewingPlayerIdx(idx);
      onSelectCard(null);
      setHandVisible(true);
    }
  }

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10">
      {/* Toggle bar */}
      <div className="pointer-events-auto flex items-center justify-center gap-3 pb-1">
        {/* Player tabs */}
        <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
          {state.players.map((player, idx) => {
            const role = getRoleDef(player.role);
            const isViewing = viewingPlayerIdx === idx;
            const isCurrent = idx === state.currentPlayerIndex;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => handlePlayerTab(idx)}
                className="relative flex items-center justify-center rounded-full transition-transform hover:scale-110"
                style={{
                  width: 28,
                  height: 28,
                  backgroundColor: role.pawnColor,
                  border: isViewing ? "2px solid white" : "2px solid transparent",
                  opacity: isCurrent ? 1 : 0.6,
                }}
                title={`${role.name}'s hand (${player.hand.length} cards)`}
              >
                <span className="text-xs font-bold text-black">{idx + 1}</span>
              </button>
            );
          })}
        </div>

        {/* Eye toggle */}
        <button
          type="button"
          onClick={() => setHandVisible((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur-sm transition-colors hover:text-white"
        >
          {handVisible ? "Hide" : "Show"} Hand
          <span className="text-sm">{handVisible ? "\u25BC" : "\u25B2"}</span>
        </button>

        {/* Deck info */}
        <div className="rounded-full bg-black/60 px-3 py-1 text-xs text-white/60 backdrop-blur-sm">
          Deck: {state.playerDeck.length} | Infection: {state.infectionDeck.length}
        </div>
      </div>

      {/* Card fan area */}
      {handVisible && hand.length > 0 && (
        <div className="pointer-events-auto bg-black/40 backdrop-blur-sm">
          <CardFan
            cards={hand}
            getCardId={getCardId}
            renderCard={(card) => (
              <PandemicCard card={card} selected={selectedCardIdx === hand.indexOf(card)} />
            )}
            onCardClick={handleCardClick}
            disabled={isDisabled}
            maxRotation={10}
          />
        </div>
      )}
    </div>
  );
}
