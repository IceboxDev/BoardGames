import { useCallback, useEffect, useRef, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import GameCanvas from "./components/GameCanvas";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";
import { useGameState } from "./hooks/useGameState";
import { saveGameResult } from "./logic/persistence";
import type { SetupConfig } from "./logic/types";
import { type GameAssets, loadGameAssets } from "./rendering/sprites";

export default function Pandemic() {
  useDocumentTitle("Pandemic - Board Games");

  const [state, dispatch] = useGameState();
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const savedRef = useRef(false);

  // Load assets
  useEffect(() => {
    let cancelled = false;

    loadGameAssets()
      .then((a) => {
        if (!cancelled) setAssets(a);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message ?? "Failed to load assets");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Save result on game over
  useEffect(() => {
    if (!state || !state.result || savedRef.current) return;
    savedRef.current = true;

    saveGameResult({
      date: new Date().toISOString(),
      result: state.result,
      turns: state.turnNumber,
      outbreaks: state.outbreakCount,
      difficulty: state.difficulty,
      numPlayers: state.players.length,
    });
  }, [state?.result, state?.difficulty, state?.outbreakCount, state?.players?.length, state]);

  const handleStart = useCallback(
    (config: SetupConfig) => {
      savedRef.current = false;
      dispatch({ kind: "start_game", config });
    },
    [dispatch],
  );

  const handleRestart = useCallback(() => {
    if (state) {
      savedRef.current = false;
      dispatch({
        kind: "start_game",
        config: {
          numPlayers: state.players.length as 2 | 3 | 4,
          difficulty: state.difficulty,
        },
      });
    }
  }, [dispatch, state]);

  const handleMenu = useCallback(() => {
    dispatch({ kind: "reset" });
  }, [dispatch]);

  // Loading screen
  if (loadError) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-surface-950 text-red-400">
        <div className="text-center">
          <div className="mb-2 text-lg font-bold">Failed to load game assets</div>
          <div className="text-sm">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!assets) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-surface-950 text-gray-400">
        Loading board...
      </div>
    );
  }

  // Setup screen
  if (!state) {
    return <SetupScreen onStart={handleStart} />;
  }

  // Game over screen
  if (state.phase === "game_over") {
    return <GameOverScreen state={state} onRestart={handleRestart} onMenu={handleMenu} />;
  }

  // Game canvas
  return <GameCanvas state={state} dispatch={dispatch} assets={assets} />;
}
