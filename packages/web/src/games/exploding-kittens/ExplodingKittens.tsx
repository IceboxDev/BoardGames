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
import { useNavigate } from "react-router-dom";
import { MpGameOverScreen } from "../../components/game-over";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

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

export default function ExplodingKittens({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<EKPlayerView, EKEvent, EKResult>();

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
      if (source === "mp") {
        mp.send({ type: "PLAYER_ACTION", action } as EKEvent);
      } else {
        game.send({ type: "PLAYER_ACTION", action } as EKEvent);
      }
    },
    [source, game.send, mp.send],
  );

  const handlePlayAgain = useCallback(() => {
    if (lastSetup) {
      game.start({
        playerCount: lastSetup.playerCount,
        strategies: lastSetup.strategies,
      });
    }
  }, [lastSetup, game.start]);

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  // Solo setup
  if (source === "solo" && !game.view) {
    return <SetupScreen onStart={startGame} />;
  }

  // Game playing
  const active = source === "mp" ? mp : game;
  const activeView = active.view;
  const activeResult = active.result;
  const activePlayerIndex = active.playerIndex;

  if (!activeView) return null;

  const displayState = viewToGameState(activeView, activePlayerIndex);

  if (activeResult) {
    if (source === "mp") {
      const isWinner = activeResult.winner === activePlayerIndex;
      return (
        <MpGameOverScreen
          headline={isWinner ? "You Win!" : "You Lose!"}
          headlineColor={isWinner ? "win" : "lose"}
          subtitle={`Game lasted ${activeResult.turnCount} turns`}
          onBackToMenu={backToMenu}
        />
      );
    }

    return (
      <GameOverScreen
        state={displayState}
        onPlayAgain={handlePlayAgain}
        onChangeSetup={() => game.reset()}
        onViewReplay={
          game.replayId
            ? () => navigate(`/play/${def.slug}/match-history/${game.replayId}`)
            : undefined
        }
      />
    );
  }

  return <GameBoard state={displayState} onAction={handleAction} />;
}
