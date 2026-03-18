import { useMemo, useState } from "react";
import { sortHand } from "../logic/deck";
import { getLegalActions, getValidCombos } from "../logic/rules";
import type { Action, Card as CardData, GameState } from "../logic/types";
import Card from "./Card";

interface PlayerHandProps {
  state: GameState;
  onAction: (action: Action) => void;
  disabled: boolean;
}

export default function PlayerHand({ state, onAction, disabled }: PlayerHandProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const player = state.players[state.currentPlayerIndex];
  const hand = useMemo(() => sortHand(player.hand), [player.hand]);
  const legalActions = useMemo(() => (disabled ? [] : getLegalActions(state)), [state, disabled]);

  const playableCardIds = new Set(
    legalActions
      .filter((a): a is Action & { type: "play-card" } => a.type === "play-card")
      .map((a) => a.cardId),
  );

  const combos = useMemo(() => getValidCombos(hand), [hand]);

  const selectedCombo = useMemo(() => {
    if (selectedIds.size < 2) return null;
    const ids = Array.from(selectedIds);
    return combos.find(
      (c) => c.cardIds.length === ids.length && c.cardIds.every((id) => selectedIds.has(id)),
    );
  }, [selectedIds, combos]);

  const canDraw = legalActions.some((a) => a.type === "end-action-phase");

  function toggleCard(card: CardData) {
    if (disabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
      } else {
        next.add(card.id);
      }
      return next;
    });
  }

  function handlePlaySingle() {
    if (selectedIds.size !== 1) return;
    const cardId = Array.from(selectedIds)[0];
    if (playableCardIds.has(cardId)) {
      setSelectedIds(new Set());
      onAction({ type: "play-card", cardId });
    }
  }

  function handlePlayCombo() {
    if (!selectedCombo) return;
    setSelectedIds(new Set());
    onAction({ type: "play-combo", cardIds: selectedCombo.cardIds });
  }

  function handleDraw() {
    setSelectedIds(new Set());
    onAction({ type: "end-action-phase" });
  }

  const singleSelected = selectedIds.size === 1 && playableCardIds.has(Array.from(selectedIds)[0]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <p className="text-sm text-gray-400">Your Hand ({hand.length} cards)</p>
        <div className="flex gap-2">
          {singleSelected && (
            <button
              type="button"
              onClick={handlePlaySingle}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
            >
              Play Card
            </button>
          )}
          {selectedCombo && (
            <button
              type="button"
              onClick={handlePlayCombo}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-purple-500"
            >
              Play{" "}
              {selectedCombo.comboType === "pair"
                ? "Pair"
                : selectedCombo.comboType === "triple"
                  ? "Triple"
                  : "5-Different"}{" "}
              Combo
            </button>
          )}
          {canDraw && !disabled && (
            <button
              type="button"
              onClick={handleDraw}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500"
            >
              Draw Card
            </button>
          )}
        </div>
      </div>

      {hand.length === 0 ? (
        <p className="text-gray-600">No cards in hand</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hand.map((card) => (
            <Card
              key={card.id}
              card={card}
              onClick={() => toggleCard(card)}
              selected={selectedIds.has(card.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
