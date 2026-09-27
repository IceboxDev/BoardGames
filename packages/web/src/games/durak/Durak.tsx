import type { Action, DurakPlayerView, DurakResult } from "@boardgames/core/games/durak/types";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

interface DurakSetup {
  playerCount: number;
  strategy: string;
}

const toSoloStart = ({ playerCount, strategy }: DurakSetup): SoloStart => ({
  seats: againstAi(playerCount, strategy),
});

export default function Durak({ source }: GameComponentProps) {
  const flow = useSessionFlow<DurakPlayerView, Action, DurakResult, DurakSetup>(source, {
    toSoloStart,
  });

  if (flow.phase === "setup") {
    return (
      <SetupScreen onStart={(playerCount, strategy) => flow.start({ playerCount, strategy })} />
    );
  }
  if (!flow.view) return <BoardFallback />;

  if (flow.phase === "finished") {
    return (
      <GameOverScreen
        view={flow.view}
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
