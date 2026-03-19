import { getLegalDraws } from "@boardgames/core/games/lost-cities/rules";
import type {
  Card as CardData,
  ExpeditionColor,
  GameState,
} from "@boardgames/core/games/lost-cities/types";
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
  const isHumanTurn = state.currentPlayer === 0;
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
    <div className="flex flex-col gap-2 w-full max-w-2xl mx-auto h-full">
      <ScorePanel
        expeditions={state.expeditions}
        drawPileCount={state.drawPile.length}
        turnCount={state.turnCount}
      />

      {/* Opponent Expeditions */}
      <ExpeditionArea expeditions={state.expeditions[1]} isPlayer={false} label="AI Expeditions" />

      {/* Central area: discard piles + draw pile */}
      <div className="flex items-center justify-center gap-3 py-1.5 border-y border-gray-800">
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
      <ExpeditionArea expeditions={state.expeditions[0]} isPlayer={true} label="Your Expeditions" />

      {/* Turn Indicator */}
      <TurnIndicator
        currentPlayer={state.currentPlayer}
        turnPhase={state.turnPhase}
        isGameOver={state.phase === "game-over"}
      />

      {/* Spacer pushes hand to bottom */}
      <div className="flex-1 min-h-0" />

      {/* Player Hand -- pinned to bottom */}
      <div className="shrink-0">
        <PlayerHand
          hand={state.hands[0]}
          expeditions={state.expeditions[0]}
          selectedCardId={selectedCardId}
          onSelectCard={onSelectCard}
          onPlayToExpedition={onPlayToExpedition}
          onDiscard={onDiscard}
          disabled={!isPlayPhase}
        />
      </div>
    </div>
  );
}
