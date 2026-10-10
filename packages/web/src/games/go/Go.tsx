import type { GoAction, GoPlayerView, GoResult } from "@boardgames/core/games/go/view";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type GoSoloSetup } from "./components/SetupScreen";
import { toConfig } from "./logic/options";

/** Seat 0 plays Black, so the colour choice is the seat order. */
function toSoloStart({ strategy, color, options }: GoSoloSetup): SoloStart {
  const black = color === "random" ? Math.random() < 0.5 : color === "black";
  const human: SeatRequest = { kind: "human" };
  const ai: SeatRequest = { kind: "ai", strategy };
  return { seats: black ? [human, ai] : [ai, human], config: toConfig(options) };
}

/** Go, solo against the AI ladder and in rooms. */
export default function Go({ source }: GameComponentProps) {
  const flow = useSessionFlow<GoPlayerView, GoAction, GoResult, GoSoloSetup>(source, {
    toSoloStart,
  });

  if (flow.phase === "setup") return <SetupScreen onStart={(setup) => flow.start(setup)} />;

  const view = flow.view;
  if (!view) return <BoardFallback />;
  const names = [0, 1].map((c) => flow.seatNames[c] ?? (c === 0 ? "Black" : "White"));

  if (flow.phase === "finished" && view.result) {
    return <GameOverScreen view={view} names={names} actions={flow.endActions} />;
  }

  return (
    <GameBoard
      view={view}
      legal={flow.legalActions}
      names={names}
      vsAi={view.players.some((p) => p !== null)}
      send={(action) => flow.sendAction(action)}
    />
  );
}
