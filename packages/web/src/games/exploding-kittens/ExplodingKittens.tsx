import type {
  EKEvent,
  EKPlayerView,
  EKResult,
} from "@boardgames/core/games/exploding-kittens/machine";
import type {
  Action,
  AIStrategyId,
  Card,
  GameState,
} from "@boardgames/core/games/exploding-kittens/types";
import { useCallback, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { useRemoteGame } from "../../hooks/useRemoteGame";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";
import TournamentGrid from "./components/TournamentGrid";

let nextPlaceholderId = -1;
function placeholderCards(count: number): Card[] {
  return Array.from({ length: count }, () => ({
    id: nextPlaceholderId--,
    type: "defuse" as const,
  }));
}

function viewToGameState(view: EKPlayerView): GameState {
  nextPlaceholderId = -1;
  const humanIndex = view.players.findIndex((pp) => pp.type === "human");
  return {
    phase: view.phase,
    drawPile: placeholderCards(view.drawPileCount),
    discardPile: view.discardPile,
    players: view.players.map((p) => ({
      index: p.index,
      type: p.type,
      hand: p.index === humanIndex ? view.hand : placeholderCards(p.handCount),
      alive: p.alive,
      aiStrategy: p.aiStrategy,
    })),
    currentPlayerIndex: view.currentPlayerIndex,
    turnsRemaining: view.turnsRemaining,
    turnCount: view.turnCount,
    nopeWindow: view.nopeWindow,
    favorContext: view.favorContext,
    stealContext: view.stealContext,
    discardPickContext: view.discardPickContext,
    peekContext: view.peekContext,
    explosionContext: view.explosionContext,
    actionLog: view.actionLog,
    winner: view.winner,
  };
}

export default function ExplodingKittens() {
  useDocumentTitle("Exploding Kittens - Board Games");

  const game = useRemoteGame<EKPlayerView, EKEvent, EKResult>("exploding-kittens");

  const [showTournament, setShowTournament] = useState(false);
  const [lastSetup, setLastSetup] = useState<{
    playerCount: number;
    strategies: (AIStrategyId | null)[];
  } | null>(null);

  const startGame = useCallback(
    (playerCount: number, strategies: (AIStrategyId | null)[]) => {
      setLastSetup({ playerCount, strategies });
      game.start({ playerCount, strategies });
    },
    [game.start],
  );

  const handleAction = useCallback(
    (action: Action) => {
      game.send({ type: "PLAYER_ACTION", action } as EKEvent);
    },
    [game.send],
  );

  const handlePlayAgain = useCallback(() => {
    if (lastSetup) {
      game.start({ playerCount: lastSetup.playerCount, strategies: lastSetup.strategies });
    }
  }, [lastSetup, game.start]);

  if (showTournament) {
    return <TournamentGrid onBack={() => setShowTournament(false)} />;
  }

  if (!game.view) {
    return <SetupScreen onStart={startGame} onTournament={() => setShowTournament(true)} />;
  }

  const displayState = viewToGameState(game.view);

  if (game.result) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <GameOverScreen
          state={displayState}
          onPlayAgain={handlePlayAgain}
          onChangeSetup={() => game.reset()}
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
          onClick={() => game.reset()}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white transition hover:bg-gray-600"
        >
          Quit Game
        </button>
      </div>
      <GameBoard state={displayState} onAction={handleAction} />
    </div>
  );
}
