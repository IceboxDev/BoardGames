import type { SushiGoPlayerView } from "@boardgames/core/games/sushi-go/machine";
import type { ActionLogEntry, Card, SushiGoAction } from "@boardgames/core/games/sushi-go/types";
import { HAND_SIZES } from "@boardgames/core/games/sushi-go/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { HistorySidebar } from "../../../components/action-log";
import { CardFan } from "../../../components/card-fan";
import { AiThinkingIndicator } from "../../../components/ui";
import ActionLog from "./ActionLog";
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
  isAiThinking?: boolean;
}

export default function GameBoard({
  view,
  myIndex,
  onAction,
  isGameOver,
  onShowResults,
  isAiThinking,
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

  const aiWaiting =
    !isGameOver &&
    (waitingForAi || isAiThinking || (view.hasSelected && view.phase === "selecting"));

  return (
    <>
      <HistorySidebar
        contentClassName="gap-2"
        sidebar={
          <ActionLog entries={view.actionLog} myIndex={myIndex} playerCount={view.playerCount} />
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

        {/* Bottom — shrink-0, pinned at bottom */}
        <div className="shrink-0">
          {/* Game over — show results button */}
          {isGameOver && !roundEndEntry && onShowResults && (
            <div className="flex items-center justify-center py-3">
              <button
                type="button"
                onClick={onShowResults}
                className="rounded-lg bg-orange-600 px-8 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-orange-500"
              >
                View Final Results
              </button>
            </div>
          )}

          {/* Action bar — above cards */}
          {!isGameOver && canAct && (
            <div className="mb-2 flex items-center justify-center gap-2">
              {hasChopsticks && (
                <button
                  type="button"
                  onClick={handleToggleChopsticks}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    useChopsticks
                      ? "border-green-500/50 bg-green-500/10 text-green-400"
                      : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  🥢 Use Chopsticks{useChopsticks ? " (ON)" : ""}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedCardId === null || (useChopsticks && secondCardId === null)}
                className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-40 disabled:hover:bg-orange-600"
              >
                Confirm
              </button>
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

          {view.hand.length > 0 && (
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
          )}
        </div>
      </HistorySidebar>

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
