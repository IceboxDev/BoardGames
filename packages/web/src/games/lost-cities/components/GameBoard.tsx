import { canPlayToExpedition, getLegalDraws } from "@boardgames/core/games/lost-cities/rules";
import { scorePlayer } from "@boardgames/core/games/lost-cities/scoring";
import type {
  Card as CardData,
  DiscardPiles,
  ExpeditionColor,
  Expeditions,
  GamePhase,
  PlayerIndex,
  TurnPhase,
} from "@boardgames/core/games/lost-cities/types";
import {
  COLOR_HEX,
  COLOR_LABELS,
  EXPEDITION_COLORS,
} from "@boardgames/core/games/lost-cities/types";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { CardDeck } from "../../../components/CardDeck";
import { GameScreen } from "../../../components/game-layout";
import { type ExpeditionScoreEntry, ScoreGridPanel } from "../../../components/SidePanel";
import { AiThinkingIndicator, WaitingIndicator } from "../../../components/ui";
import cardBackUrl from "../assets/card-back.png";
import BoardMiddleFit from "./BoardMiddleFit";
import DiscardArea from "./DiscardArea";
import ExpeditionArea from "./ExpeditionArea";
import FlatPlayerHand, { type FlatPlayerHandProps } from "./FlatPlayerHand";
import PlayerHand from "./PlayerHand";
import TurnIndicator from "./TurnIndicator";

/**
 * Display-only view of the board. Contains only public / visible state —
 * no hand contents, no draw-pile contents. Built by the caller from either
 * a live `LostCitiesPlayerView` or a replay step.
 */
export interface BoardState {
  expeditions: [Expeditions, Expeditions];
  discardPiles: DiscardPiles;
  drawPileCount: number;
  currentPlayer: PlayerIndex;
  turnPhase: TurnPhase;
  phase: GamePhase;
  lastDiscardedColor: ExpeditionColor | null;
  turnCount: number;
}

interface GameBoardInteractiveProps {
  mode?: "interactive";
  state: BoardState;
  /** Cards the human player holds — kept separate from {@link BoardState} so the board state is pure display. */
  hand: CardData[];
  selectedCardId: number | null;
  isMultiplayer?: boolean;
  onSelectCard: (card: CardData) => void;
  onPlayToExpedition: () => void;
  onDiscard: () => void;
  onDrawFromPile: () => void;
  onDrawFromDiscard: (color: ExpeditionColor) => void;
  sidebar?: ReactNode;
  isWaiting?: boolean;
}

interface GameBoardReplayProps {
  mode: "replay";
  state: BoardState;
  /** [P0 bottom, P1 top] — same indexing as {@link BoardState.expeditions}. */
  replayLabels: [string, string];
  replayTopHand: FlatPlayerHandProps;
  replayBottomHand: FlatPlayerHandProps;
  /** Tighter layout so the board fits the viewport without scrolling. */
  replayCompact?: boolean;
}

export type GameBoardProps = GameBoardInteractiveProps | GameBoardReplayProps;

function lostCitiesCardBack(cls: string) {
  return (
    <div className={`${cls} overflow-hidden`}>
      <img src={cardBackUrl} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

function buildScoreData(state: BoardState) {
  const p0 = scorePlayer(state.expeditions[0]);
  const p1 = scorePlayer(state.expeditions[1]);
  const expeditions: ExpeditionScoreEntry[] = EXPEDITION_COLORS.map((c, i) => ({
    color: c,
    hex: COLOR_HEX[c],
    label: COLOR_LABELS[c],
    playerScore: p0.expeditions[i].total,
    opponentScore: p1.expeditions[i].total,
    playerStarted: p0.expeditions[i].started,
    opponentStarted: p1.expeditions[i].started,
  }));
  return { expeditions, playerTotal: p0.total, opponentTotal: p1.total };
}

function boardMiddleMeasureKey(state: BoardState): string {
  const parts: string[] = [];
  for (const p of [0, 1] as const) {
    for (const c of EXPEDITION_COLORS) {
      parts.push(String(state.expeditions[p][c].length));
    }
  }
  for (const c of EXPEDITION_COLORS) {
    parts.push(String(state.discardPiles[c].length));
  }
  parts.push(String(state.drawPileCount));
  return parts.join(",");
}

export default function GameBoard(props: GameBoardProps) {
  const middleMeasureKey = boardMiddleMeasureKey(props.state);

  // AI thinking timer — tracks when the AI turn begins so the indicator can show elapsed time.
  // Declared at the top so hook order stays consistent across the replay early return below.
  const isInteractiveAiTurn =
    props.mode !== "replay" && props.state.currentPlayer === 1 && props.state.phase !== "game-over";
  const [aiStartTime, setAiStartTime] = useState(0);
  const prevAiTurn = useRef(false);
  useEffect(() => {
    if (isInteractiveAiTurn && !prevAiTurn.current) {
      setAiStartTime(Date.now());
    }
    prevAiTurn.current = isInteractiveAiTurn;
  }, [isInteractiveAiTurn]);

  if (props.mode === "replay") {
    const { state, replayLabels, replayTopHand, replayBottomHand, replayCompact = true } = props;
    const [p0, p1] = replayLabels;
    const g = replayCompact ? "gap-1" : "gap-2";

    const scores = buildScoreData(state);

    return (
      <div className="flex h-full min-h-0 gap-3">
        {/* Left stats column */}
        <div className="hidden w-36 shrink-0 flex-col border-2 border-dashed border-blue-400/40 lg:flex">
          <ScoreGridPanel
            turnCount={state.turnCount + 1}
            playerName={p0}
            opponentName={p1}
            expeditions={scores.expeditions}
            playerTotal={scores.playerTotal}
            opponentTotal={scores.opponentTotal}
          />
        </div>

        <div
          className={`flex min-h-0 flex-1 flex-col border-2 border-dashed border-orange-400/40 ${g}`}
        >
          <FlatPlayerHand {...replayTopHand} compact={replayCompact} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <BoardMiddleFit measureKey={middleMeasureKey}>
              <div className="flex flex-1 flex-col">
                <div className="shrink-0">
                  <ExpeditionArea expeditions={state.expeditions[1]} isPlayer={false} />
                </div>

                <div className="flex flex-1 items-center justify-center border-y border-gray-800 my-1.5">
                  <DiscardArea discardPiles={state.discardPiles} />
                </div>

                <div className="shrink-0">
                  <ExpeditionArea expeditions={state.expeditions[0]} isPlayer={true} />
                </div>
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

        {/* Deck column */}
        <div className="flex w-36 shrink-0 flex-col items-center justify-center border-2 border-dashed border-purple-400/40">
          <CardDeck count={state.drawPileCount} size="lg" renderBack={lostCitiesCardBack} />
        </div>
      </div>
    );
  }

  const {
    state,
    hand,
    selectedCardId,
    isMultiplayer = false,
    onSelectCard,
    onPlayToExpedition,
    onDiscard,
    onDrawFromPile,
    onDrawFromDiscard,
    sidebar,
    isWaiting,
  } = props;

  const isHumanTurn = state.currentPlayer === 0;
  const isPlayPhase = isHumanTurn && state.turnPhase === "play";
  const isDrawPhase = isHumanTurn && state.turnPhase === "draw";

  const legalDraws = isDrawPhase
    ? getLegalDraws(state.discardPiles, state.drawPileCount, state.lastDiscardedColor)
    : [];

  const drawableDiscardColors = new Set(
    legalDraws
      .filter(
        (d): d is { kind: "discard-pile"; color: ExpeditionColor } => d.kind === "discard-pile",
      )
      .map((d) => d.color),
  );

  const canDrawFromPile = legalDraws.some((d) => d.kind === "draw-pile");

  const selectedCard =
    selectedCardId != null ? (hand.find((c) => c.id === selectedCardId) ?? null) : null;
  const canPlay = selectedCard
    ? canPlayToExpedition(selectedCard, state.expeditions[0][selectedCard.color])
    : false;

  return (
    <GameScreen
      contentClassName=""
      sidebar={sidebar}
      fan={
        <PlayerHand
          hand={hand}
          selectedCardId={selectedCardId}
          onSelectCard={onSelectCard}
          disabled={!isPlayPhase}
        />
      }
      fanActions={
        isPlayPhase && selectedCard ? (
          <div className="flex items-center justify-center gap-2">
            {canPlay && (
              <button
                type="button"
                onClick={onPlayToExpedition}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
              >
                Play to Expedition
              </button>
            )}
            <button
              type="button"
              onClick={onDiscard}
              className="rounded-lg border border-gray-600 bg-gray-700/60 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-600"
            >
              Discard
            </button>
          </div>
        ) : isHumanTurn && state.phase !== "game-over" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-cyan-400">Your turn</span>
            <span className="text-gray-500">&middot;</span>
            <span className="text-xs text-gray-400">
              {isPlayPhase
                ? "Select a card to play or discard"
                : "Draw a card from the pile or discard"}
            </span>
          </div>
        ) : !isHumanTurn && state.phase !== "game-over" ? (
          isMultiplayer ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-400">Opponent</span>
              <span className="text-gray-500">&middot;</span>
              <span className="text-xs text-gray-400">Waiting for opponent&hellip;</span>
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            </div>
          ) : (
            <AiThinkingIndicator
              message="IS-MCTS computing best move"
              showTimer
              startTime={aiStartTime}
            />
          )
        ) : undefined
      }
    >
      {isWaiting && <WaitingIndicator />}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left stats column */}
        <div className="hidden w-36 shrink-0 flex-col border-2 border-dashed border-blue-400/40 lg:flex">
          <ScoreGridPanel turnCount={state.turnCount + 1} {...buildScoreData(state)} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-2 border-dashed border-orange-400/40">
          <BoardMiddleFit measureKey={middleMeasureKey}>
            <div className="flex flex-1 flex-col">
              <div className="shrink-0">
                <ExpeditionArea expeditions={state.expeditions[1]} isPlayer={false} />
              </div>

              <div className="flex flex-1 items-center justify-center border-y border-gray-800 my-1.5">
                <DiscardArea
                  discardPiles={state.discardPiles}
                  onPickDiscard={isDrawPhase ? onDrawFromDiscard : undefined}
                  glowingColors={isDrawPhase ? drawableDiscardColors : undefined}
                />
              </div>

              <div className="shrink-0">
                <ExpeditionArea expeditions={state.expeditions[0]} isPlayer={true} />
              </div>
            </div>
          </BoardMiddleFit>
        </div>

        {/* Deck column */}
        <div className="flex w-36 shrink-0 flex-col items-center justify-center border-2 border-dashed border-purple-400/40">
          <CardDeck
            count={state.drawPileCount}
            size="lg"
            glowing={isDrawPhase && canDrawFromPile}
            onClick={isDrawPhase && canDrawFromPile ? onDrawFromPile : undefined}
            renderBack={lostCitiesCardBack}
          />
        </div>
      </div>
    </GameScreen>
  );
}
