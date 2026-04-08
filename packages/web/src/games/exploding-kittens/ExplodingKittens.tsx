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
import { AI_STRATEGY_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import { useCallback, useEffect, useState } from "react";
import { MpGameOverScreen } from "../../components/game-over";
import { MatchHistory } from "../../components/match-history";
import { useGameShell } from "../../hooks/useGameShell";
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

function viewToGameState(view: EKPlayerView, myPlayerIndex: number): GameState {
  nextPlaceholderId = -1;
  return {
    phase: view.phase,
    drawPile: placeholderCards(view.drawPileCount),
    discardPile: view.discardPile,
    players: view.players.map((p) => ({
      index: p.index,
      type: p.type,
      hand: p.index === myPlayerIndex ? view.hand : placeholderCards(p.handCount),
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
  const shell = useGameShell<EKPlayerView, EKEvent, EKResult>("exploding-kittens");

  const [lastSetup, setLastSetup] = useState<{
    playerCount: number;
    strategies: (AIStrategyId | null)[];
  } | null>(null);

  // Back overrides for game-managed modes
  useEffect(() => {
    if (
      shell.mode === "solo" ||
      shell.mode === "mp-playing" ||
      shell.mode === "match-history" ||
      shell.mode === "tournament"
    ) {
      shell.setBackOverride(shell.goToMenu);
      return () => shell.setBackOverride(null);
    }
    return undefined;
  }, [shell.mode, shell.goToMenu, shell.setBackOverride]);

  const startGame = useCallback(
    (playerCount: number, strategies: (AIStrategyId | null)[]) => {
      setLastSetup({ playerCount, strategies });
      shell.game.start({ playerCount, strategies });
    },
    [shell.game.start],
  );

  const handleAction = useCallback(
    (action: Action) => {
      if (shell.mode === "mp-playing") {
        shell.mp.send({ type: "PLAYER_ACTION", action } as EKEvent);
      } else {
        shell.game.send({ type: "PLAYER_ACTION", action } as EKEvent);
      }
    },
    [shell.game.send, shell.mp.send, shell.mode],
  );

  const handlePlayAgain = useCallback(() => {
    if (lastSetup) {
      shell.game.start({
        playerCount: lastSetup.playerCount,
        strategies: lastSetup.strategies,
      });
    }
  }, [lastSetup, shell.game.start]);

  if (shell.screen) return shell.screen;

  if (shell.mode === "match-history") {
    return (
      <MatchHistory
        gameSlug="exploding-kittens"
        labelResolver={(e) => AI_STRATEGY_LABELS[e as AIStrategyId] ?? e}
        onBack={shell.goToMenu}
      />
    );
  }

  if (shell.mode === "tournament") {
    return <TournamentGrid onBack={shell.goToMenu} />;
  }

  // Solo setup
  if (shell.mode === "solo" && !shell.game.view) {
    return <SetupScreen onStart={startGame} />;
  }

  // Game playing
  const activeView = shell.mode === "mp-playing" ? shell.mp.view : shell.game.view;
  const activeResult = shell.mode === "mp-playing" ? shell.mp.result : shell.game.result;
  const activePlayerIndex =
    shell.mode === "mp-playing" ? shell.mp.playerIndex : shell.game.playerIndex;

  if (!activeView) return null;

  const displayState = viewToGameState(activeView, activePlayerIndex);

  if (activeResult) {
    if (shell.mode === "mp-playing") {
      const isWinner = activeResult.winner === activePlayerIndex;
      return (
        <MpGameOverScreen
          headline={isWinner ? "You Win!" : "You Lose!"}
          headlineColor={isWinner ? "win" : "lose"}
          subtitle={`Game lasted ${activeResult.turnCount} turns`}
          onBackToMenu={shell.goToMenu}
        />
      );
    }

    return (
      <GameOverScreen
        state={displayState}
        onPlayAgain={handlePlayAgain}
        onChangeSetup={() => shell.game.reset()}
      />
    );
  }

  return <GameBoard state={displayState} onAction={handleAction} />;
}
