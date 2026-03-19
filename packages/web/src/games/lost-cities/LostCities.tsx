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
import { emptyDiscardPiles, emptyExpeditions } from "@boardgames/core/games/lost-cities/types";
import { useCallback, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { useRemoteGame } from "../../hooks/useRemoteGame";
import { apiClient } from "../../lib/api-client";
import ActionLog from "./components/ActionLog";
import AISelect from "./components/AISelect";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import GameReplay from "./components/GameReplay";
import MatchHistory from "./components/MatchHistory";
import TournamentGrid from "./components/TournamentGrid";
import TournamentMatchHistory from "./components/TournamentMatchHistory";

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
  useDocumentTitle("Lost Cities - Board Games");

  const game = useRemoteGame<LostCitiesPlayerView, LostCitiesEvent, LostCitiesResult>(
    "lost-cities",
  );

  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [showTournament, setShowTournament] = useState(false);
  const [showMatchHistory, setShowMatchHistory] = useState(false);
  const [matchHistoryPair, setMatchHistoryPair] = useState<{
    aId: string;
    bId: string;
    tournamentId: string;
  } | null>(null);
  const [replayGame, setReplayGame] = useState<TournamentGameLog | null>(null);
  const [lastEngine, setLastEngine] = useState<AIEngine>("ismcts-v4");

  const startGame = useCallback(
    (engine: AIEngine) => {
      setLastEngine(engine);
      setSelectedCardId(null);
      game.start({ aiEngine: engine });
    },
    [game.start],
  );

  const handleSelectCard = useCallback((card: Card) => {
    setSelectedCardId((prev) => (prev === card.id ? null : card.id));
  }, []);

  const handlePlayToExpedition = useCallback(() => {
    if (!game.view || selectedCardId == null) return;
    game.send({ type: "PLAY_TO_EXPEDITION", cardId: selectedCardId });
    setSelectedCardId(null);
  }, [game.view, game.send, selectedCardId]);

  const handleDiscard = useCallback(() => {
    if (!game.view || selectedCardId == null) return;
    game.send({ type: "DISCARD", cardId: selectedCardId });
    setSelectedCardId(null);
  }, [game.view, game.send, selectedCardId]);

  const handleDrawFromPile = useCallback(() => {
    game.send({ type: "DRAW_FROM_PILE" });
  }, [game.send]);

  const handleDrawFromDiscard = useCallback(
    (color: ExpeditionColor) => {
      game.send({ type: "DRAW_FROM_DISCARD", color });
    },
    [game.send],
  );

  if (replayGame) {
    return <GameReplay game={replayGame} onBack={() => setReplayGame(null)} />;
  }

  if (showMatchHistory) {
    return (
      <MatchHistory
        onBack={() => setShowMatchHistory(false)}
        onSelectGame={(g) => setReplayGame(g)}
      />
    );
  }

  if (matchHistoryPair) {
    return (
      <TournamentMatchHistory
        strategyAId={matchHistoryPair.aId}
        strategyBId={matchHistoryPair.bId}
        tournamentId={matchHistoryPair.tournamentId}
        onBack={() => setMatchHistoryPair(null)}
        onSelectGame={(g) => setReplayGame(g)}
      />
    );
  }

  if (showTournament) {
    return (
      <TournamentGrid
        onBack={() => setShowTournament(false)}
        onViewMatchHistory={(aId, bId, tournamentId) =>
          setMatchHistoryPair({ aId, bId, tournamentId })
        }
      />
    );
  }

  if (!game.view) {
    return (
      <AISelect
        onSelect={startGame}
        onViewTournament={() => setShowTournament(true)}
        onViewMatchHistory={() => setShowMatchHistory(true)}
      />
    );
  }

  if (game.result) {
    return (
      <div className="mx-auto max-w-3xl px-6">
        <GameOverScreen
          scores={game.result.scores}
          aiEngine={lastEngine}
          onPlayAgain={() => startGame(lastEngine)}
          onChangeAI={() => game.reset()}
          onViewReplay={
            game.replayId
              ? () => {
                  apiClient.getGameReplay("lost-cities", game.replayId!).then((log) => {
                    setReplayGame(log as TournamentGameLog);
                  });
                }
              : undefined
          }
        />
      </div>
    );
  }

  const displayState = viewToGameState(game.view);

  return (
    <div className="w-full h-[calc(100vh-3.5rem)] overflow-hidden px-4 py-2 flex items-start">
      <div className="hidden xl:block w-56 shrink-0" />

      <div className="flex-1 min-w-0 max-w-2xl mx-auto h-full">
        <GameBoard
          state={displayState}
          selectedCardId={selectedCardId}
          onSelectCard={handleSelectCard}
          onPlayToExpedition={handlePlayToExpedition}
          onDiscard={handleDiscard}
          onDrawFromPile={handleDrawFromPile}
          onDrawFromDiscard={handleDrawFromDiscard}
        />
      </div>

      <aside className="hidden xl:flex w-56 shrink-0 ml-4 h-full rounded-lg border border-gray-800 bg-gray-900/70 backdrop-blur-sm flex-col overflow-hidden">
        <ActionLog entries={game.view?.actionLog ?? []} />
      </aside>
    </div>
  );
}
