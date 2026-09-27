import type { PandemicConfig } from "@boardgames/core/games/pandemic/manifest";
import type {
  GameAction,
  GameResult,
  GameState,
  SetupConfig,
} from "@boardgames/core/games/pandemic/types";
import { BoardFallback } from "../../components/RouteFallback";
import { type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

/** Solo is one person holding every role: all seats human, all this player's. */
function toSoloStart({ numPlayers, difficulty }: SetupConfig): SoloStart {
  const config: PandemicConfig = { difficulty };
  return { seats: Array.from({ length: numPlayers }, () => ({ kind: "human" })), config };
}

export default function Pandemic({ source }: GameComponentProps) {
  const flow = useSessionFlow<GameState, GameAction, GameResult | null, SetupConfig>(source, {
    toSoloStart,
  });

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!flow.view) return <BoardFallback />;
  if (flow.phase === "finished") {
    return <GameOverScreen state={flow.view} actions={flow.endActions} />;
  }
  return <GameBoard state={flow.view} dispatch={flow.sendAction} />;
}
