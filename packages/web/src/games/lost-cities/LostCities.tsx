import type {
  LostCitiesEvent,
  LostCitiesPlayerView,
  LostCitiesResult,
} from "@boardgames/core/games/lost-cities/machine";
import type {
  AIEngine,
  Card,
  ExpeditionColor,
  GamePhase,
} from "@boardgames/core/games/lost-cities/types";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ActionLog } from "../../components/action-log";
import { MpGameOverScreen } from "../../components/game-over";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import type { BoardState } from "./components/GameBoard";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
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

/**
 * Lost Cities top-level playable component. Mounted by the shell at
 * `/play/lost-cities/solo` (with `source="solo"`) and
 * `/play/lost-cities/mp/play/:roomCode` (with `source="mp"`). The same
 * file handles both so the shared action handlers (`handlePlay`,
 * `handleDiscard`, etc.) stay in one place; the prop just switches the
 * source of `view` / `result` between the solo and mp projections of
 * the shared `useGameSession`.
 *
 * "View Replay" from the solo game-over screen navigates to
 * `/play/lost-cities/match-history/:replayId`, which lives in
 * `<MatchHistoryReplayRoute>`. That keeps a single URL contract for
 * "viewing one replay" regardless of whether the user arrived from the
 * match-history list, the tournament details, or the solo finish.
 */
export default function LostCities({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<LostCitiesPlayerView, LostCitiesEvent, LostCitiesResult>();

  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
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

  // Shared action handlers — switch source based on which route mounted us.
  const active = source === "mp" ? mp : game;

  const handlePlayToExpedition = useCallback(() => {
    if (!active.view || selectedCardId == null) return;
    active.send({ type: "PLAY_TO_EXPEDITION", cardId: selectedCardId });
    setSelectedCardId(null);
  }, [active.view, active.send, selectedCardId]);

  const handleDiscard = useCallback(() => {
    if (!active.view || selectedCardId == null) return;
    active.send({ type: "DISCARD", cardId: selectedCardId });
    setSelectedCardId(null);
  }, [active.view, active.send, selectedCardId]);

  const handleDrawFromPile = useCallback(() => {
    active.send({ type: "DRAW_FROM_PILE" });
  }, [active.send]);

  const handleDrawFromDiscard = useCallback(
    (color: ExpeditionColor) => {
      active.send({ type: "DRAW_FROM_DISCARD", color });
    },
    [active.send],
  );

  // Explicit "back to menu" navigation. Resets the active session so the
  // server drops the seat / session — distinct from the Layout's top-nav
  // back button, which is pure URL navigation and leaves the session
  // intact in case the user wants to come back.
  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  // --- Solo: setup ---

  if (source === "solo" && !game.view && !game.result) {
    return <SetupScreen onSelect={startGame} />;
  }

  // --- Solo: game over ---

  if (source === "solo" && game.result) {
    return (
      <GameOverScreen
        scores={game.result.scores}
        aiEngine={lastEngine}
        onPlayAgain={() => startGame(lastEngine)}
        onChangeAI={() => game.reset()}
        onViewReplay={
          game.replayId
            ? () => navigate(`/play/${def.slug}/match-history/${game.replayId}`)
            : undefined
        }
      />
    );
  }

  // --- Multiplayer: game over ---

  if (source === "mp" && mp.result) {
    const isWinner = mp.result.winner === "draw" ? null : mp.result.winner === mp.playerIndex;
    return (
      <MpGameOverScreen
        headline={isWinner === null ? "Draw!" : isWinner ? "You Win!" : "You Lose!"}
        headlineColor={isWinner === null ? "draw" : isWinner ? "win" : "lose"}
        subtitle={`${mp.result.scores[0].total} — ${mp.result.scores[1].total}`}
        onBackToMenu={backToMenu}
      />
    );
  }

  // --- Active game board ---

  const view = active.view;
  if (!view) return null;

  const displayState = viewToBoardState(view);
  const isMyTurn = active.isMyTurn;
  const logPlayerNames: [string, string] | undefined =
    source === "mp" && mp.roomState
      ? (() => {
          const myIdx = mp.playerIndex;
          const oppIdx = 1 - myIdx;
          const oppName = mp.roomState.slots[oppIdx]?.playerName ?? "Opponent";
          return ["You", oppName];
        })()
      : undefined;

  return (
    <GameBoard
      state={displayState}
      hand={view.playerHand}
      selectedCardId={isMyTurn ? selectedCardId : null}
      isMultiplayer={source === "mp"}
      onSelectCard={handleSelectCard}
      onPlayToExpedition={handlePlayToExpedition}
      onDiscard={handleDiscard}
      onDrawFromPile={handleDrawFromPile}
      onDrawFromDiscard={handleDrawFromDiscard}
      sidebar={<ActionLog blocks={mapLostCitiesLog(view.actionLog ?? [], logPlayerNames)} />}
      isWaiting={source === "mp" && !isMyTurn}
    />
  );
}
