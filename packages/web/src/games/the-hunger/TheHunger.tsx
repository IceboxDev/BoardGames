import type { HungerEvent } from "@boardgames/core/games/the-hunger/machine";
import type {
  Action,
  AIStrategyId,
  HungerPlayerView,
  HungerResult,
} from "@boardgames/core/games/the-hunger/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type SoloSetup } from "./components/SetupScreen";

export default function TheHunger({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<HungerPlayerView, HungerEvent, HungerResult, Action>();
  const [lastSetup, setLastSetup] = useState<SoloSetup | null>(null);
  const lastViewRef = useRef<HungerPlayerView | null>(null);

  const active = source === "mp" ? mp : game;
  if (active.view) lastViewRef.current = active.view;

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const startGame = useCallback(
    (setup: SoloSetup) => {
      setLastSetup(setup);
      const strategies: (AIStrategyId | null)[] = [null];
      for (let i = 1; i < setup.playerCount; i++) strategies.push(setup.strategy);
      game.start({
        playerCount: setup.playerCount,
        strategies,
        options: { mode: setup.mode, beginnerSafeMountains: setup.beginnerSafeMountains },
      });
    },
    [game.start],
  );

  const handleAction = useCallback(
    (action: Action) => {
      const event: HungerEvent = { type: "PLAYER_ACTION", action };
      if (source === "mp") mp.send(event);
      else game.send(event);
    },
    [source, game.send, mp.send],
  );

  const playerNames = useMemo(() => {
    const names: (string | null)[] = [];
    if (source === "mp" && mp.roomState) {
      // The server seats filled slots in slot order (open slots are skipped).
      let seat = 0;
      for (const slot of mp.roomState.slots) {
        if (slot.kind === "open") continue;
        names[seat++] = slot.kind === "human" ? (slot.playerName ?? null) : null;
      }
    }
    return names;
  }, [source, mp.roomState]);

  if (source === "solo" && !game.view) return <SetupScreen onStart={startGame} />;

  const view = active.view ?? lastViewRef.current;
  if (!view) return null;

  if (active.result) {
    return (
      <GameOverScreen
        view={view}
        result={active.result}
        names={playerNames}
        onMenu={backToMenu}
        onPlayAgain={source === "solo" && lastSetup ? () => startGame(lastSetup) : undefined}
      />
    );
  }

  return (
    <GameBoard
      view={view}
      legalActions={active.legalActions}
      isMyTurn={active.isMyTurn}
      isAiThinking={source === "mp" ? false : game.isAiThinking}
      playerNames={playerNames}
      onAction={handleAction}
    />
  );
}
