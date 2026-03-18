import { getLegalDraws } from "../logic/rules";
import type { Card as CardData, ExpeditionColor, GameState } from "../logic/types";
import DiscardArea from "./DiscardArea";
import DrawPile from "./DrawPile";
import ExpeditionArea from "./ExpeditionArea";
import PlayerHand from "./PlayerHand";
import ScorePanel from "./ScorePanel";
import TurnIndicator from "./TurnIndicator";

interface GameBoardProps {
  state: GameState;
  selectedCardId: number | null;
  onSelectCard: (card: CardData) => void;
  onPlayToExpedition: () => void;
  onDiscard: () => void;
  onDrawFromPile: () => void;
  onDrawFromDiscard: (color: ExpeditionColor) => void;
}

export default function GameBoard({
  state,
  selectedCardId,
  onSelectCard,
  onPlayToExpedition,
  onDiscard,
  onDrawFromPile,
  onDrawFromDiscard,
}: GameBoardProps) {
  const isHumanTurn = state.currentPlayer === "human";
  const isPlayPhase = isHumanTurn && state.turnPhase === "play";
  const isDrawPhase = isHumanTurn && state.turnPhase === "draw";

  const legalDraws = isDrawPhase
    ? getLegalDraws(state.discardPiles, state.drawPile, state.lastDiscardedColor)
    : [];

  const drawableDiscardColors = new Set(
    legalDraws
      .filter(
        (d): d is { kind: "discard-pile"; color: ExpeditionColor } => d.kind === "discard-pile",
      )
      .map((d) => d.color),
  );

  const canDrawFromPile = legalDraws.some((d) => d.kind === "draw-pile");

  return (
    <div className="flex flex-col gap-3 w-full max-w-2xl mx-auto">
      <ScorePanel
        playerExpeditions={state.playerExpeditions}
        aiExpeditions={state.aiExpeditions}
        drawPileCount={state.drawPile.length}
        turnCount={state.turnCount}
      />

      {/* AI Expeditions */}
      <ExpeditionArea expeditions={state.aiExpeditions} isPlayer={false} label="AI Expeditions" />

      {/* Central area: discard piles + draw pile */}
      <div className="flex items-center justify-center gap-3 py-2 border-y border-gray-800">
        <DiscardArea
          discardPiles={state.discardPiles}
          onPickDiscard={isDrawPhase ? onDrawFromDiscard : undefined}
          glowingColors={isDrawPhase ? drawableDiscardColors : undefined}
        />
        <div className="border-l border-gray-700 h-16 mx-1" />
        <DrawPile
          count={state.drawPile.length}
          onClick={isDrawPhase && canDrawFromPile ? onDrawFromPile : undefined}
          glowing={isDrawPhase && canDrawFromPile}
        />
      </div>

      {/* Player Expeditions */}
      <ExpeditionArea
        expeditions={state.playerExpeditions}
        isPlayer={true}
        label="Your Expeditions"
      />

      {/* Turn Indicator */}
      <TurnIndicator
        currentPlayer={state.currentPlayer}
        turnPhase={state.turnPhase}
        isGameOver={state.phase === "game-over"}
      />

      {/* Player Hand */}
      <PlayerHand
        hand={state.playerHand}
        expeditions={state.playerExpeditions}
        selectedCardId={selectedCardId}
        onSelectCard={onSelectCard}
        onPlayToExpedition={onPlayToExpedition}
        onDiscard={onDiscard}
        disabled={!isPlayPhase}
      />
    </div>
  );
}
