import type { CodenamesConfig } from "@boardgames/core/games/codenames/manifest";
import type {
  CodenamesAction,
  CodenamesPlayerView,
  CodenamesResult,
} from "@boardgames/core/games/codenames/types";
import type { SeatRequest } from "@boardgames/core/machines/seats";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type CodenamesSetup } from "./components/SetupScreen";

/** You on Red (seat 0 spymaster, or seat 2 operative); every other seat AI. */
function toSoloStart({ role, players, modelId, ...options }: CodenamesSetup): SoloStart {
  const mySeat = role === "spymaster" ? 0 : 2;
  const seats: SeatRequest[] = Array.from({ length: players }, (_, seat) =>
    seat === mySeat ? { kind: "human" } : { kind: "ai", strategy: modelId },
  );
  const config: CodenamesConfig = options;
  return { seats, config };
}

export default function Codenames({ source }: GameComponentProps) {
  const flow = useSessionFlow<
    CodenamesPlayerView,
    CodenamesAction,
    CodenamesResult,
    CodenamesSetup
  >(source, { toSoloStart });

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!flow.view) return <BoardFallback />;

  // Rooms label people by name; AI seats (and solo) by their role.
  const names = flow.seats.map((s) => (source === "mp" && s.kind === "human" ? s.name : null));
  if (flow.phase === "finished")
    return <GameOverScreen view={flow.view} names={names} actions={flow.endActions} />;
  return <GameBoard view={flow.view} names={names} onAction={flow.sendAction} error={flow.error} />;
}
