import { useCallback, useEffect, useRef, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";
import TournamentGrid from "./components/TournamentGrid";
import { computeAIAction, terminateAIWorker } from "./logic/ai";
import { applyAction, createInitialState } from "./logic/game-engine";
import { saveGameResult } from "./logic/persistence";
import { getActiveDecider } from "./logic/rules";
import type { Action, AIStrategyId, GameState } from "./logic/types";

const AI_ACTION_DELAY = 500;
const AI_NOPE_DELAY = 300;

export default function ExplodingKittens() {
  useDocumentTitle("Exploding Kittens - Board Games");

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showTournament, setShowTournament] = useState(false);
  const [lastSetup, setLastSetup] = useState<{
    playerCount: number;
    strategies: (AIStrategyId | null)[];
  } | null>(null);

  const aiTurnRef = useRef(false);
  const savedRef = useRef(false);

  useEffect(() => {
    return () => {
      aiTurnRef.current = false;
      terminateAIWorker();
    };
  }, []);

  const startGame = useCallback((playerCount: number, strategies: (AIStrategyId | null)[]) => {
    const state = createInitialState(playerCount, strategies);
    setGameState(state);
    setLastSetup({ playerCount, strategies });
    aiTurnRef.current = false;
    savedRef.current = false;
  }, []);

  const handleBackToMenu = useCallback(() => {
    setGameState(null);
    aiTurnRef.current = false;
    savedRef.current = false;
  }, []);

  const handleAction = useCallback((action: Action) => {
    setGameState((s) => (s ? applyAction(s, action) : s));
  }, []);

  const handlePlayAgain = useCallback(() => {
    if (lastSetup) {
      startGame(lastSetup.playerCount, lastSetup.strategies);
    }
  }, [lastSetup, startGame]);

  // AI decision loop: fires whenever the active decider is an AI player
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === "game-over") return;
    if (gameState.phase === "setup") return;

    const decider = getActiveDecider(gameState);
    const player = gameState.players[decider];
    if (!player || player.type !== "ai") return;
    if (aiTurnRef.current) return;

    aiTurnRef.current = true;

    const delay = gameState.phase === "nope-window" ? AI_NOPE_DELAY : AI_ACTION_DELAY;

    const timer = setTimeout(() => {
      if (!aiTurnRef.current) return;

      computeAIAction(gameState, decider)
        .then((move) => {
          if (!aiTurnRef.current) return;
          setGameState((s) => {
            if (!s || s.phase === "game-over") return s;
            aiTurnRef.current = false;
            return applyAction(s, move.action);
          });
        })
        .catch(() => {
          aiTurnRef.current = false;
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      aiTurnRef.current = false;
    };
  }, [gameState]);

  // Save result on game over
  useEffect(() => {
    if (!gameState || gameState.phase !== "game-over") return;
    if (savedRef.current) return;
    savedRef.current = true;

    saveGameResult({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      playerCount: gameState.players.length,
      aiStrategies: gameState.players
        .filter((p) => p.type === "ai")
        .map((p) => p.aiStrategy!)
        .filter(Boolean),
      winner: gameState.winner ?? 0,
      winnerIsHuman:
        gameState.winner !== null && gameState.players[gameState.winner].type === "human",
      turnCount: gameState.turnCount,
      eliminationOrder: gameState.actionLog
        .filter((e) => e.action === "exploded")
        .map((e) => e.playerIndex),
    });
  }, [gameState?.phase, gameState?.actionLog, gameState?.players, gameState?.turnCount, gameState]);

  if (showTournament) {
    return <TournamentGrid onBack={() => setShowTournament(false)} />;
  }

  if (!gameState) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-6 text-2xl font-bold text-white">Exploding Kittens</h2>
        <SetupScreen onStart={startGame} onTournament={() => setShowTournament(true)} />
      </div>
    );
  }

  if (gameState.phase === "game-over") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <GameOverScreen
          state={gameState}
          onPlayAgain={handlePlayAgain}
          onChangeSetup={handleBackToMenu}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Exploding Kittens</h2>
        <button
          type="button"
          onClick={handleBackToMenu}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition hover:bg-gray-600"
        >
          Quit Game
        </button>
      </div>
      <GameBoard state={gameState} onAction={handleAction} />
    </div>
  );
}
