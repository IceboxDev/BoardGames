import type { PandemicEvent } from "@boardgames/core/games/pandemic/machine";
import type {
  GameAction,
  GameResult,
  GameState,
  SetupConfig,
} from "@boardgames/core/games/pandemic/types";
import { useCallback, useEffect, useState } from "react";
import { Chip } from "../../components/ui/Chip";
import { useGameShell } from "../../hooks/useGameShell";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

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
              <Chip
                key={d}
                pressed={mpDifficulty === d}
                tone="emerald"
                variant="outlined"
                size="md"
                block
                onClick={() => setMpDifficulty(d)}
                className="flex-1"
              >
                {d === 4 ? "Intro" : d === 5 ? "Standard" : "Heroic"}
              </Chip>
            ))}
          </div>
        </div>
      ) : null,
    getLobbyStartConfig: () => ({ difficulty: mpDifficulty }),
  });

  const [lastConfig, setLastConfig] = useState<SetupConfig | null>(null);

  // Back-button override while the game is in play. Goes to the mode-select
  // shell screen rather than out of the route, so the user can rejoin or
  // start a new game without losing their place in the app.
  useEffect(() => {
    if (shell.mode === "solo" || shell.mode === "mp-playing") {
      shell.setBackOverride(shell.goToMenu);
      return () => shell.setBackOverride(null);
    }
    return undefined;
  }, [shell.mode, shell.goToMenu, shell.setBackOverride]);

  const handleStart = useCallback(
    (config: SetupConfig) => {
      setLastConfig(config);
      shell.game.start({ config });
    },
    [shell.game.start],
  );

  const handleRestart = useCallback(() => {
    if (lastConfig) shell.game.start({ config: lastConfig });
  }, [lastConfig, shell.game.start]);

  // Dispatch contract is unchanged from the canvas era — `start_game` /
  // `reset` are meta actions routed back into the shell, everything else
  // is forwarded to the active session (solo or mp).
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

  if (shell.screen) return shell.screen;

  if (shell.mode === "solo" && !shell.game.view) {
    return <SetupScreen onStart={handleStart} />;
  }

  if (shell.mode === "solo" && shell.game.view) {
    if (shell.game.view.phase === "game_over") {
      return (
        <GameOverScreen state={shell.game.view} onRestart={handleRestart} onMenu={shell.goToMenu} />
      );
    }
    return <GameBoard state={shell.game.view} dispatch={dispatch} />;
  }

  if (shell.mode === "mp-playing" && shell.mp.view) {
    if (shell.mp.view.phase === "game_over") {
      return (
        <GameOverScreen state={shell.mp.view} onRestart={shell.goToMenu} onMenu={shell.goToMenu} />
      );
    }
    return <GameBoard state={shell.mp.view} dispatch={dispatch} />;
  }

  return null;
}
