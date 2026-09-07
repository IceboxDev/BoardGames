import type { SensoEvent } from "@boardgames/core/games/senso-battle-for-japan/machine";
import type {
  Action,
  AIStrategyId,
  SensoPlayerView,
  SensoResult,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import type { GameComponentProps } from "../types";
import "./senso.css";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

interface SoloSetup {
  playerCount: number;
  strategy: AIStrategyId;
}

export default function Senso({ source }: GameComponentProps) {
  const navigate = useNavigate();
  const { def, game, mp } = useGameShell<SensoPlayerView, SensoEvent, SensoResult, Action>();
  const [lastSetup, setLastSetup] = useState<SoloSetup | null>(null);
  // The final view arrives with the game-over message; keep it for the summary.
  const lastViewRef = useRef<SensoPlayerView | null>(null);

  const active = source === "mp" ? mp : game;
  if (active.view) lastViewRef.current = active.view;

  const backToMenu = useCallback(() => {
    if (source === "mp") mp.reset();
    else game.reset();
    navigate(`/play/${def.slug}`);
  }, [source, mp.reset, game.reset, def.slug, navigate]);

  const startGame = useCallback(
    (playerCount: number, strategy: AIStrategyId) => {
      setLastSetup({ playerCount, strategy });
      const strategies: (AIStrategyId | null)[] = [null];
      for (let i = 1; i < playerCount; i++) strategies.push(strategy);
      game.start({ playerCount, strategies });
    },
    [game.start],
  );

  const handleAction = useCallback(
    (action: Action) => {
      const event: SensoEvent = { type: "PLAYER_ACTION", action };
      if (source === "mp") mp.send(event);
      else game.send(event);
    },
    [source, game.send, mp.send],
  );

  // Seat display names: room slots mapped through seatOrder (the host may
  // have swapped seats). Solo has none — the board labels seats by faction.
  const playerNames = useMemo(() => {
    const names: (string | null)[] = [];
    if (source === "mp" && mp.roomState) {
      mp.roomState.slots.forEach((slot, i) => {
        const seat = mp.roomState?.seatOrder?.[i] ?? i;
        names[seat] = slot.kind === "human" ? (slot.playerName ?? null) : null;
      });
    }
    return names;
  }, [source, mp.roomState]);

  if (source === "solo" && !game.view) {
    return <SetupScreen onStart={startGame} />;
  }

  const view = active.view ?? lastViewRef.current;
  if (!view) return null;

  if (active.result) {
    return (
      <GameOverScreen
        view={view}
        result={active.result}
        names={playerNames}
        onMenu={backToMenu}
        onPlayAgain={
          source === "solo" && lastSetup
            ? () => startGame(lastSetup.playerCount, lastSetup.strategy)
            : undefined
        }
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
