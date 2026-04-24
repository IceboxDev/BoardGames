import { tournamentGameLogToHumanReadable } from "@boardgames/core/games/lost-cities/human-export";
import type {
  LostCitiesEvent,
  LostCitiesPlayerView,
  LostCitiesResult,
} from "@boardgames/core/games/lost-cities/machine";
import type { TournamentGameLog } from "@boardgames/core/games/lost-cities/tournament-log";
import type {
  AIEngine,
  Card,
  ExpeditionColor,
  GamePhase,
} from "@boardgames/core/games/lost-cities/types";
import { AI_ENGINE_LABELS } from "@boardgames/core/games/lost-cities/types";
import { useCallback, useEffect, useState } from "react";
import { ActionLog } from "../../components/action-log";
import { MpGameOverScreen } from "../../components/game-over";
import { MatchHistory } from "../../components/match-history";
import { useGameShell } from "../../hooks/useGameShell";
import { apiClient } from "../../lib/api-client";
import type { BoardState } from "./components/GameBoard";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import GameReplay from "./components/GameReplay";
import SetupScreen from "./components/SetupScreen";
import { mapLostCitiesLog } from "./log-mapper";

function viewToBoardState(view: LostCitiesPlayerView): BoardState {
  return {
    expeditions: [view.playerExpeditions, view.opponentExpeditions],
    discardPiles: view.discardPiles,
    drawPileCount: view.drawPileCount,
    currentPlayer: view.currentPlayer,
    turnPhase: view.turnPhase,
    phase: view.phase as GamePhase,
    lastDiscardedColor: view.lastDiscardedColor,
    turnCount: view.turnCount,
  };
}

export default function LostCities() {
  const [replayGame, setReplayGame] = useState<TournamentGameLog | null>(null);

  const shell = useGameShell<LostCitiesPlayerView, LostCitiesEvent, LostCitiesResult>(
    "lost-cities",
    {
      tournamentExportLogFn: (g) => tournamentGameLogToHumanReadable(g as TournamentGameLog),
      tournamentOnSelectGame: (g) => setReplayGame(g as TournamentGameLog),
    },
  );

  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [lastEngine, setLastEngine] = useState<AIEngine>("ismcts-v4");

  // Back overrides for game-specific sub-navigation
  useEffect(() => {
    if (replayGame) {
      shell.setBackOverride(() => setReplayGame(null));
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "match-history") {
      shell.setBackOverride(() => shell.goToMenu());
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "solo") {
      shell.setBackOverride(() => shell.goToMenu());
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "mp-playing") {
      shell.setBackOverride(() => shell.goToMenu());
      return () => shell.setBackOverride(null);
    }
    shell.setBackOverride(null);
    return undefined;
  }, [replayGame, shell.mode, shell.setBackOverride, shell.goToMenu]);

  const startGame = useCallback(
    (engine: AIEngine) => {
      setLastEngine(engine);
      setSelectedCardId(null);
      shell.game.start({ aiEngine: engine });
    },
    [shell.game.start],
  );

  const handleSelectCard = useCallback((card: Card) => {
    setSelectedCardId((prev) => (prev === card.id ? null : card.id));
  }, []);

  // Shared action handlers — work for both solo and multiplayer
  const activeGame = shell.mode === "mp-playing" ? shell.mp : shell.game;

  const handlePlayToExpedition = useCallback(() => {
    if (!activeGame.view || selectedCardId == null) return;
    activeGame.send({ type: "PLAY_TO_EXPEDITION", cardId: selectedCardId });
    setSelectedCardId(null);
  }, [activeGame.view, activeGame.send, selectedCardId]);

  const handleDiscard = useCallback(() => {
    if (!activeGame.view || selectedCardId == null) return;
    activeGame.send({ type: "DISCARD", cardId: selectedCardId });
    setSelectedCardId(null);
  }, [activeGame.view, activeGame.send, selectedCardId]);

  const handleDrawFromPile = useCallback(() => {
    activeGame.send({ type: "DRAW_FROM_PILE" });
  }, [activeGame.send]);

  const handleDrawFromDiscard = useCallback(
    (color: ExpeditionColor) => {
      activeGame.send({ type: "DRAW_FROM_DISCARD", color });
    },
    [activeGame.send],
  );

  // --- Shell-handled screens (menu, mp-join, mp-lobby) ---

  if (shell.screen) return shell.screen;

  // --- Subscreen routing ---

  if (replayGame) {
    return <GameReplay game={replayGame} />;
  }

  if (shell.mode === "match-history") {
    return (
      <MatchHistory
        gameSlug="lost-cities"
        labelResolver={(e) => AI_ENGINE_LABELS[e as AIEngine] ?? e}
        onBack={() => shell.goToMenu()}
        onSelectGame={(g) => setReplayGame(g as TournamentGameLog)}
      />
    );
  }

  // --- Solo: setup ---

  if (shell.mode === "solo" && !shell.game.view) {
    return <SetupScreen onSelect={startGame} />;
  }

  // --- Game over (solo) ---

  if (shell.mode === "solo" && shell.game.result) {
    return (
      <GameOverScreen
        scores={shell.game.result.scores}
        aiEngine={lastEngine}
        onPlayAgain={() => startGame(lastEngine)}
        onChangeAI={() => {
          shell.game.reset();
        }}
        onViewReplay={
          shell.game.replayId
            ? () => {
                const id = shell.game.replayId;
                if (!id) return;
                apiClient.getGameReplay("lost-cities", id).then((log) => {
                  setReplayGame(log as TournamentGameLog);
                });
              }
            : undefined
        }
      />
    );
  }

  // --- Game over (multiplayer) ---

  if (shell.mode === "mp-playing" && shell.mp.result) {
    const isWinner =
      shell.mp.result.winner === "draw" ? null : shell.mp.result.winner === shell.mp.playerIndex;
    return (
      <MpGameOverScreen
        headline={isWinner === null ? "Draw!" : isWinner ? "You Win!" : "You Lose!"}
        headlineColor={isWinner === null ? "draw" : isWinner ? "win" : "lose"}
        subtitle={`${shell.mp.result.scores[0].total} — ${shell.mp.result.scores[1].total}`}
        onBackToMenu={() => shell.goToMenu()}
      />
    );
  }

  // --- Active game board ---

  const view = shell.mode === "mp-playing" ? shell.mp.view : shell.game.view;
  if (!view) return null;

  const displayState = viewToBoardState(view);
  const isMyTurn = shell.mode === "mp-playing" ? shell.mp.isMyTurn : shell.game.isMyTurn;
  const logPlayerNames: [string, string] | undefined =
    shell.mode === "mp-playing" && shell.mp.roomState
      ? (() => {
          const myIdx = shell.mp.playerIndex;
          const oppIdx = 1 - myIdx;
          const oppName = shell.mp.roomState.slots[oppIdx]?.playerName ?? "Opponent";
          return ["You", oppName];
        })()
      : undefined;

  return (
    <GameBoard
      state={displayState}
      hand={view.playerHand}
      selectedCardId={isMyTurn ? selectedCardId : null}
      isMultiplayer={shell.mode === "mp-playing"}
      onSelectCard={handleSelectCard}
      onPlayToExpedition={handlePlayToExpedition}
      onDiscard={handleDiscard}
      onDrawFromPile={handleDrawFromPile}
      onDrawFromDiscard={handleDrawFromDiscard}
      sidebar={<ActionLog blocks={mapLostCitiesLog(view.actionLog ?? [], logPlayerNames)} />}
      isWaiting={shell.mode === "mp-playing" && !isMyTurn}
    />
  );
}
