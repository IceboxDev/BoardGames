import type { Action, ParksPlayerView, ParksResult } from "@boardgames/core/games/parks/types";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

const toSoloStart = (strategy: string): SoloStart => ({ seats: againstAi(2, strategy) });

export default function Parks({ source }: GameComponentProps) {
  const flow = useSessionFlow<ParksPlayerView, Action, ParksResult, string>(source, {
    toSoloStart,
  });

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!flow.view) return <BoardFallback />;

  if (flow.phase === "finished" && flow.result) {
    return (
      <GameOverScreen
        view={flow.view}
        result={flow.result}
        playerIndex={flow.seat}
        seatNames={flow.seatNames}
        actions={flow.endActions}
      />
    );
  }

  return (
    <GameBoard
      view={flow.view}
      legalActions={flow.legalActions}
      playerIndex={flow.seat}
      isMyTurn={flow.isMyTurn}
      isAiThinking={flow.isAiThinking}
      onAction={flow.sendAction}
    />
  );
}
