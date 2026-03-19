import type { PandemicEvent } from "@boardgames/core/games/pandemic/machine";
import type {
  GameAction,
  GameResult,
  GameState,
  SetupConfig,
} from "@boardgames/core/games/pandemic/types";
import { useCallback, useEffect, useState } from "react";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { useRemoteGame } from "../../hooks/useRemoteGame";
import GameCanvas from "./components/GameCanvas";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";
import { type GameAssets, loadGameAssets } from "./rendering/sprites";

export default function Pandemic() {
  useDocumentTitle("Pandemic - Board Games");

  const game = useRemoteGame<GameState, PandemicEvent, GameResult | null>("pandemic");
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastConfig, setLastConfig] = useState<SetupConfig | null>(null);

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

  const handleStart = useCallback(
    (config: SetupConfig) => {
      setLastConfig(config);
      game.start({ config });
    },
    [game.start],
  );

  const handleRestart = useCallback(() => {
    if (lastConfig) {
      game.start({ config: lastConfig });
    }
  }, [lastConfig, game.start]);

  const dispatch = useCallback(
    (
      action:
        | GameAction
        | { kind: "start_game"; config: SetupConfig }
        | { kind: "reset" }
        | { kind: "animate_complete" },
    ) => {
      if (action.kind === "start_game") {
        setLastConfig(action.config);
        game.start({ config: action.config });
        return;
      }
      if (action.kind === "reset") {
        game.reset();
        return;
      }
      if (action.kind === "animate_complete") {
        // Server handles automated phases; no-op on client
        return;
      }
      game.send({ type: "PLAYER_ACTION", action } as PandemicEvent);
    },
    [game.start, game.reset, game.send],
  );

  if (loadError) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center text-red-400">
        <div className="text-center">
          <div className="mb-2 text-lg font-bold">Failed to load game assets</div>
          <div className="text-sm">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!assets) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center text-gray-400">
        Loading board...
      </div>
    );
  }

  if (!game.view) {
    return <SetupScreen onStart={handleStart} />;
  }

  if (game.view.phase === "game_over") {
    return (
      <GameOverScreen state={game.view} onRestart={handleRestart} onMenu={() => game.reset()} />
    );
  }

  return <GameCanvas state={game.view} dispatch={dispatch} assets={assets} />;
}
