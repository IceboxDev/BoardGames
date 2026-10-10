import type { DuetConfig } from "@boardgames/core/games/codenames-duet/manifest";
import type {
  DuetAction,
  DuetPlayerView,
  DuetResult,
} from "@boardgames/core/games/codenames-duet/types";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type DuetSetup } from "./components/SetupScreen";

function toSoloStart({ modelId, ...options }: DuetSetup): SoloStart {
  const config: DuetConfig = options;
  return { seats: [{ kind: "human" }, { kind: "ai", strategy: modelId }], config };
}

export default function Duet({ source }: GameComponentProps) {
  const flow = useSessionFlow<DuetPlayerView, DuetAction, DuetResult, DuetSetup>(source, {
    toSoloStart,
  });
  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!flow.view) return <BoardFallback />;
  const names = flow.seats.map((s) => (source === "mp" && s.kind === "human" ? s.name : null));
  if (flow.phase === "finished")
    return <GameOverScreen view={flow.view} names={names} actions={flow.endActions} />;
  return <GameBoard view={flow.view} names={names} onAction={flow.sendAction} error={flow.error} />;
}
