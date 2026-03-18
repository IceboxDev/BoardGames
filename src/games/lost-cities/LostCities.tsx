import { useCallback, useEffect, useRef, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import ActionLog from "./components/ActionLog";
import AISelect from "./components/AISelect";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import GameReplay from "./components/GameReplay";
import TournamentGrid from "./components/TournamentGrid";
import TournamentMatchHistory from "./components/TournamentMatchHistory";
import { computeAIMove, terminateAIWorker } from "./logic/ai";
import { buildGameLog, downloadGameLog } from "./logic/debug-log";
import { applyDraw, applyPlay, createInitialState } from "./logic/game-engine";
import { saveGameResult } from "./logic/persistence";
import { scoreGame } from "./logic/scoring";
import type { TournamentGameLog } from "./logic/tournament-log";
import type {
  ActionLogEntry,
  AIEngine,
  Card,
  ExpeditionColor,
  GameLog,
  GameState,
} from "./logic/types";

const AI_PLAY_DELAY = 400;
const AI_DRAW_DELAY = 350;

export default function LostCities() {
  useDocumentTitle("Lost Cities - Board Games");

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [showTournament, setShowTournament] = useState(false);
  const [matchHistoryPair, setMatchHistoryPair] = useState<{ aId: string; bId: string } | null>(
    null,
  );
  const [replayGame, setReplayGame] = useState<TournamentGameLog | null>(null);
  const aiTurnRef = useRef(false);
  const savedRef = useRef(false);
  const initialDealRef = useRef<GameLog["initialDeal"] | null>(null);

  useEffect(() => {
    return () => {
      aiTurnRef.current = false;
      terminateAIWorker();
    };
  }, []);

  const logAction = useCallback((entry: ActionLogEntry) => {
    setActionLog((prev) => [...prev, entry]);
  }, []);

  const startGame = useCallback((engine: AIEngine) => {
    const state = createInitialState(engine);
    initialDealRef.current = {
      playerHand: [...state.playerHand],
      aiHand: [...state.aiHand],
      drawPile: [...state.drawPile],
    };
    setGameState(state);
    setSelectedCardId(null);
    setActionLog([]);
    aiTurnRef.current = false;
    savedRef.current = false;
  }, []);

  const handleBackToMenu = useCallback(() => {
    setGameState(null);
    setSelectedCardId(null);
    setActionLog([]);
    aiTurnRef.current = false;
    savedRef.current = false;
  }, []);

  const handleSelectCard = useCallback((card: Card) => {
    setSelectedCardId((prev) => (prev === card.id ? null : card.id));
  }, []);

  const handlePlayToExpedition = useCallback(() => {
    if (!gameState || selectedCardId == null) return;
    const card = gameState.playerHand.find((c) => c.id === selectedCardId);
    if (!card) return;

    logAction({
      turn: gameState.turnCount + 1,
      player: "human",
      action: "play-expedition",
      card,
    });
    setGameState((s) => s && applyPlay(s, { kind: "expedition", card }));
    setSelectedCardId(null);
  }, [gameState, selectedCardId, logAction]);

  const handleDiscard = useCallback(() => {
    if (!gameState || selectedCardId == null) return;
    const card = gameState.playerHand.find((c) => c.id === selectedCardId);
    if (!card) return;

    logAction({
      turn: gameState.turnCount + 1,
      player: "human",
      action: "play-discard",
      card,
    });
    setGameState((s) => s && applyPlay(s, { kind: "discard", card }));
    setSelectedCardId(null);
  }, [gameState, selectedCardId, logAction]);

  const handleDrawFromPile = useCallback(() => {
    if (!gameState) return;
    const drawnCard = gameState.drawPile[gameState.drawPile.length - 1];
    if (drawnCard) {
      logAction({
        turn: gameState.turnCount + 1,
        player: "human",
        action: "draw-pile",
        card: drawnCard,
      });
    }
    setGameState((s) => s && applyDraw(s, { kind: "draw-pile" }));
  }, [gameState, logAction]);

  const handleDrawFromDiscard = useCallback(
    (color: ExpeditionColor) => {
      if (!gameState) return;
      const pile = gameState.discardPiles[color];
      const drawnCard = pile[pile.length - 1];
      if (drawnCard) {
        logAction({
          turn: gameState.turnCount + 1,
          player: "human",
          action: "draw-discard",
          card: drawnCard,
          color,
        });
      }
      setGameState((s) => s && applyDraw(s, { kind: "discard-pile", color }));
    },
    [gameState, logAction],
  );

  // AI turn — only trigger when it's the AI's play phase.
  // Uses aiTurnRef as the cancellation flag instead of a cleanup closure,
  // because the effect re-runs (and cleanup fires) when applyPlay updates
  // state mid-turn, which would kill the pending draw step.
  useEffect(() => {
    if (!gameState) return;
    if (gameState.currentPlayer !== "ai") return;
    if (gameState.phase !== "playing") return;
    if (gameState.turnPhase !== "play") return;
    if (aiTurnRef.current) return;

    aiTurnRef.current = true;

    const turnNumber = gameState.turnCount + 1;

    computeAIMove(gameState).then((move) => {
      if (!aiTurnRef.current) return;

      setTimeout(() => {
        if (!aiTurnRef.current) return;

        logAction({
          turn: turnNumber,
          player: "ai",
          action: move.play.kind === "expedition" ? "play-expedition" : "play-discard",
          card: move.play.card,
        });

        setGameState((s) => {
          if (!s || s.currentPlayer !== "ai" || s.phase !== "playing") return s;
          return applyPlay(s, move.play);
        });

        setTimeout(() => {
          if (!aiTurnRef.current) return;

          if (move.draw.kind === "draw-pile") {
            logAction({
              turn: turnNumber,
              player: "ai",
              action: "draw-pile",
              card: { id: -1, color: "white", type: "number", value: 0 },
            });
          } else {
            const pile = gameState.discardPiles[move.draw.color];
            const card = pile[pile.length - 1];
            if (card) {
              logAction({
                turn: turnNumber,
                player: "ai",
                action: "draw-discard",
                card,
                color: move.draw.color,
              });
            }
          }

          setGameState((s) => {
            if (!s || s.currentPlayer !== "ai" || s.turnPhase !== "draw") return s;
            return applyDraw(s, move.draw);
          });

          aiTurnRef.current = false;
        }, AI_DRAW_DELAY);
      }, AI_PLAY_DELAY);
    });
  }, [gameState, logAction]);

  // Save result on game over
  useEffect(() => {
    if (!gameState || gameState.phase !== "game-over") return;
    if (savedRef.current) return;
    savedRef.current = true;

    const { player, ai } = scoreGame(gameState);
    const margin = player.total - ai.total;

    saveGameResult({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      aiEngine: gameState.aiEngine,
      playerScore: player,
      aiScore: ai,
      won: margin > 0,
      margin,
      turnCount: gameState.turnCount,
    });
  }, [gameState?.phase, gameState]);

  const handleDownloadLog = useCallback(() => {
    if (!gameState || !initialDealRef.current) return;
    const scores = gameState.phase === "game-over" ? scoreGame(gameState) : null;
    const log = buildGameLog({
      aiEngine: gameState.aiEngine,
      initialDeal: initialDealRef.current,
      actions: actionLog,
      finalScores: scores ? { player: scores.player, ai: scores.ai } : null,
    });
    downloadGameLog(log);
  }, [gameState, actionLog]);

  // Game replay screen
  if (replayGame) {
    return <GameReplay game={replayGame} onBack={() => setReplayGame(null)} />;
  }

  // Match history screen
  if (matchHistoryPair) {
    return (
      <TournamentMatchHistory
        strategyAId={matchHistoryPair.aId}
        strategyBId={matchHistoryPair.bId}
        onBack={() => setMatchHistoryPair(null)}
        onSelectGame={(game) => setReplayGame(game)}
      />
    );
  }

  // Tournament screen
  if (showTournament) {
    return (
      <TournamentGrid
        onBack={() => setShowTournament(false)}
        onViewMatchHistory={(aId, bId) => setMatchHistoryPair({ aId, bId })}
      />
    );
  }

  // AI selection screen
  if (!gameState) {
    return <AISelect onSelect={startGame} onViewTournament={() => setShowTournament(true)} />;
  }

  // Game over screen
  if (gameState.phase === "game-over") {
    const { player, ai } = scoreGame(gameState);
    return (
      <div className="mx-auto max-w-3xl px-6">
        <GameOverScreen
          playerScore={player}
          aiScore={ai}
          aiEngine={gameState.aiEngine}
          onPlayAgain={() => startGame(gameState.aiEngine)}
          onChangeAI={handleBackToMenu}
          onDownloadLog={handleDownloadLog}
        />
      </div>
    );
  }

  // Active game — 3-column layout keeps the board centered while
  // the sidebar sits at the right edge on wide screens.
  return (
    <div className="w-full px-4 py-4 flex items-start">
      <div className="hidden xl:block w-56 shrink-0" />

      <div className="flex-1 min-w-0 max-w-2xl mx-auto">
        <GameBoard
          state={gameState}
          selectedCardId={selectedCardId}
          onSelectCard={handleSelectCard}
          onPlayToExpedition={handlePlayToExpedition}
          onDiscard={handleDiscard}
          onDrawFromPile={handleDrawFromPile}
          onDrawFromDiscard={handleDrawFromDiscard}
        />
      </div>

      <aside className="hidden xl:flex w-56 shrink-0 ml-4 sticky top-4 h-[calc(100vh-2rem)] rounded-lg border border-gray-800 bg-gray-900/70 backdrop-blur-sm flex-col overflow-hidden">
        <ActionLog entries={actionLog} />
      </aside>
    </div>
  );
}
