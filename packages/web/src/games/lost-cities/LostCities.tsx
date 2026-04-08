import { ALL_STRATEGIES } from "@boardgames/core/games/lost-cities/ai-strategies";
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
  GameState,
} from "@boardgames/core/games/lost-cities/types";
import {
  AI_ENGINE_LABELS,
  emptyDiscardPiles,
  emptyExpeditions,
} from "@boardgames/core/games/lost-cities/types";
import { useCallback, useEffect, useState } from "react";
import { HistorySidebar } from "../../components/action-log";
import { MpGameOverScreen } from "../../components/game-over";
import { MatchHistory } from "../../components/match-history";
import { TournamentGrid, TournamentMatchHistory } from "../../components/tournament";
import { WaitingIndicator } from "../../components/ui";
import { useGameShell } from "../../hooks/useGameShell";
import { apiClient } from "../../lib/api-client";
import ActionLog from "./components/ActionLog";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import GameReplay from "./components/GameReplay";
import SetupScreen from "./components/SetupScreen";

function viewToGameState(view: LostCitiesPlayerView): GameState {
  return {
    drawPile: new Array(view.drawPileCount).fill(null),
    discardPiles: view.discardPiles ?? emptyDiscardPiles(),
    expeditions: [
      view.playerExpeditions ?? emptyExpeditions(),
      view.opponentExpeditions ?? emptyExpeditions(),
    ],
    hands: [view.playerHand, new Array(view.opponentHandCount).fill(null)],
    currentPlayer: view.currentPlayer,
    turnPhase: view.turnPhase,
    phase: view.phase as GameState["phase"],
    lastDiscardedColor: view.lastDiscardedColor,
    turnCount: view.turnCount,
    knownOpponentCards: [[], []],
  };
}

export default function LostCities() {
  const shell = useGameShell<LostCitiesPlayerView, LostCitiesEvent, LostCitiesResult>(
    "lost-cities",
  );

  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [matchHistoryPair, setMatchHistoryPair] = useState<{
    aId: string;
    bId: string;
    tournamentId: string;
  } | null>(null);
  const [replayGame, setReplayGame] = useState<TournamentGameLog | null>(null);
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
    if (matchHistoryPair) {
      shell.setBackOverride(() => setMatchHistoryPair(null));
      return () => shell.setBackOverride(null);
    }
    if (shell.mode === "tournament") {
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
  }, [replayGame, matchHistoryPair, shell.mode, shell.setBackOverride, shell.goToMenu]);

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

  if (shell.mode === "tournament") {
    if (matchHistoryPair) {
      return (
        <TournamentMatchHistory
          strategies={ALL_STRATEGIES.map((s) => ({ id: s.id, label: s.label }))}
          strategyAId={matchHistoryPair.aId}
          strategyBId={matchHistoryPair.bId}
          tournamentId={matchHistoryPair.tournamentId}
          onBack={() => setMatchHistoryPair(null)}
          onSelectGame={(g) => setReplayGame(g as TournamentGameLog)}
          exportLogFn={(g) => tournamentGameLogToHumanReadable(g as TournamentGameLog)}
        />
      );
    }
    return (
      <TournamentGrid
        gameSlug="lost-cities"
        strategies={ALL_STRATEGIES.map((s) => ({ id: s.id, label: s.label }))}
        onViewMatchHistory={(aId, bId, tournamentId) =>
          setMatchHistoryPair({ aId, bId, tournamentId })
        }
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

  const displayState = viewToGameState(view);
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
    <HistorySidebar
      contentClassName="gap-2"
      sidebar={<ActionLog entries={view.actionLog ?? []} playerNames={logPlayerNames} />}
    >
      {shell.mode === "mp-playing" && !isMyTurn && <WaitingIndicator />}
      <div className="min-h-0 flex-1">
        <GameBoard
          state={displayState}
          selectedCardId={isMyTurn ? selectedCardId : null}
          isMultiplayer={shell.mode === "mp-playing"}
          onSelectCard={handleSelectCard}
          onPlayToExpedition={handlePlayToExpedition}
          onDiscard={handleDiscard}
          onDrawFromPile={handleDrawFromPile}
          onDrawFromDiscard={handleDrawFromDiscard}
        />
      </div>
    </HistorySidebar>
  );
}
