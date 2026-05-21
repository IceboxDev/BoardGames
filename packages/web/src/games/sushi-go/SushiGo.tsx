import type { StrategyId } from "@boardgames/core/games/sushi-go/ai/strategy";
import type {
  SushiGoEvent,
  SushiGoPlayerView,
  SushiGoResult,
} from "@boardgames/core/games/sushi-go/machine";
import type { SushiGoAction } from "@boardgames/core/games/sushi-go/types";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

export default function SushiGo({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<SushiGoPlayerView, SushiGoEvent, SushiGoResult>();

  const [lastPlayerCount, setLastPlayerCount] = useState(3);
  const [lastStrategyId, setLastStrategyId] = useState<StrategyId>("nash");
  const [showResults, setShowResults] = useState(false);
  const lastViewRef = useRef<SushiGoPlayerView | null>(null);

  // Keep a snapshot of the last view so the game-over board can render
  // the final state while waiting for the user to click "See Results".
  if (game.view) lastViewRef.current = game.view;
  if (mp.view) lastViewRef.current = mp.view;

  const backToMenu = useCallback(() => {
    setShowResults(false);
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const handleSoloStart = useCallback(
    (playerCount: number, strategyId: StrategyId) => {
      setLastPlayerCount(playerCount);
      setLastStrategyId(strategyId);
      game.start({ playerCount, humanPlayers: [0], strategyId });
    },
    [game.start],
  );

  const handleSoloAction = useCallback(
    (action: SushiGoAction) => {
      game.send({ type: "PLAYER_ACTION", playerIndex: 0, action } as SushiGoEvent);
    },
    [game.send],
  );

  const handleMpAction = useCallback(
    (action: SushiGoAction) => {
      mp.send({ type: "PLAYER_ACTION", action } as SushiGoEvent);
    },
    [mp.send],
  );

  // --- Solo setup ---

  if (source === "solo" && !game.view) {
    return <SetupScreen onStart={handleSoloStart} />;
  }

  // --- Solo game over ---

  if (source === "solo" && game.result) {
    if (showResults) {
      return (
        <GameOverScreen
          result={game.result}
          myIndex={0}
          actionLog={lastViewRef.current?.actionLog ?? []}
          onMenu={backToMenu}
          onPlayAgain={() => {
            setShowResults(false);
            handleSoloStart(lastPlayerCount, lastStrategyId);
          }}
        />
      );
    }
    const view = game.view ?? lastViewRef.current;
    if (view) {
      return (
        <GameBoard
          view={view}
          myIndex={0}
          onAction={handleSoloAction}
          isGameOver
          onShowResults={() => setShowResults(true)}
        />
      );
    }
  }

  // --- Solo playing ---

  if (source === "solo" && game.view) {
    return <GameBoard view={game.view} myIndex={0} onAction={handleSoloAction} />;
  }

  // --- Multiplayer game over ---

  if (source === "mp" && mp.result) {
    if (showResults) {
      return (
        <GameOverScreen
          result={mp.result}
          myIndex={mp.playerIndex}
          actionLog={lastViewRef.current?.actionLog ?? []}
          onMenu={backToMenu}
        />
      );
    }
    const view = mp.view ?? lastViewRef.current;
    if (view) {
      return (
        <GameBoard
          view={view}
          myIndex={mp.playerIndex}
          onAction={handleMpAction}
          isGameOver
          onShowResults={() => setShowResults(true)}
        />
      );
    }
  }

  // --- Multiplayer playing ---

  if (source === "mp" && mp.view) {
    return <GameBoard view={mp.view} myIndex={mp.playerIndex} onAction={handleMpAction} />;
  }

  return null;
}
