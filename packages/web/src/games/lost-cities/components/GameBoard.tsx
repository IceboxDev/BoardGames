import { getLegalDraws } from "@boardgames/core/games/lost-cities/rules";
import type {
  Card as CardData,
  ExpeditionColor,
  GameState,
} from "@boardgames/core/games/lost-cities/types";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import BoardMiddleFit from "./BoardMiddleFit";
import DiscardArea from "./DiscardArea";
import DrawPile from "./DrawPile";
import ExpeditionArea from "./ExpeditionArea";
import FlatPlayerHand, { type FlatPlayerHandProps } from "./FlatPlayerHand";
import PlayerHand from "./PlayerHand";
import ScorePanel from "./ScorePanel";
import TurnIndicator from "./TurnIndicator";

interface GameBoardInteractiveProps {
  mode?: "interactive";
  state: GameState;
  selectedCardId: number | null;
  isMultiplayer?: boolean;
  onSelectCard: (card: CardData) => void;
  onPlayToExpedition: () => void;
  onDiscard: () => void;
  onDrawFromPile: () => void;
  onDrawFromDiscard: (color: ExpeditionColor) => void;
}

interface GameBoardReplayProps {
  mode: "replay";
  state: GameState;
  /** [P0 bottom, P1 top] — same indexing as {@link GameState.expeditions}. */
  replayLabels: [string, string];
  replayTopHand: FlatPlayerHandProps;
  replayBottomHand: FlatPlayerHandProps;
  /** Tighter layout so the board fits the viewport without scrolling. */
  replayCompact?: boolean;
}

export type GameBoardProps = GameBoardInteractiveProps | GameBoardReplayProps;

function boardMiddleMeasureKey(state: GameState): string {
  const parts: string[] = [];
  for (const p of [0, 1] as const) {
    for (const c of EXPEDITION_COLORS) {
      parts.push(String(state.expeditions[p][c].length));
    }
  }
  for (const c of EXPEDITION_COLORS) {
    parts.push(String(state.discardPiles[c].length));
  }
  parts.push(String(state.drawPile.length));
  return parts.join(",");
}

export default function GameBoard(props: GameBoardProps) {
  const middleMeasureKey = boardMiddleMeasureKey(props.state);

  if (props.mode === "replay") {
    const { state, replayLabels, replayTopHand, replayBottomHand, replayCompact = true } = props;
    const [p0, p1] = replayLabels;
    const g = replayCompact ? "gap-1" : "gap-2";
    const pyMid = replayCompact ? "py-0.5" : "py-1.5";

    return (
      <div className={`flex flex-col w-full max-w-2xl mx-auto h-full min-h-0 ${g}`}>
        <ScorePanel
          expeditions={state.expeditions}
          drawPileCount={state.drawPile.length}
          turnCount={state.turnCount}
          playerNames={[p0, p1]}
          compact={replayCompact}
        />

        <FlatPlayerHand {...replayTopHand} compact={replayCompact} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <BoardMiddleFit measureKey={middleMeasureKey}>
            <div className={`flex flex-col ${g}`}>
              <ExpeditionArea
                expeditions={state.expeditions[1]}
                isPlayer={false}
                label={`${p1} expeditions`}
              />

              <div
                className={`flex items-center justify-center gap-2 border-y border-gray-800 shrink-0 ${pyMid}`}
              >
                <DiscardArea discardPiles={state.discardPiles} />
                <div className="border-l border-gray-700 h-14 mx-0.5" />
                <DrawPile count={state.drawPile.length} />
              </div>

              <ExpeditionArea
                expeditions={state.expeditions[0]}
                isPlayer={true}
                label={`${p0} expeditions`}
              />
            </div>
          </BoardMiddleFit>
        </div>

        <TurnIndicator
          currentPlayer={state.currentPlayer}
          turnPhase={state.turnPhase}
          isGameOver={state.phase === "game-over"}
          readOnly
          playerNames={[p0, p1]}
          dense={replayCompact}
        />

        <div className="shrink-0 min-h-0">
          <FlatPlayerHand {...replayBottomHand} compact={replayCompact} />
        </div>
      </div>
    );
  }

  const {
    state,
    selectedCardId,
    isMultiplayer = false,
    onSelectCard,
    onPlayToExpedition,
    onDiscard,
    onDrawFromPile,
    onDrawFromDiscard,
  } = props;

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
    <div className="flex min-h-0 flex-col gap-2 w-full max-w-2xl mx-auto h-full">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <ScorePanel
          expeditions={state.expeditions}
          drawPileCount={state.drawPile.length}
          turnCount={state.turnCount}
        />

        <BoardMiddleFit measureKey={middleMeasureKey}>
          <div className="flex flex-col gap-2">
            <ExpeditionArea
              expeditions={state.expeditions[1]}
              isPlayer={false}
              label={isMultiplayer ? "Opponent Expeditions" : "AI Expeditions"}
            />

            <div className="flex items-center justify-center gap-3 py-1.5 border-y border-gray-800 shrink-0">
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

            <ExpeditionArea
              expeditions={state.expeditions[0]}
              isPlayer={true}
              label="Your Expeditions"
            />
          </div>
        </BoardMiddleFit>
      </div>

      {/* Turn Indicator */}
      <TurnIndicator
        currentPlayer={state.currentPlayer}
        turnPhase={state.turnPhase}
        isGameOver={state.phase === "game-over"}
        isMultiplayer={isMultiplayer}
      />

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
