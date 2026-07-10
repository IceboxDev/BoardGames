import type {
  SevenWondersEvent,
  SevenWondersPlayerView,
  SevenWondersResult,
} from "@boardgames/core/games/7-wonders/machine";
import type { SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

export default function SevenWonders({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<
    SevenWondersPlayerView,
    SevenWondersEvent,
    SevenWondersResult,
    SevenWondersAction
  >();

  const [lastPlayerCount, setLastPlayerCount] = useState(3);
  const [showResults, setShowResults] = useState(false);
  const lastViewRef = useRef<SevenWondersPlayerView | null>(null);

  if (game.view) lastViewRef.current = game.view;
  if (mp.view) lastViewRef.current = mp.view;

  const backToMenu = useCallback(() => {
    setShowResults(false);
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const handleSoloStart = useCallback(
    (playerCount: number) => {
      setLastPlayerCount(playerCount);
      game.start({ playerCount, humanPlayers: [0] });
    },
    [game.start],
  );

  const handleSoloAction = useCallback(
    (action: SevenWondersAction) => {
      game.send({ type: "PLAYER_ACTION", playerIndex: 0, action });
    },
    [game.send],
  );

  const handleMpAction = useCallback(
    (action: SevenWondersAction) => {
      // The server injects playerIndex for simultaneous play; send a
      // placeholder so the event parses as a SevenWondersEvent.
      mp.send({ type: "PLAYER_ACTION", playerIndex: -1, action });
    },
    [mp.send],
  );

  // --- Solo ---

  if (source === "solo" && !game.view && !game.result) {
    return <SetupScreen onStart={handleSoloStart} />;
  }

  if (source === "solo" && game.result) {
    if (showResults) {
      return (
        <GameOverScreen
          result={game.result}
          myIndex={0}
          onMenu={backToMenu}
          onPlayAgain={() => {
            setShowResults(false);
            handleSoloStart(lastPlayerCount);
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
          legalActions={[]}
          onAction={handleSoloAction}
          isGameOver
          onShowResults={() => setShowResults(true)}
        />
      );
    }
  }

  if (source === "solo" && game.view) {
    return (
      <GameBoard
        view={game.view}
        myIndex={0}
        legalActions={game.legalActions}
        onAction={handleSoloAction}
      />
    );
  }

  // --- Multiplayer ---

  if (source === "mp" && mp.result) {
    if (showResults) {
      return <GameOverScreen result={mp.result} myIndex={mp.playerIndex} onMenu={backToMenu} />;
    }
    const view = mp.view ?? lastViewRef.current;
    if (view) {
      return (
        <GameBoard
          view={view}
          myIndex={mp.playerIndex}
          legalActions={[]}
          onAction={handleMpAction}
          isGameOver
          onShowResults={() => setShowResults(true)}
        />
      );
    }
  }

  if (source === "mp" && mp.view) {
    return (
      <GameBoard
        view={mp.view}
        myIndex={mp.playerIndex}
        legalActions={mp.legalActions}
        onAction={handleMpAction}
      />
    );
  }

  return null;
}
