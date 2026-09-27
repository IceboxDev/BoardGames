import type {
  SevenWondersPlayerView,
  SevenWondersResult,
} from "@boardgames/core/games/7-wonders/machine";
import type { SevenWondersConfig } from "@boardgames/core/games/7-wonders/manifest";
import type { SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { useState } from "react";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

interface SevenWondersSetup {
  playerCount: number;
  strategy: string;
  edifice: boolean;
}

const toSoloStart = ({ playerCount, strategy, edifice }: SevenWondersSetup): SoloStart => {
  const config: Partial<SevenWondersConfig> = { edifice };
  return { seats: againstAi(playerCount, strategy), config };
};

export default function SevenWonders({ source }: GameComponentProps) {
  const flow = useSessionFlow<
    SevenWondersPlayerView,
    SevenWondersAction,
    SevenWondersResult,
    SevenWondersSetup
  >(source, { toSoloStart });
  // The final board stays up until the player asks for the results.
  const [showResults, setShowResults] = useState(false);

  if (flow.phase === "setup") {
    return (
      <SetupScreen
        onStart={(setup) => {
          setShowResults(false);
          flow.start(setup);
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
          seatNames={flow.seatNames}
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
        legalActions={[]}
        onAction={flow.sendAction}
        isGameOver
        onShowResults={() => setShowResults(true)}
      />
    );
  }

  return (
    <GameBoard
      view={flow.view}
      myIndex={flow.seat}
      legalActions={flow.legalActions}
      onAction={flow.sendAction}
    />
  );
}
