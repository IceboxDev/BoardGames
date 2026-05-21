import type { PandemicEvent } from "@boardgames/core/games/pandemic/machine";
import type {
  GameAction,
  GameResult,
  GameState,
  SetupConfig,
} from "@boardgames/core/games/pandemic/types";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

export default function Pandemic({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<GameState, PandemicEvent, GameResult | null>();

  const [lastConfig, setLastConfig] = useState<SetupConfig | null>(null);

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const handleStart = useCallback(
    (config: SetupConfig) => {
      setLastConfig(config);
      game.start({ config });
    },
    [game.start],
  );

  const handleRestart = useCallback(() => {
    if (lastConfig) game.start({ config: lastConfig });
  }, [lastConfig, game.start]);

  // Dispatch contract unchanged: `start_game` / `reset` are meta actions
  // routed back into navigation / session, everything else is forwarded
  // to the active session (solo or mp).
  const dispatch = useCallback(
    (action: GameAction | { kind: "start_game"; config: SetupConfig } | { kind: "reset" }) => {
      if (action.kind === "start_game") {
        setLastConfig(action.config);
        game.start({ config: action.config });
        return;
      }
      if (action.kind === "reset") {
        backToMenu();
        return;
      }
      if (source === "mp") {
        mp.send({ type: "PLAYER_ACTION", action } as PandemicEvent);
      } else {
        game.send({ type: "PLAYER_ACTION", action } as PandemicEvent);
      }
    },
    [source, game.start, game.send, mp.send, backToMenu],
  );

  if (source === "solo" && !game.view) {
    return <SetupScreen onStart={handleStart} />;
  }

  if (source === "solo" && game.view) {
    if (game.view.phase === "game_over") {
      return <GameOverScreen state={game.view} onRestart={handleRestart} onMenu={backToMenu} />;
    }
    return <GameBoard state={game.view} dispatch={dispatch} />;
  }

  if (source === "mp" && mp.view) {
    if (mp.view.phase === "game_over") {
      return <GameOverScreen state={mp.view} onRestart={backToMenu} onMenu={backToMenu} />;
    }
    return <GameBoard state={mp.view} dispatch={dispatch} />;
  }

  return null;
}
