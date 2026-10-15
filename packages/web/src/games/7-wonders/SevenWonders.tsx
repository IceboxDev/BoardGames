import type {
  SevenWondersPlayerView,
  SevenWondersResult,
} from "@boardgames/core/games/7-wonders/machine";
import type { SevenWondersConfig } from "@boardgames/core/games/7-wonders/manifest";
import type { SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { useCallback, useState } from "react";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import LostGameModal from "./components/LostGameModal";
import SetupScreen from "./components/SetupScreen";
import SidePicker from "./components/SidePicker";

interface SevenWondersSetup {
  playerCount: number;
  strategy: string;
  edifice: boolean;
}

// Sides are chosen in the game itself, once each player has seen their wonder.
const toSoloStart = ({ playerCount, strategy, edifice }: SevenWondersSetup): SoloStart => {
  const config: Partial<SevenWondersConfig> = { edifice, sideMode: "choose" };
  return { seats: againstAi(playerCount, strategy), config };
};

export default function SevenWonders({ source }: GameComponentProps) {
  const flow = useSessionFlow<
    SevenWondersPlayerView,
    SevenWondersAction,
    SevenWondersResult,
    SevenWondersSetup
  >(source, { toSoloStart });
  // At the end the last war plays out on the board, then the results open by
  // themselves (once); from there the final board is one button away.
  const [showResults, setShowResults] = useState(false);
  const [resultsSeen, setResultsSeen] = useState(false);
  const openResults = useCallback(() => {
    setShowResults(true);
    setResultsSeen(true);
  }, []);

  if (flow.phase === "setup") {
    return (
      <SetupScreen
        onStart={(setup) => {
          setShowResults(false);
          setResultsSeen(false);
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
          view={flow.view}
          myIndex={flow.seat}
          seatNames={flow.seatNames}
          actions={[
            ...flow.endActions.map((a) => ({
              ...a,
              onClick: () => {
                setShowResults(false);
                setResultsSeen(false);
                a.onClick();
              },
            })),
            {
              label: "View the final board",
              variant: "secondary" as const,
              onClick: () => setShowResults(false),
            },
          ]}
        />
      );
    }
    return (
      <GameBoard
        view={flow.view}
        myIndex={flow.seat}
        seatNames={flow.seatNames}
        legalActions={[]}
        onAction={flow.sendAction}
        isGameOver
        onShowResults={openResults}
        autoShowResults={!resultsSeen}
      />
    );
  }

  return (
    <>
      <GameBoard
        view={flow.view}
        myIndex={flow.seat}
        seatNames={flow.seatNames}
        legalActions={flow.legalActions}
        onAction={flow.sendAction}
      />
      {/* Before Age I: the side choice, over the game itself. */}
      {flow.view.phase === "choosing-sides" && (
        <SidePicker
          view={flow.view}
          myIndex={flow.seat}
          seatNames={flow.seatNames}
          onAction={flow.sendAction}
        />
      )}
      {flow.error === SESSION_GONE && (
        <LostGameModal
          onPlayAgain={flow.playAgain}
          onChangeSetup={flow.changeSetup}
          onMenu={flow.backToMenu}
        />
      )}
    </>
  );
}

/** What the server answers a move for a game it no longer holds. */
const SESSION_GONE = "Session not found";
