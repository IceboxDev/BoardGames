import type {
  Action,
  SensoPlayerView,
  SensoResult,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { BoardFallback } from "../../components/RouteFallback";
import { againstAi, type SoloStart, useSessionFlow } from "../../hooks/useSessionFlow";
import type { GameComponentProps } from "../types";
import "./senso.css";
import GameBoard from "./components/GameBoard";
import GameOverScreen from "./components/GameOverScreen";
import SetupScreen from "./components/SetupScreen";

interface SensoSetup {
  playerCount: number;
  strategy: string;
}

const toSoloStart = ({ playerCount, strategy }: SensoSetup): SoloStart => ({
  seats: againstAi(playerCount, strategy),
});

export default function Senso({ source }: GameComponentProps) {
  const flow = useSessionFlow<SensoPlayerView, Action, SensoResult, SensoSetup>(source, {
    toSoloStart,
  });

  if (flow.phase === "setup") {
    return (
      <SetupScreen onStart={(playerCount, strategy) => flow.start({ playerCount, strategy })} />
    );
  }
  if (!flow.view) return <BoardFallback />;

  // Room players by name; AI seats (and solo) are labelled by their faction.
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
