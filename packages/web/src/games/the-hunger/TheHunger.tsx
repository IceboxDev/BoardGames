import type { HungerConfig } from "@boardgames/core/games/the-hunger/manifest";
import type {
  Action,
  HungerPlayerView,
  HungerResult,
} from "@boardgames/core/games/the-hunger/types";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen, { type SoloSetup } from "./components/SetupScreen";

const toSoloStart = (setup: SoloSetup): SoloStart => {
  const config: HungerConfig = {
    mode: setup.mode,
    beginnerSafeMountains: setup.beginnerSafeMountains,
  };
  return { seats: againstAi(setup.playerCount, setup.strategy), config };
};

export default function TheHunger({ source }: GameComponentProps) {
  const flow = useSessionFlow<HungerPlayerView, Action, HungerResult, SoloSetup>(source, {
    toSoloStart,
  });

  if (flow.phase === "setup") return <SetupScreen onStart={flow.start} />;
  if (!flow.view) return <BoardFallback />;

  // Room players by name; AI seats (and solo) are labelled by their vampire.
  const names = flow.seats.map((s) => (source === "mp" && s.kind === "human" ? s.name : null));

  if (flow.phase === "finished" && flow.result) {
    return (
      <GameOverScreen
        view={flow.view}
        result={flow.result}
        names={names}
        actions={flow.endActions}
      />
    );
  }

  return (
    <GameBoard
      view={flow.view}
      legalActions={flow.legalActions}
      isMyTurn={flow.isMyTurn}
      isAiThinking={flow.isAiThinking}
      playerNames={names}
      onAction={flow.sendAction}
    />
  );
}
