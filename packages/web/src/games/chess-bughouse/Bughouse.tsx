import {
  type BughouseAction,
  type BughousePlayerView,
  BughousePlayerViewSchema,
  type BughouseResult,
} from "@boardgames/core/games/chess-bughouse/schemas";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { useMemo } from "react";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import BughouseBoard from "./components/BughouseBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type BughouseSetup } from "./components/SetupScreen";

function toSoloStart(setup: BughouseSetup): SoloStart {
  const seats: SeatRequest[] = [0, 1, 2, 3].map((i) =>
    i === setup.seat ? { kind: "human" } : { kind: "ai", strategy: setup.strategy },
  );
  return { seats, config: { timeControl: setup.timeControl } };
}

/** Chess Bughouse: two boards, four seats, two teams — solo with bots, or in a room. */
export default function Bughouse({ source }: GameComponentProps) {
  const flow = useSessionFlow<unknown, BughouseAction, BughouseResult, BughouseSetup>(source, {
    toSoloStart,
  });
  const view: BughousePlayerView | null = useMemo(() => {
    if (flow.view === null) return null;
    const parsed = BughousePlayerViewSchema.safeParse(flow.view);
    if (!parsed.success) console.error("[bughouse] bad view", parsed.error);
    return parsed.success ? parsed.data : null;
  }, [flow.view]);

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!view) return <BoardFallback />;

  const names = [0, 1, 2, 3].map((i) =>
    i === view.seat ? "You" : (flow.seatNames[i] ?? "Player"),
  );

  if (flow.phase === "finished") {
    return (
      <GameOverScreen view={view} outcome={flow.outcome} names={names} actions={flow.endActions} />
    );
  }
  return (
    <BughouseBoard view={view} names={names} legal={flow.legalActions} send={flow.sendAction} />
  );
}
