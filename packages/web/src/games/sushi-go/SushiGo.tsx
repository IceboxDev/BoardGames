import type { SushiGoPlayerView, SushiGoResult } from "@boardgames/core/games/sushi-go/machine";
import type { SushiGoAction } from "@boardgames/core/games/sushi-go/types";
import { useState } from "react";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

interface SushiGoSetup {
  playerCount: number;
  strategy: string;
}

const toSoloStart = ({ playerCount, strategy }: SushiGoSetup): SoloStart => ({
  seats: againstAi(playerCount, strategy),
});

export default function SushiGo({ source }: GameComponentProps) {
  const flow = useSessionFlow<SushiGoPlayerView, SushiGoAction, SushiGoResult, SushiGoSetup>(
    source,
    { toSoloStart },
  );
  // The final board stays up until the player asks for the results.
  const [showResults, setShowResults] = useState(false);

  if (flow.phase === "setup") {
    return (
      <SetupScreen
        onStart={(playerCount, strategy) => {
          setShowResults(false);
          flow.start({ playerCount, strategy });
        }}
      />
    );
  }
  if (!flow.view) return <BoardFallback />;

  if (flow.phase === "finished" && flow.result) {
    if (showResults) {
      return (
        <GameOverScreen
          result={flow.result}
          myIndex={flow.seat}
          actionLog={flow.view.actionLog}
          actions={flow.endActions.map((a) => ({
            ...a,
            onClick: () => {
              setShowResults(false);
              a.onClick();
            },
          }))}
        />
      );
    }
    return (
      <GameBoard
        view={flow.view}
        myIndex={flow.seat}
        onAction={flow.sendAction}
        isGameOver
        onShowResults={() => setShowResults(true)}
      />
    );
  }

  return <GameBoard view={flow.view} myIndex={flow.seat} onAction={flow.sendAction} />;
}
