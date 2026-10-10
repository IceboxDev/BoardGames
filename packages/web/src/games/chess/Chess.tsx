import {
  type ChessAction,
  type ChessPlayerView,
  ChessPlayerViewSchema,
  type ChessResult,
} from "@boardgames/core/games/chess/schemas";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { useMemo } from "react";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type ChessSetup } from "./components/SetupScreen";

/** Seat 0 plays White, so "Black" puts the AI first. */
function toSoloStart(setup: ChessSetup): SoloStart {
  const color = setup.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : setup.color;
  const human: SeatRequest = { kind: "human" };
  const ai: SeatRequest = { kind: "ai", strategy: setup.strategy };
  return {
    seats: color === "w" ? [human, ai] : [ai, human],
    config: { timeControl: setup.timeControl, takebacks: setup.takebacks },
  };
}

/**
 * Chess, solo against Stockfish and in rooms. The board only ever offers the
 * moves the server listed; meta actions (offers, takebacks, resign) come from
 * the same list.
 */
export default function Chess({ source }: GameComponentProps) {
  const flow = useSessionFlow<unknown, ChessAction, ChessResult, ChessSetup>(source, {
    toSoloStart,
  });

  // The view crosses the wire as `unknown`; parse it rather than trust it.
  const view: ChessPlayerView | null = useMemo(() => {
    if (flow.view === null) return null;
    const parsed = ChessPlayerViewSchema.safeParse(flow.view);
    if (!parsed.success) console.error("[chess] bad view", parsed.error);
    return parsed.success ? parsed.data : null;
  }, [flow.view]);

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!view) return <BoardFallback />;

  const whiteSeat = view.seatColors.indexOf("w");
  const blackSeat = view.seatColors.indexOf("b");
  const names = {
    w: flow.seatNames[whiteSeat] ?? "White",
    b: flow.seatNames[blackSeat] ?? "Black",
  };

  if (flow.phase === "finished") {
    return (
      <GameOverScreen
        view={view}
        outcome={flow.outcome}
        seat={flow.seat}
        names={names}
        actions={flow.endActions}
      />
    );
  }

  return (
    <GameBoard
      view={view}
      color={view.color}
      names={names}
      legal={flow.legalActions}
      send={flow.sendAction}
    />
  );
}
