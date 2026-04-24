import type { PandemicEvent } from "@boardgames/core/games/pandemic/machine";
import type {
  GameAction,
  GameResult,
  GameState,
  SetupConfig,
} from "@boardgames/core/games/pandemic/types";
import { useCallback, useEffect, useState } from "react";
import { useGameShell } from "../../hooks/useGameShell";
import GameCanvas from "./components/GameCanvas";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";
import { type GameAssets, loadGameAssets } from "./rendering/sprites";

export default function Pandemic() {
  const [mpDifficulty, setMpDifficulty] = useState<4 | 5 | 6>(4);

  const shell = useGameShell<GameState, PandemicEvent, GameResult | null>("pandemic", {
    renderLobbyContent: (mp) =>
      mp.isHost ? (
        <div className="mx-auto mb-4 w-full max-w-md">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
            Difficulty
          </div>
          <div className="flex gap-2">
            {([4, 5, 6] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setMpDifficulty(d)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  mpDifficulty === d
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-gray-700/60 bg-gray-800/30 text-gray-400 hover:border-gray-600"
                }`}
              >
                {d === 4 ? "Intro" : d === 5 ? "Standard" : "Heroic"}
              </button>
            ))}
          </div>
        </div>
      ) : null,
    getLobbyStartConfig: () => ({ difficulty: mpDifficulty }),
  });

  // --- Asset loading ---

  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // --- Game-specific state ---

  const [lastConfig, setLastConfig] = useState<SetupConfig | null>(null);

  // --- Back overrides for solo & mp-playing ---

  useEffect(() => {
    if (shell.mode === "solo" || shell.mode === "mp-playing") {
      shell.setBackOverride(shell.goToMenu);
      return () => shell.setBackOverride(null);
    }
    return undefined;
  }, [shell.mode, shell.goToMenu, shell.setBackOverride]);

  // --- Callbacks ---

  const handleStart = useCallback(
    (config: SetupConfig) => {
      setLastConfig(config);
      shell.game.start({ config });
    },
    [shell.game.start],
  );

  const handleRestart = useCallback(() => {
    if (lastConfig) {
      shell.game.start({ config: lastConfig });
    }
  }, [lastConfig, shell.game.start]);

  const dispatch = useCallback(
    (action: GameAction | { kind: "start_game"; config: SetupConfig } | { kind: "reset" }) => {
      if (action.kind === "start_game") {
        setLastConfig(action.config);
        shell.game.start({ config: action.config });
        return;
      }
      if (action.kind === "reset") {
        shell.goToMenu();
        return;
      }
      if (shell.mode === "mp-playing") {
        shell.mp.send({ type: "PLAYER_ACTION", action } as PandemicEvent);
      } else {
        shell.game.send({ type: "PLAYER_ACTION", action } as PandemicEvent);
      }
    },
    [shell.game.start, shell.game.send, shell.mp.send, shell.mode, shell.goToMenu],
  );

  // --- Rendering ---

  // Shell screens (menu, join, lobby) don't need assets
  if (shell.screen) return shell.screen;

  // Solo setup doesn't need assets either
  if (shell.mode === "solo" && !shell.game.view) {
    return <SetupScreen onStart={handleStart} />;
  }

  // From here on, we need assets loaded
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

  // Solo playing
  if (shell.mode === "solo" && shell.game.view) {
    if (shell.game.view.phase === "game_over") {
      return (
        <GameOverScreen state={shell.game.view} onRestart={handleRestart} onMenu={shell.goToMenu} />
      );
    }
    return <GameCanvas state={shell.game.view} dispatch={dispatch} assets={assets} />;
  }

  // Multiplayer playing
  if (shell.mode === "mp-playing" && shell.mp.view) {
    if (shell.mp.view.phase === "game_over") {
      return (
        <GameOverScreen state={shell.mp.view} onRestart={shell.goToMenu} onMenu={shell.goToMenu} />
      );
    }
    return <GameCanvas state={shell.mp.view} dispatch={dispatch} assets={assets} />;
  }

  return null;
}
