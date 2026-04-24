import type { SushiGoPlayerView } from "@boardgames/core/games/sushi-go/machine";
import type { ActionLogEntry, Card, SushiGoAction } from "@boardgames/core/games/sushi-go/types";
import { HAND_SIZES } from "@boardgames/core/games/sushi-go/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { CardFan } from "../../../components/card-fan";
import { GameScreen } from "../../../components/game-layout";
import { AiThinkingIndicator } from "../../../components/ui";
import { mapSushiGoLog } from "../log-mapper";
import CardFace, { CardFaceHand } from "./CardFace";
import NashMatrixModal from "./NashMatrixModal";
import PlayerTableau from "./PlayerTableau";
import RoundEndOverlay from "./RoundEndOverlay";

interface GameBoardProps {
  view: SushiGoPlayerView;
  myIndex: number;
  onAction: (action: SushiGoAction) => void;
  isGameOver?: boolean;
  onShowResults?: () => void;
}

export default function GameBoard({
  view,
  myIndex,
  onAction,
  isGameOver,
  onShowResults,
}: GameBoardProps) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [secondCardId, setSecondCardId] = useState<number | null>(null);
  const [useChopsticks, setUseChopsticks] = useState(false);
  const [waitingForAi, setWaitingForAi] = useState(false);
  const [waitStart, setWaitStart] = useState(0);

  // Clear waiting state when the view advances (AI responded)
  const lastTurn = useRef(view.turn);
  const lastPhase = useRef(view.phase);
  useEffect(() => {
    if (view.turn !== lastTurn.current || view.phase !== lastPhase.current) {
      setWaitingForAi(false);
      lastTurn.current = view.turn;
      lastPhase.current = view.phase;
    }
  }, [view.turn, view.phase]);

  // Nash matrix modal — just shows what the AI already computed
  const [showNashMatrix, setShowNashMatrix] = useState(false);
  const hasNashAnalysis =
    view.nashAnalysis != null && view.playerCount === 2 && view.turn >= 2 && !isGameOver;

  // Round-end overlay state
  const [roundEndEntry, setRoundEndEntry] = useState<ActionLogEntry | null>(null);
  const lastSeenRounds = useRef(view.roundScores.length);

  // Detect new round-end entries
  useEffect(() => {
    const currentRounds = view.roundScores.length;
    if (currentRounds > lastSeenRounds.current) {
      // Find the round-end log entry for the newly completed round
      const entry = [...view.actionLog].reverse().find((e) => e.action === "round-end");
      if (entry?.categoryScores) {
        setRoundEndEntry(entry);
      }
      lastSeenRounds.current = currentRounds;
    }
  }, [view.roundScores.length, view.actionLog]);

  const canAct = view.phase === "selecting" && !view.hasSelected;
  const hasChopsticks = view.players[myIndex]?.tableau.some((c) => c.type === "chopsticks");
  const readyToConfirm = selectedCardId !== null && (!useChopsticks || secondCardId !== null);
  const handSize = HAND_SIZES[view.playerCount];
  const selectedCount = view.players.filter((p) => p.hasSelected).length;

  const handleCardClick = useCallback(
    (card: Card) => {
      if (!canAct) return;
      const cardId = card.id;
      if (useChopsticks) {
        if (cardId === selectedCardId) {
          setSelectedCardId(null);
        } else if (cardId === secondCardId) {
          setSecondCardId(null);
        } else if (selectedCardId === null) {
          setSelectedCardId(cardId);
        } else if (secondCardId === null) {
          setSecondCardId(cardId);
        } else {
          setSecondCardId(cardId);
        }
      } else {
        setSelectedCardId((prev) => (prev === cardId ? null : cardId));
        setSecondCardId(null);
      }
    },
    [canAct, useChopsticks, selectedCardId, secondCardId],
  );

  const handleConfirm = useCallback(() => {
    if (selectedCardId === null) return;
    const action: SushiGoAction =
      useChopsticks && secondCardId !== null
        ? { type: "select-with-chopsticks", cardId: selectedCardId, secondCardId }
        : { type: "select-card", cardId: selectedCardId };

    onAction(action);
    setWaitingForAi(true);
    setWaitStart(Date.now());
    setSelectedCardId(null);
    setSecondCardId(null);
    setUseChopsticks(false);
  }, [selectedCardId, secondCardId, useChopsticks, onAction]);

  const handleToggleChopsticks = useCallback(() => {
    setUseChopsticks((prev) => !prev);
    setSecondCardId(null);
  }, []);

  // Reorder players so "you" is last (bottom)
  const otherPlayers = view.players.filter((_, i) => i !== myIndex);
  const myPlayer = view.players[myIndex];

  // AI waiting indicator: shown whenever the human has committed their selection
  // and we're still in the selecting phase. The AI computes its pick in parallel
  // with the human's thinking time, so by the time the user clicks Confirm the
  // AI is usually done and this flashes briefly or not at all. `waitingForAi`
  // covers the network round-trip between click and server echo. We deliberately
  // do NOT use the server's `isAiThinking` signal here — in the parallel flow it
  // can flip true while the actor finishes *during* the user's thinking time,
  // which would confusingly render the indicator before the user has even acted.
  const aiWaiting =
    !isGameOver && (waitingForAi || (view.hasSelected && view.phase === "selecting"));

  return (
    <>
      <GameScreen
        sidebar={<ActionLog blocks={mapSushiGoLog(view.actionLog, myIndex, view.playerCount)} />}
        fan={
          view.hand.length > 0 ? (
            <CardFan
              cards={view.hand}
              getCardId={(c) => c.id}
              renderCard={(card) => (
                <CardFaceHand
                  type={card.type}
                  selected={card.id === selectedCardId || card.id === secondCardId}
                  disabled={!canAct}
                />
              )}
              renderPreview={(card) => <CardFaceHand type={card.type} />}
              onCardClick={(card) => handleCardClick(card)}
              disabled={!canAct}
            />
          ) : undefined
        }
        fanActions={
          <>
            {isGameOver && !roundEndEntry && onShowResults && (
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={onShowResults}
                  className="rounded-lg border border-orange-500/50 bg-orange-500/15 px-8 py-2.5 text-sm font-semibold text-orange-300 transition-colors hover:bg-orange-500/25"
                >
                  View Final Results
                </button>
              </div>
            )}
            {!isGameOver && canAct && readyToConfirm && (
              <div className="flex items-center justify-center gap-2">
                {hasChopsticks && (
                  <button
                    type="button"
                    onClick={handleToggleChopsticks}
                    className={`rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors ${
                      useChopsticks
                        ? "border-green-500/50 bg-green-500/15 text-green-300"
                        : "border-gray-600 bg-gray-700/60 text-gray-400 hover:bg-gray-600"
                    }`}
                  >
                    🥢 Chopsticks{useChopsticks ? " (ON)" : ""}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="rounded-lg border border-orange-500/50 bg-orange-500/15 px-4 py-1.5 text-xs font-medium text-orange-300 transition-colors hover:bg-orange-500/25"
                >
                  Confirm
                </button>
              </div>
            )}
            {!isGameOver && canAct && !readyToConfirm && (
              <div className="flex items-center gap-2">
                {hasChopsticks && (
                  <button
                    type="button"
                    onClick={handleToggleChopsticks}
                    className={`rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors ${
                      useChopsticks
                        ? "border-green-500/50 bg-green-500/15 text-green-300"
                        : "border-gray-600 bg-gray-700/60 text-gray-400 hover:bg-gray-600"
                    }`}
                  >
                    🥢 Chopsticks{useChopsticks ? " (ON)" : ""}
                  </button>
                )}
                <span className="text-xs font-semibold text-cyan-400">Your turn</span>
                <span className="text-gray-500">&middot;</span>
                <span className="text-xs text-gray-400">
                  {useChopsticks
                    ? selectedCardId !== null
                      ? "Select one more card"
                      : "Select two cards to play"
                    : "Select a card to play"}
                </span>
              </div>
            )}
            {!isGameOver && !canAct && !aiWaiting && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {view.phase === "revealing" ? "Revealing cards..." : "Waiting..."}
                </span>
              </div>
            )}
            {aiWaiting && (
              <AiThinkingIndicator
                message={
                  view.playerCount !== 2
                    ? "AI bots choosing cards randomly"
                    : view.turn <= 1
                      ? "AI evaluating opening heuristics"
                      : "AI solving Nash equilibrium game tree"
                }
                showTimer
                startTime={waitStart}
              />
            )}
          </>
        }
      >
        {/* Header — shrink-0 */}
        <div className="shrink-0 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-300">
            {isGameOver
              ? "Game Over — Review Board"
              : `Round ${view.round}/3 \u00b7 Turn ${view.turn}/${handSize}`}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {hasNashAnalysis && (
              <button
                type="button"
                onClick={() => setShowNashMatrix(true)}
                className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-400 transition-colors hover:border-purple-500/50 hover:bg-purple-500/20"
              >
                Nash Matrix
              </button>
            )}
            {isGameOver
              ? ""
              : view.phase === "selecting"
                ? `${selectedCount}/${view.playerCount} selected`
                : view.phase === "revealing"
                  ? "Revealing..."
                  : ""}
          </div>
        </div>

        {/* Revealed cards — shrink-0, conditional */}
        {view.phase === "revealing" && view.lastRevealed.length > 0 && (
          <div className="shrink-0 rounded-lg border border-orange-500/20 bg-orange-500/5 p-2">
            <div className="mb-1 text-xs font-medium text-orange-400">Just played:</div>
            <div className="flex flex-wrap gap-3">
              {view.lastRevealed.map((r) => (
                <div key={r.playerIndex} className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">
                    {r.playerIndex === myIndex ? "You" : `P${r.playerIndex + 1}`}:
                  </span>
                  {r.cards.map((c) => (
                    <CardFace key={c.id} type={c.type} size="sm" />
                  ))}
                  {r.returnedChopsticks && (
                    <span className="text-[10px] text-gray-500">+🥢 back</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Middle — flex-1, scrollable */}
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {/* Opponent tableaux — 2-column grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {otherPlayers.map((p) => (
              <PlayerTableau
                key={p.index}
                index={p.index}
                tableau={p.tableau}
                wasabiBoostedNigiriIds={p.wasabiBoostedNigiriIds}
                puddings={p.puddings}
                isYou={false}
                hasSelected={p.hasSelected}
                handCount={p.handCount}
                score={view.totalScores[p.index]}
              />
            ))}
          </div>

          {/* Your tableau */}
          {myPlayer && (
            <PlayerTableau
              index={myIndex}
              tableau={myPlayer.tableau}
              wasabiBoostedNigiriIds={myPlayer.wasabiBoostedNigiriIds}
              puddings={myPlayer.puddings}
              isYou
              hasSelected={myPlayer.hasSelected}
              handCount={myPlayer.handCount}
              round={view.round}
              score={view.totalScores[myIndex]}
            />
          )}
        </div>
      </GameScreen>

      {/* Round-end scoring overlay */}
      {roundEndEntry && (
        <RoundEndOverlay
          entry={roundEndEntry}
          playerCount={view.playerCount}
          myIndex={myIndex}
          onContinue={() => setRoundEndEntry(null)}
        />
      )}

      {/* Nash equilibrium matrix modal */}
      {showNashMatrix && view.nashAnalysis && (
        <NashMatrixModal
          matrix={view.nashAnalysis}
          turn={view.turn}
          onClose={() => setShowNashMatrix(false)}
        />
      )}
    </>
  );
}
